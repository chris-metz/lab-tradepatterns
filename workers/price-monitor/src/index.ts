import { BinanceWS } from "./binance-ws.js";
import { PatternDetector, type DetectorConfig } from "./pattern-detector.js";
import type { PatternEvent } from "@tradepatterns/shared";

const SYMBOLS = ["btcusdt", "ethusdt", "solusdt"];

const DETECTOR_CONFIGS: DetectorConfig[] = [
  { windowSeconds: 30, dropPercent: 2, recordAfterSeconds: 120, cooldownSeconds: 300 },
  { windowSeconds: 60, dropPercent: 2, recordAfterSeconds: 120, cooldownSeconds: 300 },
  { windowSeconds: 300, dropPercent: 5, recordAfterSeconds: 300, cooldownSeconds: 600 },
];

function handlePatternEvent(event: PatternEvent) {
  console.log(`\n=== Pattern Event ===`);
  console.log(`Symbol: ${event.symbol}`);
  console.log(`Window: ${event.windowSeconds}s`);
  console.log(`Drop: -${event.dropPercent.toFixed(2)}%`);
  console.log(`Trigger price: ${event.triggerPrice.toFixed(2)}`);
  console.log(`Prices before: ${event.pricesBefore.length}`);
  console.log(`Prices after: ${event.pricesAfter.length}`);

  const lastPrice = event.pricesAfter.at(-1);
  if (lastPrice) {
    const recovery =
      ((lastPrice.price - event.triggerPrice) / event.triggerPrice) * 100;
    console.log(
      `Price ${recovery >= 0 ? "recovered" : "continued down"}: ${recovery >= 0 ? "+" : ""}${recovery.toFixed(2)}%`,
    );
  }

  // TODO: persist to PostgreSQL
  console.log(`====================\n`);
}

for (const symbol of SYMBOLS) {
  const detectors = DETECTOR_CONFIGS.map(
    (config) => new PatternDetector(config, handlePatternEvent),
  );

  const ws = new BinanceWS(symbol);

  ws.on("price", (point) => {
    for (const detector of detectors) {
      detector.feed(point);
    }
  });

  console.log(
    `Starting ${symbol.toUpperCase()} with ${detectors.length} detector configs ` +
      `(${DETECTOR_CONFIGS.map((c) => `${c.windowSeconds}s/${c.dropPercent}%`).join(", ")})`,
  );
  ws.connect();
}
