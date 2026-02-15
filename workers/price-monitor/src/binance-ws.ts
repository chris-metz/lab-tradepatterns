import WebSocket from "ws";
import { EventEmitter } from "events";
import type { PricePoint } from "@tradepatterns/shared";

interface BinanceKline {
  e: string;
  s: string;
  k: {
    t: number; // Kline start time
    T: number; // Kline close time
    s: string; // Symbol
    i: string; // Interval
    o: string; // Open
    c: string; // Close
    h: string; // High
    l: string; // Low
    v: string; // Volume
    x: boolean; // Is this kline closed?
  };
}

export class BinanceWS extends EventEmitter {
  private ws: WebSocket | null = null;
  private symbol: string;

  constructor(symbol: string) {
    super();
    this.symbol = symbol.toLowerCase();
  }

  connect() {
    const url = `wss://stream.binance.com:9443/ws/${this.symbol}@kline_1s`;
    console.log(`Connecting to ${url}`);

    this.ws = new WebSocket(url);

    this.ws.on("open", () => {
      console.log(`Connected to Binance ${this.symbol} 1s kline stream`);
    });

    this.ws.on("message", (data) => {
      const msg: BinanceKline = JSON.parse(data.toString());

      if (!msg.k.x) return; // Only emit closed candles

      const point: PricePoint = {
        timestamp: msg.k.t,
        price: parseFloat(msg.k.c),
        symbol: msg.s,
      };

      this.emit("price", point);
    });

    this.ws.on("close", () => {
      console.log("WebSocket closed, reconnecting in 5s...");
      setTimeout(() => this.connect(), 5000);
    });

    this.ws.on("error", (err) => {
      console.error("WebSocket error:", err.message);
    });
  }

  disconnect() {
    this.ws?.close();
    this.ws = null;
  }
}
