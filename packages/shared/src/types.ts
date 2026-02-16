export interface PricePoint {
  timestamp: number;
  price: number;
  symbol: string;
}

export interface RapidDropEvent {
  id: string;
  symbol: string;
  triggerPrice: number;
  triggerTimestamp: number;
  /** The high price the drop was measured from */
  windowHigh: number;
  /** Actual max drop observed (updated during recording) */
  dropPercent: number;
  /** Configured threshold that triggered detection */
  configDropPercent: number;
  /** Lowest price observed during the entire event */
  lowestPrice: number;
  /** Timestamp when the lowest price was reached */
  lowestPriceTimestamp: number;
  windowSeconds: number;
  pricesBefore: PricePoint[];
  pricesAfter: PricePoint[];
}

export interface RapidDropBacktestRun {
  id: string;
  symbol: string;
  fromTime: Date;
  toTime: Date;
  windowSeconds: number;
  dropPercent: number;
  recordAfterSeconds: number;
  cooldownSeconds: number;
  eventsFound: number;
  avgDrawdownAfterBuy: number | null;
  avgRecovery1min: number | null;
  avgRecovery2min: number | null;
  avgRecovery5min: number | null;
  avgRecovery10min: number | null;
  winRate1min: number | null;
  winRate2min: number | null;
  winRate5min: number | null;
  winRate10min: number | null;
  createdAt: Date;
}
