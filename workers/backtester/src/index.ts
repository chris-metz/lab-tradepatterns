import dotenv from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env") });

import { parseArgs } from "node:util";
import { createDb } from "@tradepatterns/shared";
import { downloadSymbol } from "./downloader.js";
import { getPattern } from "./patterns/index.js";

const DEFAULT_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];

const { values } = parseArgs({
  options: {
    symbol: { type: "string" },
    from: { type: "string" },
    to: { type: "string" },
    pattern: { type: "string", default: "rapid-drop" },
    "no-persist": { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
  },
});

if (!values.from || !values.to) {
  console.error("Usage: npx tsx src/index.ts --from YYYY-MM-DD --to YYYY-MM-DD [--symbol BTCUSDT] [--pattern rapid-drop] [--no-persist] [--dry-run]");
  process.exit(1);
}

const patternModule = getPattern(values.pattern!);
const symbols = values.symbol ? [values.symbol.toUpperCase()] : DEFAULT_SYMBOLS;
const dryRun = values["dry-run"] ?? false;
const noPersist = values["no-persist"] ?? false;

function generateDates(from: string, to: string): string[] {
  const dates: string[] = [];
  const current = new Date(from + "T00:00:00Z");
  const end = new Date(to + "T00:00:00Z");
  while (current <= end) {
    dates.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

const dates = generateDates(values.from!, values.to!);
const startTime = performance.now();

async function main() {
  const flags = [dryRun && "dry-run", noPersist && "no-persist"].filter(Boolean).join(", ");
  console.log(`Backtest [${patternModule.name}]: ${symbols.join(", ")} | ${dates.length} day(s) from ${values.from} to ${values.to}${flags ? ` (${flags})` : ""}\n`);

  // Phase 1: Download (full range + trailing for all symbols)
  const from = new Date(values.from + "T00:00:00Z");
  const to = new Date(values.to + "T23:59:59Z");
  const extendedTo = new Date(to.getTime() + patternModule.trailingSeconds * 1000);
  for (const symbol of symbols) {
    console.log(`Downloading ${symbol}...`);
    await downloadSymbol(symbol, from, extendedTo);
  }

  if (dryRun) {
    const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
    console.log(`\nDry-run complete in ${elapsed}s. Data cached, no analysis performed.`);
    process.exit(0);
  }

  // Phase 2: Analysis + Persist (day by day)
  const db = noPersist ? null : createDb(process.env.DATABASE_URL!);

  for (const symbol of symbols) {
    for (const date of dates) {
      console.log(`\nAnalyzing ${symbol} ${date} [${patternModule.name}]...`);
      const results = await patternModule.run(symbol, date);

      if (db) {
        await patternModule.persist(db, symbol, date, results);
      }
    }
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
