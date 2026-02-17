import {
  pgTable,
  uuid,
  varchar,
  doublePrecision,
  timestamp,
  integer,
  date,
  index,
} from "drizzle-orm/pg-core";

export const backtestRapidDropRuns = pgTable("backtest_rapid_drop_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  symbol: varchar("symbol", { length: 20 }).notNull(),
  date: date("date").notNull(),
  windowSeconds: integer("window_seconds").notNull(),
  dropPercent: doublePrecision("drop_percent").notNull(),
  eventsFound: integer("events_found").notNull().default(0),
  profitableCount: integer("profitable_count"),
  avgMaxProfit: doublePrecision("avg_max_profit"),
  medianMaxProfit: doublePrecision("median_max_profit"),
  avgMaxDrawdown: doublePrecision("avg_max_drawdown"),
  maxMaxDrawdown: doublePrecision("max_max_drawdown"),
  medianMaxDrawdown: doublePrecision("median_max_drawdown"),
  avgTimeToBreakeven: doublePrecision("avg_time_to_breakeven"),
  medianTimeToBreakeven: doublePrecision("median_time_to_breakeven"),
  avgTimeToMaxProfit: doublePrecision("avg_time_to_max_profit"),
  avgEndResult: doublePrecision("avg_end_result"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_rapid_drop_symbol_date").on(table.symbol, table.date),
]);
