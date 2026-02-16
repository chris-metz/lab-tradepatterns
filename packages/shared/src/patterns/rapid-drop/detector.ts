import type { PricePoint, RapidDropEvent } from "../../types.js";
import { randomUUID } from "crypto";

export interface RapidDropDetectorConfig {
  /** Rolling window size in seconds */
  windowSeconds: number;
  /** Drop threshold in percent (e.g. 2 = 2%) */
  dropPercent: number;
  /** How many seconds to record after a trigger */
  recordAfterSeconds: number;
  /** Cooldown in seconds before the same pattern can trigger again */
  cooldownSeconds: number;
}

const DEFAULT_CONFIG: RapidDropDetectorConfig = {
  windowSeconds: 60,
  dropPercent: 2,
  recordAfterSeconds: 120,
  cooldownSeconds: 300,
};

export class RapidDropDetector {
  private config: RapidDropDetectorConfig;
  private window: PricePoint[] = [];
  private activeRecording: {
    event: RapidDropEvent;
    endTimestamp: number;
    windowHigh: number;
  } | null = null;
  private lastTriggerTimestamp = 0;
  private onComplete: (event: RapidDropEvent) => void;

  constructor(
    config: Partial<RapidDropDetectorConfig> = {},
    onComplete: (event: RapidDropEvent) => void,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.onComplete = onComplete;
  }

  feed(point: PricePoint) {
    // Trim window to configured size
    const cutoff = point.timestamp - this.config.windowSeconds * 1000;
    this.window = this.window.filter((p) => p.timestamp > cutoff);
    this.window.push(point);

    // If we're recording post-drop prices, collect them
    if (this.activeRecording) {
      this.activeRecording.event.pricesAfter.push(point);

      // Update drop percent and lowest price if price falls further
      const currentDrop =
        ((this.activeRecording.windowHigh - point.price) /
          this.activeRecording.windowHigh) *
        100;
      if (currentDrop > this.activeRecording.event.dropPercent) {
        this.activeRecording.event.dropPercent = currentDrop;
      }
      if (point.price < this.activeRecording.event.lowestPrice) {
        this.activeRecording.event.lowestPrice = point.price;
        this.activeRecording.event.lowestPriceTimestamp = point.timestamp;
      }

      if (point.timestamp >= this.activeRecording.endTimestamp) {
        this.onComplete(this.activeRecording.event);
        this.activeRecording = null;
      }
      return;
    }

    // Check for drop pattern
    if (this.window.length < 2) return;

    const windowHigh = Math.max(...this.window.map((p) => p.price));
    const dropPercent = ((windowHigh - point.price) / windowHigh) * 100;

    if (
      dropPercent >= this.config.dropPercent &&
      point.timestamp - this.lastTriggerTimestamp >
        this.config.cooldownSeconds * 1000
    ) {
      this.lastTriggerTimestamp = point.timestamp;

      const event: RapidDropEvent = {
        id: randomUUID(),
        symbol: point.symbol,
        triggerPrice: point.price,
        triggerTimestamp: point.timestamp,
        windowHigh,
        dropPercent,
        configDropPercent: this.config.dropPercent,
        lowestPrice: point.price,
        lowestPriceTimestamp: point.timestamp,
        windowSeconds: this.config.windowSeconds,
        pricesBefore: [...this.window],
        pricesAfter: [],
      };

      this.activeRecording = {
        event,
        endTimestamp:
          point.timestamp + this.config.recordAfterSeconds * 1000,
        windowHigh,
      };
    }
  }
}
