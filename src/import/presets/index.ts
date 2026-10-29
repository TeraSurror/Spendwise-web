import type { Preset } from "../types";
import { amex } from "./amex";
import { capitalOneBank, capitalOneCard } from "./capitalone";
import { chaseCard, chaseChecking } from "./chase";
import { fidelity, schwab, vanguard } from "./brokerages";

/** Checked in order; formats with distinctive headers come before Amex's generic Date/Description/Amount. */
export const BUILT_IN_PRESETS: Preset[] = [
  chaseChecking,
  chaseCard,
  capitalOneCard,
  capitalOneBank,
  fidelity,
  schwab,
  vanguard,
  amex,
];

export { customPreset, type CustomPresetConfig } from "./generic";
