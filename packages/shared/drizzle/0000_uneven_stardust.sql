CREATE TABLE "pattern_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"symbol" varchar(20) NOT NULL,
	"type" varchar(50) NOT NULL,
	"trigger_price" double precision NOT NULL,
	"trigger_timestamp" bigint NOT NULL,
	"window_high" double precision NOT NULL,
	"drop_percent" double precision NOT NULL,
	"config_drop_percent" double precision NOT NULL,
	"lowest_price" double precision NOT NULL,
	"lowest_price_timestamp" bigint NOT NULL,
	"window_seconds" integer NOT NULL,
	"prices_before" jsonb NOT NULL,
	"prices_after" jsonb NOT NULL
);
