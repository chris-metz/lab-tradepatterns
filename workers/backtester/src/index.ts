import dotenv from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env") });

import { parseArgs } from "node:util";
import { createDb } from "@tradepatterns/shared";
import { fetchKlines } from "./binance-rest.js";
import { getMissingDays, cacheDay } from "./kline-cache.js";
import { getPattern } from "./patterns/index.js";
import type { RawKline } from "./binance-rest.js";

const DEFAULT_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];

const { values } = parseArgs({
  options: {
    symbol: { type: "string" },
    from: { type: "string" },
    to: { type: "string" },
    pattern: { type: "string", default: "rapid-drop" },
    "dry-run": { type: "boolean", default: false },
  },
});

if (!values.from || !values.to) {
  console.error("Usage: npx tsx src/index.ts --from YYYY-MM-DD --to YYYY-MM-DD [--symbol BTCUSDT] [--pattern rapid-drop] [--dry-run]");
  process.exit(1);
}

const patternModule = getPattern(values.pattern!);
const symbols = values.symbol ? [values.symbol.toUpperCase()] : DEFAULT_SYMBOLS;
const from = new Date(values.from + "T00:00:00Z");
const to = new Date(values.to + "T23:59:59Z");
const dryRun = values["dry-run"] ?? false;

const startTime = performance.now();

async function downloadSymbol(symbol: string): Promise<void> {
  const extendedTo = new Date(to.getTime() + patternModule.trailingSeconds * 1000);
  const missing = await getMissingDays(symbol, from, extendedTo);

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

async function main() {
  console.log(`Backtest [${patternModule.name}]: ${symbols.join(", ")} from ${values.from} to ${values.to}${dryRun ? " (dry-run)" : ""}\n`);

  // Phase 1: Download
  for (const symbol of symbols) {
    console.log(`Downloading ${symbol}...`);
    await downloadSymbol(symbol);
  }

  if (dryRun) {
    const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
    console.log(`\nDry-run complete in ${elapsed}s. Data cached, no analysis performed.`);
    process.exit(0);
  }

  // Phase 2: Analysis + Persist
  const db = createDb(process.env.DATABASE_URL!);

  for (const symbol of symbols) {
    console.log(`\nAnalyzing ${symbol} [${patternModule.name}]...`);
    const results = await patternModule.run(symbol, from, to);

    console.log(`\nPersisting results for ${symbol}...`);
    await patternModule.persist(db, symbol, from, to, results);
  }

  // Summary
  const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
  console.log(`\nBacktest complete in ${elapsed}s.`);

  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
