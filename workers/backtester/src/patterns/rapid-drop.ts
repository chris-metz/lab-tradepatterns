import {
  RapidDropDetector,
  type RapidDropDetectorConfig,
  type RapidDropEvent,
  type PricePoint,
  createDb,
  schema,
} from "@tradepatterns/shared";
import { and, eq } from "drizzle-orm";
import { loadKlines } from "../kline-cache.js";
import type { PatternModule } from "./types.js";

interface BacktestResult {
  config: RapidDropDetectorConfig;
  events: RapidDropEvent[];
}

const DETECTOR_CONFIGS: RapidDropDetectorConfig[] = [
  { windowSeconds: 30, dropPercent: 2, recordAfterSeconds: 600, cooldownSeconds: 600 },
  { windowSeconds: 60, dropPercent: 2, recordAfterSeconds: 600, cooldownSeconds: 600 },
  { windowSeconds: 300, dropPercent: 5, recordAfterSeconds: 600, cooldownSeconds: 600 },
];

const MAX_TRAILING_SECONDS = Math.max(...DETECTOR_CONFIGS.map((c) => c.recordAfterSeconds));

const SUMMARY_INTERVALS = [60, 120, 300, 600]; // seconds after trigger

function printEventSummary(event: RapidDropEvent, index: number): void {
  const triggerTime = new Date(event.triggerTimestamp).toISOString().slice(11, 19);
  const drawdownFromTrigger = ((event.triggerPrice - event.lowestPrice) / event.triggerPrice) * 100;
  const drawdownDelay = ((event.lowestPriceTimestamp - event.triggerTimestamp) / 1000).toFixed(0);

  console.log(`  Event ${index + 1}: Drop -${event.dropPercent.toFixed(1)}% erkannt bei ${event.triggerPrice.toFixed(2)} (${triggerTime} UTC)`);
  console.log(`    Weiterer Drawdown nach Kauf: -${drawdownFromTrigger.toFixed(2)}% (Tief: ${event.lowestPrice.toFixed(2)} nach ${drawdownDelay}s)`);

  const recoveryParts: string[] = [];
  for (const seconds of SUMMARY_INTERVALS) {
    const targetTs = event.triggerTimestamp + seconds * 1000;
    const point = event.pricesAfter.reduce<PricePoint | null>((closest, p) => {
      if (!closest) return p;
      return Math.abs(p.timestamp - targetTs) < Math.abs(closest.timestamp - targetTs) ? p : closest;
    }, null);

    if (point) {
      const change = ((point.price - event.triggerPrice) / event.triggerPrice) * 100;
      const label = seconds >= 60 ? `${seconds / 60}min` : `${seconds}s`;
      recoveryParts.push(`${change >= 0 ? "+" : ""}${change.toFixed(2)}% nach ${label}`);
    }
  }

  if (recoveryParts.length > 0) {
    console.log(`    Recovery: ${recoveryParts.join(", ")}`);
  }
}

function printConfigSummary(result: BacktestResult): void {
  const { config, events } = result;
  if (events.length === 0) return;

  console.log(`\n  Config ${config.windowSeconds}s / ${config.dropPercent}% (${events.length} Events):`);
  for (let i = 0; i < events.length; i++) {
    printEventSummary(events[i], i);
  }
}

async function run(symbol: string, date: string): Promise<BacktestResult[]> {
  const from = new Date(date + "T00:00:00Z");
  const to = new Date(date + "T23:59:59Z");
  const extendedTo = new Date(to.getTime() + MAX_TRAILING_SECONDS * 1000);
  const originalToMs = to.getTime();

  const results: BacktestResult[] = DETECTOR_CONFIGS.map((config) => ({
    config,
    events: [] as RapidDropEvent[],
  }));

  const detectors = DETECTOR_CONFIGS.map(
    (config, i) =>
      new RapidDropDetector(config, (event) => {
        if (event.triggerTimestamp <= originalToMs) {
          results[i].events.push(event);
        }
      }),
  );

  for await (const { date: d, klines } of loadKlines(symbol, from, extendedTo)) {
    for (const kline of klines) {
      const point: PricePoint = {
        timestamp: kline.openTime,
        price: kline.close,
        symbol: symbol.toUpperCase(),
      };
      for (const detector of detectors) {
        detector.feed(point);
      }
    }
    const configSummary = results
      .map((r) => `${r.config.windowSeconds}s/${r.config.dropPercent}%: ${r.events.length}`)
      .join(", ");
    console.log(`  [${d}] ${klines.length} klines processed (${configSummary})`);
  }

  for (const result of results) {
    printConfigSummary(result);
  }

  return results;
}

