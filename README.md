# Trade Patterns

Analyse von Trading-Patterns im Kryptomarkt. Erkennt Preismuster (z.B. schnelle Drops) in historischen Daten mittels Backtesting und zeichnet das Verhalten vor und nach dem Event auf.

## Struktur

- **apps/web** – Next.js Dashboard zur Visualisierung
- **workers/backtester** – CLI-Tool für historisches Backtesting mit Binance 1s-Klines
- **packages/shared** – Geteilte Types, DB-Schema und Pattern-Detektoren

## Setup

```bash
npm install
cp .env.example .env  # DATABASE_URL eintragen
```

## Download

```bash
# Kline-Daten herunterladen und als CSV cachen
npx tsx workers/backtester/src/download.ts --from 2024-08-01 --to 2024-08-31 --symbol BTCUSDT
```

Flags:
- `--from` / `--to` – Zeitraum (YYYY-MM-DD, Pflicht)
- `--symbol` – Einzelnes Symbol (default: BTCUSDT, ETHUSDT, SOLUSDT)

Heruntergeladene Klines werden unter `workers/backtester/data/` als CSV gecacht und bei folgenden Runs wiederverwendet.

## Backtester

Detector-Configs werden aus JSON-Dateien geladen (`workers/backtester/configs/{pattern}.json`). Die JSON kann optional `from`/`to`-Datumsangaben enthalten, die als Defaults dienen.

```bash
# Configs aus JSON laden (from/to aus JSON)
npx tsx workers/backtester/src/index.ts

# CLI überschreibt Datumsbereich aus JSON
npx tsx workers/backtester/src/index.ts --from 2024-08-01 --to 2024-08-31

# Eigene Config-Datei angeben
npx tsx workers/backtester/src/index.ts --config configs/rapid-drop.json --symbol BTCUSDT

# Nur Analyse, ohne DB-Speicherung
npx tsx workers/backtester/src/index.ts --from 2024-08-01 --to 2024-08-31 --no-persist

# Nur Daten vorladen (ohne Analyse)
npx tsx workers/backtester/src/index.ts --from 2024-08-01 --to 2024-08-31 --dry-run
```

Flags:
- `--config` – Pfad zur Config-JSON (default: `configs/{pattern}.json`)
- `--from` / `--to` – Zeitraum (YYYY-MM-DD, überschreibt JSON-Werte; Pflicht wenn nicht in JSON)
- `--symbol` – Einzelnes Symbol (default: BTCUSDT, ETHUSDT, SOLUSDT)
- `--pattern` – Pattern-Modul (default: `rapid-drop`)
- `--no-persist` – Analyse ohne DB-Speicherung (nur Konsolen-Output)
- `--dry-run` – Nur Download + Cache, keine Analyse

Analyse läuft Tag-für-Tag. Bereits vorhandene Config+Symbol+Tag-Kombinationen werden beim Persistieren übersprungen, sodass Läufe inkrementell erweitert werden können (mehr Tage oder neue Configs).

Pro Event werden outcome-basierte Metriken berechnet (1h Beobachtungsfenster nach Trigger, 10 Min Cooldown zwischen Events – beides Konstanten im Detector):
- **MaxProfit** – maximaler Gewinn (%)
- **MaxDrawdown** – maximaler Drawdown vom Triggerpreis (%)
- **TimeToBreakeven** – Sekunden bis Preis > Triggerpreis
- **EndResult** – P&L am Ende des Beobachtungsfensters (%)

## Analyse

```bash
# Aggregierte Auswertung über alle Tage (mit Expectancy, Win Rate)
npx tsx workers/backtester/src/analyze.ts

# Für ein bestimmtes Symbol
npx tsx workers/backtester/src/analyze.ts --symbol BTCUSDT

# Mit angepasster Fee (default: 0.2% pro Seite)
npx tsx workers/backtester/src/analyze.ts --fee 0.1
```

Flags:
- `--symbol` – Einzelnes Symbol (default: alle)
- `--pattern` – Pattern-Modul (default: `rapid-drop`)
- `--fee` – Fee pro Seite in % (default: `0.2`)

## Datenbank

### Quick-Access (für Ad-hoc-Abfragen)

Die `DATABASE_URL` steht in `.env` im Projekt-Root. Für schnelle Abfragen `psql` nutzen:

```bash
# .env laden und psql starten
source <(grep DATABASE_URL .env) && psql "$DATABASE_URL"

# Einzeiler-Query (ohne interaktive Session)
source <(grep DATABASE_URL .env) && psql "$DATABASE_URL" -c "SELECT count(*) FROM backtest_rapid_drop_runs"
```

### Tabellen & Spalten

| Tabelle | Beschreibung |
|---|---|
| `backtest_rapid_drop_runs` | Aggregierte Backtest-Ergebnisse für Rapid-Drop-Pattern (pro Tag/Config/Symbol) |

**`backtest_rapid_drop_runs`** – Spalten:

| Spalte | Typ | Beschreibung |
|---|---|---|
| `id` | uuid (PK) | Auto-generiert |
| `symbol` | varchar(20) | z.B. `BTCUSDT`, `ETHUSDT` |
| `date` | date | Tag der Analyse |
| `window_seconds` | integer | Zeitfenster für Drop-Erkennung |
| `drop_percent` | double | Schwellwert für Drop in % |
| `events_found` | integer | Anzahl erkannter Events am Tag |
| `profitable_count` | integer | Davon profitabel |
| `avg_max_profit` | double | Durchschn. max. Gewinn (%) |
| `median_max_profit` | double | Median max. Gewinn (%) |
| `avg_max_drawdown` | double | Durchschn. max. Drawdown (%) |
| `max_max_drawdown` | double | Größter Drawdown (%) |
| `median_max_drawdown` | double | Median Drawdown (%) |
| `avg_time_to_breakeven` | double | Durchschn. Sekunden bis Breakeven |
| `median_time_to_breakeven` | double | Median Sekunden bis Breakeven |
| `avg_time_to_max_profit` | double | Durchschn. Sekunden bis max. Gewinn |
| `avg_end_result` | double | Durchschn. P&L am Ende des Fensters (%) |
| `created_at` | timestamptz | Zeitpunkt des Eintrags |

Index: `idx_rapid_drop_symbol_date` auf `(symbol, date)`.

Neue Patterns bekommen eigene Tabellen nach dem Schema `backtest_{name}_runs`.

### Nützliche Queries

```sql
-- Welche Symbole sind in der DB?
SELECT DISTINCT symbol FROM backtest_rapid_drop_runs;

-- Welcher Zeitraum ist abgedeckt?
SELECT symbol, min(date), max(date), count(*) FROM backtest_rapid_drop_runs GROUP BY symbol;

-- Beste Configs nach avg Profit (mind. 100 Events)
SELECT window_seconds, drop_percent, count(*) as days,
       sum(events_found) as total_events,
       round(avg(avg_max_profit)::numeric, 3) as profit,
       round(avg(avg_max_drawdown)::numeric, 3) as drawdown
FROM backtest_rapid_drop_runs
WHERE events_found > 0
GROUP BY window_seconds, drop_percent
HAVING sum(events_found) >= 100
ORDER BY profit DESC;

-- Alle Tabellen im Schema anzeigen
SELECT tablename FROM pg_tables WHERE schemaname = 'public';
```

### Schema-Änderungen

```bash
cd packages/shared && npx drizzle-kit push
```

## Tech-Stack

- TypeScript
- Next.js (App Router)
- Binance REST API (1s-Klines)
- PostgreSQL + Drizzle ORM
