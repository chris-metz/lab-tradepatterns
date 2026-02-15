import dotenv from "dotenv";
dotenv.config({ path: "../../.env" });

import { BinanceWS } from "./binance-ws.js";
import {
  RapidDropDetector,
  type RapidDropDetectorConfig,
} from "./patterns/rapid-drop/detector.js";
import { createDb, schema } from "@tradepatterns/shared";
import type { RapidDropEvent } from "@tradepatterns/shared";

const db = createDb(process.env.DATABASE_URL!);

const SYMBOLS = ["btcusdt", "ethusdt", "solusdt"];

const DETECTOR_CONFIGS: RapidDropDetectorConfig[] = [
  { windowSeconds: 30, dropPercent: 2, recordAfterSeconds: 600, cooldownSeconds: 600 },
  { windowSeconds: 60, dropPercent: 2, recordAfterSeconds: 600, cooldownSeconds: 600 },
  { windowSeconds: 300, dropPercent: 5, recordAfterSeconds: 600, cooldownSeconds: 600 },
];

async function handleRapidDropEvent(event: RapidDropEvent) {
  console.log(
    `\n=== Rapid Drop: ${event.symbol} -${event.dropPercent.toFixed(2)}% (${event.windowSeconds}s window) ===`,
  );

  try {
    const [inserted] = await db
      .insert(schema.rapidDropEvents)
      .values({
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
      .returning({ id: schema.rapidDropEvents.id });

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
      await db.insert(schema.rapidDropPricePoints).values(pricePointRows);
    }

    console.log(
      `Persisted: ${inserted.id} (${event.pricesBefore.length} before + ${event.pricesAfter.length} after = ${pricePointRows.length} price points)`,
    );
  } catch (err) {
    console.error("Failed to persist event:", err);
  }
}

for (const symbol of SYMBOLS) {
  const detectors = DETECTOR_CONFIGS.map(
    (config) => new RapidDropDetector(config, handleRapidDropEvent),
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
