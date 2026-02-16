import {
  RapidDropDetector,
  type RapidDropDetectorConfig,
  type RapidDropEvent,
  type PricePoint,
  createDb,
  schema,
} from "@tradepatterns/shared";
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

async function run(symbol: string, from: Date, to: Date): Promise<BacktestResult[]> {
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

  let dayCount = 0;
  for await (const { date, klines } of loadKlines(symbol, from, extendedTo)) {
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
    dayCount++;
    const configSummary = results
      .map((r) => `${r.config.windowSeconds}s/${r.config.dropPercent}%: ${r.events.length}`)
      .join(", ");
    console.log(`  [${date}] ${klines.length} klines processed (${configSummary})`);
  }

  console.log(`\nProcessed ${dayCount} days for ${symbol}`);
  return results;
}

async function persist(
  db: ReturnType<typeof createDb>,
  symbol: string,
  from: Date,
  to: Date,
  results: unknown,
): Promise<void> {
  const typedResults = results as BacktestResult[];

  for (const result of typedResults) {
    const { config, events } = result;

    await db.transaction(async (tx) => {
      const [backTestRun] = await tx
        .insert(schema.backtestRapidDropRuns)
        .values({
          symbol,
          fromTime: from,
          toTime: to,
          windowSeconds: config.windowSeconds,
          dropPercent: config.dropPercent,
          recordAfterSeconds: config.recordAfterSeconds,
          cooldownSeconds: config.cooldownSeconds,
          eventsFound: events.length,
        })
        .returning({ id: schema.backtestRapidDropRuns.id });

      for (const event of events) {
        const [inserted] = await tx
          .insert(schema.backtestRapidDropEvents)
          .values({
            runId: backTestRun.id,
            symbol: event.symbol,
            triggerPrice: event.triggerPrice,
            triggerTimestamp: new Date(event.triggerTimestamp),
            windowHigh: event.windowHigh,
            dropPercent: event.dropPercent,
            configDropPercent: event.configDropPercent,
            lowestPrice: event.lowestPrice,
            lowestPriceTimestamp: new Date(event.lowestPriceTimestamp),
            windowSeconds: event.windowSeconds,
          })
          .returning({ id: schema.backtestRapidDropEvents.id });

        const pricePointRows = [
          ...event.pricesBefore.map((p) => ({
            eventId: inserted.id,
            phase: "before" as const,
            timestamp: new Date(p.timestamp),
            price: p.price,
          })),
          ...event.pricesAfter.map((p) => ({
            eventId: inserted.id,
            phase: "after" as const,
            timestamp: new Date(p.timestamp),
            price: p.price,
          })),
        ];

        if (pricePointRows.length > 0) {
          const BATCH_SIZE = 500;
          for (let i = 0; i < pricePointRows.length; i += BATCH_SIZE) {
            const batch = pricePointRows.slice(i, i + BATCH_SIZE);
            await tx.insert(schema.backtestRapidDropPricePoints).values(batch);
          }
        }
      }

      console.log(
        `  Run persisted: ${config.windowSeconds}s/${config.dropPercent}% → ${events.length} events (${backTestRun.id})`,
      );
    });
  }
}

export const rapidDrop: PatternModule = {
  name: "rapid-drop",
  trailingSeconds: MAX_TRAILING_SECONDS,
  run,
  persist,
};
