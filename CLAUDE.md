# Trade Patterns

## Konventionen

- Kommunikation auf Deutsch, Code und Commits auf Englisch
- Commit-Messages: Conventional Commits Format

## Wichtig

- Der Price Monitor läuft als systemd User-Service (`tradepatterns-monitor`)
- Nach Änderungen am Worker: `systemctl --user restart tradepatterns-monitor`
- `.env` im Projekt-Root mit `DATABASE_URL` wird benötigt (nicht im Repo)
- DB-Schema-Änderungen: `npx drizzle-kit push` aus `packages/shared` ausführen

## Architektur-Entscheidungen

- Jedes Pattern bekommt eigene DB-Tabellen, eigene Types und eigenes Modul unter `workers/price-monitor/src/patterns/`
- Kein generisches Pattern-System, kein JSONB – alles explizit und typisiert
- Price Points in eigener Tabelle pro Pattern (nicht als JSONB im Event)

## Offene Entscheidungen

- Charts-Library für Dashboard noch nicht gewählt
