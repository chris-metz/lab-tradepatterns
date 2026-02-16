import type { createDb } from "@tradepatterns/shared";

export interface PatternConfigFile {
  from?: string;
  to?: string;
  configs: unknown[];
}

export interface PatternModule {
  name: string;
  trailingSeconds(configs: unknown[]): number;
  loadConfigs(configPath: string): PatternConfigFile;
  run(symbol: string, date: string, configs: unknown[]): Promise<unknown>;
  persist(db: ReturnType<typeof createDb>, symbol: string, date: string, results: unknown): Promise<void>;
  filterNewConfigs?(db: ReturnType<typeof createDb>, symbol: string, date: string, configs: unknown[]): Promise<unknown[]>;
}
