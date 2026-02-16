import {
  RapidDropDetector,
  type RapidDropDetectorConfig,
  type RapidDropEvent,
  type PricePoint,
} from "@tradepatterns/shared";
import { loadKlines } from "./kline-cache.js";

export interface BacktestResult {
  config: RapidDropDetectorConfig;
  events: RapidDropEvent[];
}

const DETECTOR_CONFIGS: RapidDropDetectorConfig[] = [
  { windowSeconds: 30, dropPercent: 2, recordAfterSeconds: 600, cooldownSeconds: 600 },
  { windowSeconds: 60, dropPercent: 2, recordAfterSeconds: 600, cooldownSeconds: 600 },
  { windowSeconds: 300, dropPercent: 5, recordAfterSeconds: 600, cooldownSeconds: 600 },
];

export async function runBacktest(
  symbol: string,
  from: Date,
  to: Date,
): Promise<BacktestResult[]> {
  const maxRecordAfter = Math.max(...DETECTOR_CONFIGS.map((c) => c.recordAfterSeconds));

  // Extended end for data loading so last events can complete recording
  const extendedTo = new Date(to.getTime() + maxRecordAfter * 1000);

  const originalToMs = to.getTime();

  // Set up detectors with event collectors
  const results: BacktestResult[] = DETECTOR_CONFIGS.map((config) => ({
    config,
    events: [] as RapidDropEvent[],
  }));

  const detectors = DETECTOR_CONFIGS.map(
    (config, i) =>
      new RapidDropDetector(config, (event) => {
        // Only count events whose trigger is within the original range
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
