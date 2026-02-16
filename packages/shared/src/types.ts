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
  date: string;
  windowSeconds: number;
  dropPercent: number;
  recordAfterSeconds: number;
  cooldownSeconds: number;
  eventsFound: number;
  profitableCount: number | null;
  avgMaxProfit: number | null;
  medianMaxProfit: number | null;
  avgMaxDrawdown: number | null;
  maxMaxDrawdown: number | null;
  medianMaxDrawdown: number | null;
  avgTimeToBreakeven: number | null;
  medianTimeToBreakeven: number | null;
  avgTimeToMaxProfit: number | null;
  avgEndResult: number | null;
  createdAt: Date;
}
