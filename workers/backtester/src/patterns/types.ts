import type { createDb } from "@tradepatterns/shared";

export interface PatternModule {
  name: string;
  trailingSeconds: number;
  run(symbol: string, date: string): Promise<unknown>;
  persist(db: ReturnType<typeof createDb>, symbol: string, date: string, results: unknown): Promise<void>;
}
