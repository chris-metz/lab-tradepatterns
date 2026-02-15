export interface PricePoint {
  timestamp: number;
  price: number;
  symbol: string;
}

export interface PatternEvent {
  id: string;
  symbol: string;
  type: string;
  triggerPrice: number;
  triggerTimestamp: number;
  dropPercent: number;
  windowSeconds: number;
  pricesBefore: PricePoint[];
  pricesAfter: PricePoint[];
}
