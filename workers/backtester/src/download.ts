import { parseArgs } from "node:util";
import { downloadSymbol } from "./downloader.js";

const DEFAULT_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];

const { values } = parseArgs({
  options: {
    symbol: { type: "string" },
    from: { type: "string" },
    to: { type: "string" },
  },
});

if (!values.from || !values.to) {
  console.error("Usage: npx tsx src/download.ts --from YYYY-MM-DD --to YYYY-MM-DD [--symbol BTCUSDT]");
  process.exit(1);
}

const symbols = values.symbol ? [values.symbol.toUpperCase()] : DEFAULT_SYMBOLS;
const from = new Date(values.from + "T00:00:00Z");
const to = new Date(values.to + "T23:59:59Z");

const startTime = performance.now();

async function main() {
  const rateLimitMs = process.env.BINANCE_RATE_LIMIT_MS ?? "2000";
  const dayDelayMs = process.env.BINANCE_DAY_DELAY_MS ?? "5000";
  console.log(`Download: ${symbols.join(", ")} from ${values.from} to ${values.to}`);
  console.log(`Rate limit: ${rateLimitMs}ms between batches, ${dayDelayMs}ms between days\n`);

  for (const symbol of symbols) {
    console.log(`Downloading ${symbol}...`);
    await downloadSymbol(symbol, from, to);
  }

  const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
  console.log(`\nDownload complete in ${elapsed}s.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
