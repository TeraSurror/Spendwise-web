import { execFile } from "node:child_process";

const quote = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

/** Shows a macOS notification. A no-op elsewhere or when SPENDWISE_NOTIFY=0. */
export function notify(title: string, message: string): void {
  if (process.platform !== "darwin" || process.env.SPENDWISE_NOTIFY === "0") return;
  execFile("osascript", ["-e", `display notification ${quote(message)} with title ${quote(title)}`], () => {});
}
