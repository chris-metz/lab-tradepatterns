import type { createDb } from "@tradepatterns/shared";

export interface PatternModule {
  name: string;
  trailingSeconds: number;
  run(symbol: string, from: Date, to: Date): Promise<unknown>;
  persist(db: ReturnType<typeof createDb>, symbol: string, from: Date, to: Date, results: unknown): Promise<void>;
}
