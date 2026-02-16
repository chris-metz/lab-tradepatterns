import { createDb, schema } from "@tradepatterns/shared";
import type { BacktestResult } from "./run-backtest.js";

export async function persistResults(
  db: ReturnType<typeof createDb>,
  symbol: string,
  from: Date,
  to: Date,
  results: BacktestResult[],
): Promise<void> {
  for (const result of results) {
    const { config, events } = result;

    await db.transaction(async (tx) => {
      const [run] = await tx
        .insert(schema.backtestRuns)
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
        .returning({ id: schema.backtestRuns.id });

      for (const event of events) {
        const [inserted] = await tx
          .insert(schema.backtestRapidDropEvents)
          .values({
            runId: run.id,
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
          // Insert in batches to avoid exceeding parameter limits
          const BATCH_SIZE = 500;
          for (let i = 0; i < pricePointRows.length; i += BATCH_SIZE) {
            const batch = pricePointRows.slice(i, i + BATCH_SIZE);
            await tx.insert(schema.backtestRapidDropPricePoints).values(batch);
          }
        }
      }

      console.log(
        `  Run persisted: ${config.windowSeconds}s/${config.dropPercent}% → ${events.length} events (${run.id})`,
      );
    });
  }
}
