import { fetchKlines } from "./binance-rest.js";
import { getMissingDays, cacheDay } from "./kline-cache.js";
import type { RawKline } from "./binance-rest.js";

export async function downloadSymbol(symbol: string, from: Date, to: Date): Promise<void> {
  const missing = await getMissingDays(symbol, from, to);

  if (missing.length === 0) {
    console.log(`  Cache complete, no downloads needed`);
    return;
  }

  console.log(`  Downloading ${missing.length} missing day(s)...`);

  for (const day of missing) {
    const dayStart = new Date(day + "T00:00:00Z").getTime();
    const dayEnd = new Date(day + "T23:59:59.999Z").getTime();

    const allKlines: RawKline[] = [];
    for await (const batch of fetchKlines(symbol, dayStart, dayEnd)) {
      allKlines.push(...batch);
    }

    await cacheDay(symbol, day, allKlines);
    console.log(`    ${day}: ${allKlines.length} klines cached`);
  }
}
