import os from "node:os";
import path from "node:path";

export function spendwiseHome(): string {
  return process.env.SPENDWISE_HOME ?? path.join(os.homedir(), "Spendwise");
}

export const paths = {
  get home() { return spendwiseHome(); },
  get db() { return process.env.SPENDWISE_DB ?? path.join(spendwiseHome(), "data", "spendwise.db"); },
  get inbox() { return path.join(spendwiseHome(), "inbox"); },
  get processed() { return path.join(spendwiseHome(), "inbox", "processed"); },
  get failed() { return path.join(spendwiseHome(), "inbox", "failed"); },
  get backups() { return path.join(spendwiseHome(), "backups"); },
  get config() { return path.join(spendwiseHome(), "config.json"); },
  get logs() { return path.join(spendwiseHome(), "logs"); },
};
