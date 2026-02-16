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

```bash
# Daten laden und analysieren (default: rapid-drop Pattern)
npx tsx workers/backtester/src/index.ts --from 2024-08-01 --to 2024-08-31 --symbol BTCUSDT

# Bestimmtes Pattern wählen
npx tsx workers/backtester/src/index.ts --from 2024-08-01 --to 2024-08-31 --pattern rapid-drop

# Nur Analyse, ohne DB-Speicherung
npx tsx workers/backtester/src/index.ts --from 2024-08-01 --to 2024-08-31 --symbol BTCUSDT --no-persist

# Nur Daten vorladen (ohne Analyse)
npx tsx workers/backtester/src/index.ts --from 2024-08-01 --to 2024-08-31 --dry-run
```

Flags:
- `--from` / `--to` – Zeitraum (YYYY-MM-DD, Pflicht)
- `--symbol` – Einzelnes Symbol (default: BTCUSDT, ETHUSDT, SOLUSDT)
- `--pattern` – Pattern-Modul (default: `rapid-drop`)
- `--no-persist` – Analyse ohne DB-Speicherung (nur Konsolen-Output)
- `--dry-run` – Nur Download + Cache, keine Analyse

Analyse läuft Tag-für-Tag. Bereits vorhandene Config+Symbol+Tag-Kombinationen werden beim Persistieren übersprungen, sodass Läufe inkrementell erweitert werden können (mehr Tage oder neue Configs).

Pro Event werden outcome-basierte Metriken berechnet (1h Beobachtungsfenster nach Trigger):
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

## DB-Schema

```bash
# Schema-Änderungen pushen
cd packages/shared && npx drizzle-kit push
```

## Tech-Stack

- TypeScript
- Next.js (App Router)
- Binance REST API (1s-Klines)
- PostgreSQL + Drizzle ORM
