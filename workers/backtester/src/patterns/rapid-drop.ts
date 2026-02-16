import { readFileSync } from "node:fs";
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
import type { PatternModule, PatternConfigFile } from "./types.js";

interface BacktestResult {
  config: RapidDropDetectorConfig;
  events: RapidDropEvent[];
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

interface EventOutcome {
  maxProfit: number;
  maxDrawdown: number;
  timeToBreakeven: number | null;
  timeToMaxProfit: number;
  endResult: number;
}

function computeEventOutcome(event: RapidDropEvent): EventOutcome | null {
  if (event.pricesAfter.length === 0) return null;

  let maxProfit = -Infinity;
  let maxDrawdown = 0;
  let timeToBreakeven: number | null = null;
  let maxProfitTimestamp = event.triggerTimestamp;

  for (const p of event.pricesAfter) {
    const change = ((p.price - event.triggerPrice) / event.triggerPrice) * 100;
    const drawdown = ((event.triggerPrice - p.price) / event.triggerPrice) * 100;

    if (change > maxProfit) {
      maxProfit = change;
      maxProfitTimestamp = p.timestamp;
    }
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }
    if (timeToBreakeven === null && p.price > event.triggerPrice) {
      timeToBreakeven = (p.timestamp - event.triggerTimestamp) / 1000;
    }
  }

  const lastPrice = event.pricesAfter[event.pricesAfter.length - 1].price;
  const endResult = ((lastPrice - event.triggerPrice) / event.triggerPrice) * 100;
  const timeToMaxProfit = (maxProfitTimestamp - event.triggerTimestamp) / 1000;

  return {
    maxProfit: maxProfit === -Infinity ? 0 : maxProfit,
    maxDrawdown,
    timeToBreakeven,
    timeToMaxProfit,
    endResult,
  };
}

function computeAggregates(events: RapidDropEvent[]) {
  if (events.length === 0) {
    return {
      profitableCount: null,
      avgMaxProfit: null, medianMaxProfit: null,
      avgMaxDrawdown: null, maxMaxDrawdown: null, medianMaxDrawdown: null,
      avgTimeToBreakeven: null, medianTimeToBreakeven: null,
      avgTimeToMaxProfit: null, avgEndResult: null,
    };
  }

  const outcomes = events.map(computeEventOutcome).filter((o): o is EventOutcome => o !== null);
  if (outcomes.length === 0) {
    return {
      profitableCount: null,
      avgMaxProfit: null, medianMaxProfit: null,
      avgMaxDrawdown: null, maxMaxDrawdown: null, medianMaxDrawdown: null,
      avgTimeToBreakeven: null, medianTimeToBreakeven: null,
      avgTimeToMaxProfit: null, avgEndResult: null,
    };
  }

  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;

  const maxProfits = outcomes.map((o) => o.maxProfit);
  const maxDrawdowns = outcomes.map((o) => o.maxDrawdown);
  const breakevenTimes = outcomes.filter((o) => o.timeToBreakeven !== null).map((o) => o.timeToBreakeven!);
  const endResults = outcomes.map((o) => o.endResult);
  const timesToMaxProfit = outcomes.map((o) => o.timeToMaxProfit);

  return {
    profitableCount: breakevenTimes.length,
    avgMaxProfit: avg(maxProfits),
    medianMaxProfit: median(maxProfits),
    avgMaxDrawdown: avg(maxDrawdowns),
    maxMaxDrawdown: Math.max(...maxDrawdowns),
    medianMaxDrawdown: median(maxDrawdowns),
    avgTimeToBreakeven: breakevenTimes.length > 0 ? avg(breakevenTimes) : null,
    medianTimeToBreakeven: breakevenTimes.length > 0 ? median(breakevenTimes) : null,
    avgTimeToMaxProfit: avg(timesToMaxProfit),
    avgEndResult: avg(endResults),
  };
}

function printEventSummary(event: RapidDropEvent, index: number): void {
  const triggerTime = new Date(event.triggerTimestamp).toISOString().slice(11, 19);
  const outcome = computeEventOutcome(event);

  console.log(`  Event ${index + 1}: Drop -${event.dropPercent.toFixed(1)}% erkannt bei ${event.triggerPrice.toFixed(2)} (${triggerTime} UTC)`);

  if (!outcome) return;

  const breakevenStr = outcome.timeToBreakeven !== null
    ? `${outcome.timeToBreakeven.toFixed(0)}s`
    : "nie";
  console.log(`    MaxProfit: +${outcome.maxProfit.toFixed(2)}% (nach ${outcome.timeToMaxProfit.toFixed(0)}s) | MaxDrawdown: -${outcome.maxDrawdown.toFixed(2)}% | Breakeven: ${breakevenStr} | End: ${outcome.endResult >= 0 ? "+" : ""}${outcome.endResult.toFixed(2)}%`);
}

function printConfigSummary(result: BacktestResult): void {
  const { config, events } = result;
  if (events.length === 0) return;

  const aggregates = computeAggregates(events);
  const winRate = aggregates.profitableCount !== null
    ? ((aggregates.profitableCount / events.length) * 100).toFixed(1)
    : "N/A";

  console.log(`\n  Config ${config.windowSeconds}s / ${config.dropPercent}% (${events.length} Events, WinRate: ${winRate}%):`);
  for (let i = 0; i < events.length; i++) {
    printEventSummary(events[i], i);
  }

  if (aggregates.avgMaxProfit !== null) {
    console.log(`  --- Aggregiert: AvgMaxProfit +${aggregates.avgMaxProfit.toFixed(2)}% | AvgMaxDD -${aggregates.avgMaxDrawdown!.toFixed(2)}% | AvgBreakeven ${aggregates.avgTimeToBreakeven !== null ? aggregates.avgTimeToBreakeven.toFixed(0) + "s" : "N/A"} | AvgEnd ${aggregates.avgEndResult! >= 0 ? "+" : ""}${aggregates.avgEndResult!.toFixed(2)}%`);
  }
}

function loadConfigs(configPath: string): PatternConfigFile {
  const raw = readFileSync(configPath, "utf-8");
  const json = JSON.parse(raw);
  return {
    from: json.from,
    to: json.to,
    configs: json.configs as RapidDropDetectorConfig[],
  };
}

function trailingSeconds(configs: unknown[]): number {
  const typed = configs as RapidDropDetectorConfig[];
  return Math.max(...typed.map((c) => c.recordAfterSeconds));
}

async function run(symbol: string, date: string, configs: unknown[]): Promise<BacktestResult[]> {
  const typedConfigs = configs as RapidDropDetectorConfig[];
  const maxTrailing = trailingSeconds(configs);

  const from = new Date(date + "T00:00:00Z");
  const to = new Date(date + "T23:59:59Z");
  const extendedTo = new Date(to.getTime() + maxTrailing * 1000);
  const originalToMs = to.getTime();

  const results: BacktestResult[] = typedConfigs.map((config) => ({
    config,
    events: [] as RapidDropEvent[],
  }));

  const detectors = typedConfigs.map(
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
  trailingSeconds,
  loadConfigs,
  run,
  persist,
};
