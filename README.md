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

## Backtester

```bash
# Daten laden und analysieren (default: rapid-drop Pattern)
npx tsx workers/backtester/src/index.ts --from 2024-08-01 --to 2024-08-31 --symbol BTCUSDT

# Bestimmtes Pattern wählen
npx tsx workers/backtester/src/index.ts --from 2024-08-01 --to 2024-08-31 --pattern rapid-drop

# Nur Daten downloaden (ohne Analyse)
npx tsx workers/backtester/src/index.ts --from 2024-08-01 --to 2024-08-31 --dry-run
```

Flags:
- `--from` / `--to` – Zeitraum (YYYY-MM-DD, Pflicht)
- `--symbol` – Einzelnes Symbol (default: BTCUSDT, ETHUSDT, SOLUSDT)
- `--pattern` – Pattern-Modul (default: `rapid-drop`)
- `--dry-run` – Nur Download + Cache, keine Analyse

Heruntergeladene Klines werden unter `workers/backtester/data/` als CSV gecacht und bei folgenden Runs wiederverwendet.

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
