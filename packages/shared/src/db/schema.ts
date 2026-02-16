import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  doublePrecision,
  timestamp,
  integer,
  index,
} from "drizzle-orm/pg-core";

export const pricePointPhase = pgEnum("price_point_phase", [
  "before",
  "after",
]);

export const backtestRapidDropRuns = pgTable("backtest_rapid_drop_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  symbol: varchar("symbol", { length: 20 }).notNull(),
  fromTime: timestamp("from_time", { withTimezone: true }).notNull(),
  toTime: timestamp("to_time", { withTimezone: true }).notNull(),
  windowSeconds: integer("window_seconds").notNull(),
  dropPercent: doublePrecision("drop_percent").notNull(),
  recordAfterSeconds: integer("record_after_seconds").notNull(),
  cooldownSeconds: integer("cooldown_seconds").notNull(),
  eventsFound: integer("events_found").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const backtestRapidDropEvents = pgTable("backtest_rapid_drop_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  runId: uuid("run_id")
    .notNull()
    .references(() => backtestRapidDropRuns.id),
  symbol: varchar("symbol", { length: 20 }).notNull(),
  triggerPrice: doublePrecision("trigger_price").notNull(),
  triggerTimestamp: timestamp("trigger_timestamp", { withTimezone: true }).notNull(),
  windowHigh: doublePrecision("window_high").notNull(),
  dropPercent: doublePrecision("drop_percent").notNull(),
  configDropPercent: doublePrecision("config_drop_percent").notNull(),
  lowestPrice: doublePrecision("lowest_price").notNull(),
  lowestPriceTimestamp: timestamp("lowest_price_timestamp", { withTimezone: true }).notNull(),
  windowSeconds: integer("window_seconds").notNull(),
});

export const backtestRapidDropPricePoints = pgTable(
  "backtest_rapid_drop_price_points",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => backtestRapidDropEvents.id),
    phase: pricePointPhase("phase").notNull(),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
    price: doublePrecision("price").notNull(),
  },
  (table) => [
    index("bt_rapid_drop_pp_event_id_idx").on(table.eventId),
    index("bt_rapid_drop_pp_event_phase_idx").on(
      table.eventId,
      table.phase,
    ),
  ],
);
