import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { paths } from "../lib/paths";

export interface SpendwiseConfig {
  /** Also pick up recognized exports saved to ~/Downloads (they are copied, never moved). */
  watchDownloads: boolean;
  /** Extra folders treated like ~/Downloads. */
  extraWatchDirs: string[];
  /** Days of nightly database backups to keep. */
  keepBackups: number;
}

const DEFAULTS: SpendwiseConfig = { watchDownloads: false, extraWatchDirs: [], keepBackups: 30 };

export function loadConfig(): SpendwiseConfig {
  try {
    const raw = JSON.parse(fs.readFileSync(paths.config, "utf8")) as Partial<SpendwiseConfig>;
    return { ...DEFAULTS, ...raw };
  } catch {
    return DEFAULTS;
  }
}

export const downloadsDir = () => path.join(os.homedir(), "Downloads");
