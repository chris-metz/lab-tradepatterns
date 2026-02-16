const BASE_URL = "https://api.binance.com";
const RATE_LIMIT_MS = 500;
const MAX_RETRIES = 5;

export interface RawKline {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url: string): Promise<Response> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const res = await fetch(url);

    if (res.ok) return res;

    // Retry on 429 (rate limit) and 503 (CloudFront throttle)
    if ((res.status === 429 || res.status === 503) && attempt < MAX_RETRIES - 1) {
      const jitter = Math.random() * 1000;
      const backoff = Math.pow(2, attempt) * 2000 + jitter;
      console.log(`  Rate limited (${res.status}), retrying in ${Math.round(backoff)}ms...`);
      await sleep(backoff);
      continue;
    }

    const text = await res.text();
    throw new Error(`Binance API error ${res.status}: ${text}`);
  }

  throw new Error("Unreachable");
}

export async function* fetchKlines(
  symbol: string,
  startTime: number,
  endTime: number,
): AsyncGenerator<RawKline[]> {
  let currentStart = startTime;

  while (currentStart < endTime) {
    const url = `${BASE_URL}/api/v3/klines?symbol=${symbol}&interval=1s&startTime=${currentStart}&endTime=${endTime}&limit=1000`;
    const res = await fetchWithRetry(url);

    const data: unknown[][] = await res.json();
    if (data.length === 0) break;

    const klines: RawKline[] = data.map((k) => ({
      openTime: k[0] as number,
      open: parseFloat(k[1] as string),
      high: parseFloat(k[2] as string),
      low: parseFloat(k[3] as string),
      close: parseFloat(k[4] as string),
      volume: parseFloat(k[5] as string),
    }));

    yield klines;

    // Next batch starts after the last kline's close time
    const lastCloseTime = data[data.length - 1][6] as number;
    currentStart = lastCloseTime + 1;

    if (data.length < 1000) break;

    await sleep(RATE_LIMIT_MS);
  }
}
