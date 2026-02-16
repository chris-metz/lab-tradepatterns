import { mkdir, readFile, writeFile, rename, access } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { RawKline } from "./binance-rest.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");

function dayPath(symbol: string, date: string): string {
  return join(DATA_DIR, symbol, `${date}.csv`);
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function getDaysBetween(from: Date, to: Date): string[] {
  const days: string[] = [];
  const current = new Date(from);
  current.setUTCHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setUTCHours(0, 0, 0, 0);

  while (current <= end) {
    days.push(formatDate(current));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return days;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function isComplete(path: string): Promise<boolean> {
  try {
    const content = await readFile(path, "utf-8");
    const lineCount = content.trim().split("\n").length;
    return lineCount >= EXPECTED_KLINES_PER_DAY - 60;
  } catch {
    return false;
  }
}

export async function getMissingDays(
  symbol: string,
  from: Date,
  to: Date,
): Promise<string[]> {
  const allDays = getDaysBetween(from, to);
  const missing: string[] = [];

  for (const day of allDays) {
    const path = dayPath(symbol, day);
    if (!(await fileExists(path)) || !(await isComplete(path))) {
      missing.push(day);
    }
  }
  return missing;
}

const EXPECTED_KLINES_PER_DAY = 86_400;

export async function cacheDay(
  symbol: string,
  date: string,
  klines: RawKline[],
): Promise<void> {
  if (klines.length < EXPECTED_KLINES_PER_DAY - 60) {
    throw new Error(
      `Incomplete data for ${symbol} ${date}: got ${klines.length} klines, expected ~${EXPECTED_KLINES_PER_DAY}`,
    );
  }

  const path = dayPath(symbol, date);
  const tmpPath = path + ".tmp";
  await mkdir(dirname(path), { recursive: true });

  const csv = klines
    .map((k) => `${k.openTime},${k.open},${k.high},${k.low},${k.close},${k.volume}`)
    .join("\n");
  await writeFile(tmpPath, csv + "\n");
  await rename(tmpPath, path);
}

export async function* loadKlines(
  symbol: string,
  from: Date,
  to: Date,
): AsyncGenerator<{ date: string; klines: RawKline[] }> {
  const days = getDaysBetween(from, to);

  for (const day of days) {
    const path = dayPath(symbol, day);
    if (!(await fileExists(path))) continue;

    const content = await readFile(path, "utf-8");
    const klines: RawKline[] = content
      .trim()
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => {
        const [openTime, open, high, low, close, volume] = line.split(",");
        return {
          openTime: parseInt(openTime, 10),
          open: parseFloat(open),
          high: parseFloat(high),
          low: parseFloat(low),
          close: parseFloat(close),
          volume: parseFloat(volume),
        };
      });

    yield { date: day, klines };
  }
}