function computeRecoveryAtInterval(event: RapidDropEvent, seconds: number): number | null {
  if (event.pricesAfter.length === 0) return null;
  const targetTs = event.triggerTimestamp + seconds * 1000;
  const point = event.pricesAfter.reduce((closest, p) =>
    Math.abs(p.timestamp - targetTs) < Math.abs(closest.timestamp - targetTs) ? p : closest,
  );
  return ((point.price - event.triggerPrice) / event.triggerPrice) * 100;
}

function computeAggregates(events: RapidDropEvent[]) {
  if (events.length === 0) {
    return {
      avgDrawdownAfterBuy: null,
      avgRecovery1min: null, avgRecovery2min: null, avgRecovery5min: null, avgRecovery10min: null,
      winRate1min: null, winRate2min: null, winRate5min: null, winRate10min: null,
    };
  }

  const drawdowns = events.map((e) => ((e.triggerPrice - e.lowestPrice) / e.triggerPrice) * 100);
  const r1 = events.map((e) => computeRecoveryAtInterval(e, 60));
  const r2 = events.map((e) => computeRecoveryAtInterval(e, 120));
  const r5 = events.map((e) => computeRecoveryAtInterval(e, 300));
  const r10 = events.map((e) => computeRecoveryAtInterval(e, 600));

  const avg = (arr: (number | null)[]) => {
    const valid = arr.filter((v): v is number => v !== null);
    return valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
  };

  const winRate = (arr: (number | null)[]) => {
    const valid = arr.filter((v): v is number => v !== null);
    return valid.length > 0 ? (valid.filter((v) => v > 0).length / valid.length) * 100 : null;
  };

  return {
    avgDrawdownAfterBuy: avg(drawdowns),
    avgRecovery1min: avg(r1), avgRecovery2min: avg(r2), avgRecovery5min: avg(r5), avgRecovery10min: avg(r10),
    winRate1min: winRate(r1), winRate2min: winRate(r2), winRate5min: winRate(r5), winRate10min: winRate(r10),
  };
}

function configKey(c: RapidDropDetectorConfig): string {
  return `${c.windowSeconds}|${c.dropPercent}|${c.recordAfterSeconds}|${c.cooldownSeconds}`;
}

async function persist(
  db: ReturnType<typeof createDb>,
  symbol: string,
  date: string,
  results: unknown,
): Promise<void> {
  const typedResults = results as BacktestResult[];

  // Check which configs already exist for this symbol+date
  const existing = await db
    .select({
      windowSeconds: schema.backtestRapidDropRuns.windowSeconds,
      dropPercent: schema.backtestRapidDropRuns.dropPercent,
      recordAfterSeconds: schema.backtestRapidDropRuns.recordAfterSeconds,
      cooldownSeconds: schema.backtestRapidDropRuns.cooldownSeconds,
    })
    .from(schema.backtestRapidDropRuns)
    .where(
      and(
        eq(schema.backtestRapidDropRuns.symbol, symbol),
        eq(schema.backtestRapidDropRuns.date, date),
      ),
    );

  const existingKeys = new Set(existing.map((e) => configKey(e as RapidDropDetectorConfig)));

  for (const result of typedResults) {
    const { config, events } = result;

    if (existingKeys.has(configKey(config))) {
      console.log(`  Skipped: ${config.windowSeconds}s/${config.dropPercent}% (already exists for ${date})`);
      continue;
    }

    const aggregates = computeAggregates(events);

    const [run] = await db
      .insert(schema.backtestRapidDropRuns)
      .values({
        symbol,
        date,
        windowSeconds: config.windowSeconds,
        dropPercent: config.dropPercent,
        recordAfterSeconds: config.recordAfterSeconds,
        cooldownSeconds: config.cooldownSeconds,
        eventsFound: events.length,
        ...aggregates,
      })
      .returning({ id: schema.backtestRapidDropRuns.id });

    console.log(
      `  Run persisted: ${config.windowSeconds}s/${config.dropPercent}% → ${events.length} events (${run.id})`,
    );
  }
}

export const rapidDrop: PatternModule = {
  name: "rapid-drop",
  trailingSeconds: MAX_TRAILING_SECONDS,
  run,
  persist,
};
