import type { PricePoint, PatternEvent } from "@tradepatterns/shared";
import { randomUUID } from "crypto";

export interface DetectorConfig {
  /** Rolling window size in seconds */
  windowSeconds: number;
  /** Drop threshold in percent (e.g. 2 = 2%) */
  dropPercent: number;
  /** How many seconds to record after a trigger */
  recordAfterSeconds: number;
  /** Cooldown in seconds before the same pattern can trigger again */
  cooldownSeconds: number;
}

const DEFAULT_CONFIG: DetectorConfig = {
  windowSeconds: 60,
  dropPercent: 2,
  recordAfterSeconds: 120,
  cooldownSeconds: 300,
};

export class PatternDetector {
  private config: DetectorConfig;
  private window: PricePoint[] = [];
  private activeRecording: {
    event: PatternEvent;
    endTimestamp: number;
    windowHigh: number;
  } | null = null;
  private lastTriggerTimestamp = 0;
  private onComplete: (event: PatternEvent) => void;

  constructor(
    config: Partial<DetectorConfig> = {},
    onComplete: (event: PatternEvent) => void,
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
        console.log(
          `Recording complete: ${this.activeRecording.event.pricesAfter.length} data points, ` +
            `max drop: -${this.activeRecording.event.dropPercent.toFixed(2)}%`,
        );
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

      const event: PatternEvent = {
        id: randomUUID(),
        symbol: point.symbol,
        type: "rapid_drop",
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

      console.log(
        `Drop detected: -${dropPercent.toFixed(2)}% in ${this.config.windowSeconds}s ` +
          `(${windowHigh.toFixed(2)} → ${point.price.toFixed(2)}). ` +
          `Recording next ${this.config.recordAfterSeconds}s...`,
      );

      this.activeRecording = {
        event,
        endTimestamp:
          point.timestamp + this.config.recordAfterSeconds * 1000,
        windowHigh,
      };
    }
  }
}
