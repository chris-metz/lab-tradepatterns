import type { PatternModule } from "./types.js";
import { rapidDrop } from "./rapid-drop.js";

export type { PatternModule } from "./types.js";

const patterns: Record<string, PatternModule> = {
  "rapid-drop": rapidDrop,
};

export function getPattern(name: string): PatternModule {
  const pattern = patterns[name];
  if (!pattern) {
    const available = Object.keys(patterns).join(", ");
    throw new Error(`Unknown pattern "${name}". Available: ${available}`);
  }
  return pattern;
}
