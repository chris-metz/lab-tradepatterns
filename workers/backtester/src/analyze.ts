import dotenv from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env") });

import { parseArgs } from "node:util";
import { createDb, schema } from "@tradepatterns/shared";
import { eq, and } from "drizzle-orm";

const { values } = parseArgs({
  options: {
    symbol: { type: "string" },
    pattern: { type: "string", default: "rapid-drop" },
    fee: { type: "string", default: "0.2" },
  },
});

const fee = parseFloat(values.fee!);
const table = schema.backtestRapidDropRuns;

const db = createDb(process.env.DATABASE_URL!);

interface ConfigGroup {
  windowSeconds: number;
  dropPercent: number;
  recordAfterSeconds: number;
  cooldownSeconds: number;
  totalEvents: number;
  totalProfitable: number;
  totalDays: number;
  avgMaxProfit: number;
  medianMaxProfit: number;
  avgMaxDrawdown: number;
  maxMaxDrawdown: number;
  avgTimeToBreakeven: number | null;
  avgEndResult: number;
}

async function main() {
  const conditions = values.symbol
    ? [eq(table.symbol, values.symbol.toUpperCase())]
    : [];

  // Only query rows with recordAfterSeconds=3600 (new outcome-based runs)
  conditions.push(eq(table.recordAfterSeconds, 3600));

  const rows = await db
    .select({
      windowSeconds: table.windowSeconds,
      dropPercent: table.dropPercent,
      recordAfterSeconds: table.recordAfterSeconds,
      cooldownSeconds: table.cooldownSeconds,
      eventsFound: table.eventsFound,
      profitableCount: table.profitableCount,
      avgMaxProfit: table.avgMaxProfit,
      medianMaxProfit: table.medianMaxProfit,
      avgMaxDrawdown: table.avgMaxDrawdown,
      maxMaxDrawdown: table.maxMaxDrawdown,
      medianMaxDrawdown: table.medianMaxDrawdown,
      avgTimeToBreakeven: table.avgTimeToBreakeven,
      medianTimeToBreakeven: table.medianTimeToBreakeven,
      avgTimeToMaxProfit: table.avgTimeToMaxProfit,
      avgEndResult: table.avgEndResult,
      symbol: table.symbol,
    })
    .from(table)
    .where(conditions.length > 1 ? and(...conditions) : conditions[0]);

  if (rows.length === 0) {
    console.log("No data found. Run the backtester first.");
    process.exit(0);
  }

  // Group by config
  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = `${row.windowSeconds}|${row.dropPercent}|${row.recordAfterSeconds}|${row.cooldownSeconds}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  const results: ConfigGroup[] = [];

  for (const [, configRows] of groups) {
    const first = configRows[0];
    let totalEvents = 0;
    let totalProfitable = 0;
    let weightedMaxProfit = 0;
    let weightedMedianMaxProfit = 0;
    let weightedMaxDrawdown = 0;
    let worstMaxDrawdown = 0;
    let weightedTimeToBreakeven = 0;
    let breakevenWeight = 0;
    let weightedEndResult = 0;
    let totalDays = configRows.length;

    for (const row of configRows) {
      const n = row.eventsFound;
      totalEvents += n;
      totalProfitable += row.profitableCount ?? 0;

      if (n > 0) {
        weightedMaxProfit += (row.avgMaxProfit ?? 0) * n;
        weightedMedianMaxProfit += (row.medianMaxProfit ?? 0) * n;
        weightedMaxDrawdown += (row.avgMaxDrawdown ?? 0) * n;
        weightedEndResult += (row.avgEndResult ?? 0) * n;

        if ((row.maxMaxDrawdown ?? 0) > worstMaxDrawdown) {
          worstMaxDrawdown = row.maxMaxDrawdown ?? 0;
        }

        if (row.avgTimeToBreakeven !== null && row.profitableCount !== null && row.profitableCount > 0) {
          weightedTimeToBreakeven += row.avgTimeToBreakeven * row.profitableCount;
          breakevenWeight += row.profitableCount;
        }
      }
    }

    if (totalEvents === 0) continue;

    results.push({
      windowSeconds: first.windowSeconds,
      dropPercent: first.dropPercent,
      recordAfterSeconds: first.recordAfterSeconds,
      cooldownSeconds: first.cooldownSeconds,
      totalEvents,
      totalProfitable,
      totalDays,
      avgMaxProfit: weightedMaxProfit / totalEvents,
      medianMaxProfit: weightedMedianMaxProfit / totalEvents,
      avgMaxDrawdown: weightedMaxDrawdown / totalEvents,
      maxMaxDrawdown: worstMaxDrawdown,
      avgTimeToBreakeven: breakevenWeight > 0 ? weightedTimeToBreakeven / breakevenWeight : null,
      avgEndResult: weightedEndResult / totalEvents,
    });
  }

  // Compute expectancy and sort
  const enriched = results.map((r) => {
    const winRate = r.totalProfitable / r.totalEvents;
    const lossRate = 1 - winRate;
    // Fee applies on buy + sell = 2x fee as percentage
    const totalFee = fee * 2;
    const feeAdjustedWinRate = Math.max(0, (r.totalProfitable / r.totalEvents) - 0);
    const expectancy = winRate * (r.avgMaxProfit - totalFee) - lossRate * r.avgMaxDrawdown;

    return { ...r, winRate, expectancy, totalFee };
  });

  enriched.sort((a, b) => b.expectancy - a.expectancy);

  // Print
  const symbolLabel = values.symbol ? values.symbol.toUpperCase() : "ALL";
  console.log(`\nAnalysis: ${symbolLabel} | Fee: ${fee}% per side | ${rows.length} day-rows\n`);

  console.log(
    padR("Config", 20) +
    padR("Days", 6) +
    padR("Events", 8) +
    padR("WinRate", 9) +
    padR("AvgProfit", 10) +
    padR("MedProfit", 10) +
    padR("AvgDD", 9) +
    padR("MaxDD", 9) +
    padR("AvgBE", 8) +
    padR("AvgEnd", 9) +
    padR("Expect", 9),
  );
  console.log("-".repeat(107));

  for (const r of enriched) {
    const config = `${r.windowSeconds}s/${r.dropPercent}%`;
    console.log(
      padR(config, 20) +
      padR(String(r.totalDays), 6) +
      padR(String(r.totalEvents), 8) +
      padR(`${(r.winRate * 100).toFixed(1)}%`, 9) +
      padR(`+${r.avgMaxProfit.toFixed(2)}%`, 10) +
      padR(`+${r.medianMaxProfit.toFixed(2)}%`, 10) +
      padR(`-${r.avgMaxDrawdown.toFixed(2)}%`, 9) +
      padR(`-${r.maxMaxDrawdown.toFixed(2)}%`, 9) +
      padR(r.avgTimeToBreakeven !== null ? `${r.avgTimeToBreakeven.toFixed(0)}s` : "N/A", 8) +
      padR(`${r.avgEndResult >= 0 ? "+" : ""}${r.avgEndResult.toFixed(2)}%`, 9) +
      padR(`${r.expectancy >= 0 ? "+" : ""}${r.expectancy.toFixed(3)}`, 9),
    );
  }

  console.log(`\nExpectancy = WinRate * (AvgMaxProfit - ${(fee * 2).toFixed(1)}% fee) - LossRate * AvgMaxDrawdown`);
  process.exit(0);
}

function padR(str: string, len: number): string {
  return str.padEnd(len);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
