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

export const rapidDropEvents = pgTable("rapid_drop_events", {
  id: uuid("id").primaryKey().defaultRandom(),
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

export const rapidDropPricePoints = pgTable(
  "rapid_drop_price_points",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => rapidDropEvents.id),
    phase: pricePointPhase("phase").notNull(),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
    price: doublePrecision("price").notNull(),
  },
  (table) => [
    index("rapid_drop_price_points_event_id_idx").on(table.eventId),
    index("rapid_drop_price_points_event_phase_idx").on(
      table.eventId,
      table.phase,
    ),
  ],
);
