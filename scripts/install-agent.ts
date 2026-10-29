// Usage:
//   npm run install-agent              build the app, then start the watcher and dashboard at login
//   npm run install-agent -- --no-web  only the watcher
//   npm run uninstall-agent            stop both and remove them
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ensureDirs } from "../src/automation/inbox";
import { paths } from "../src/lib/paths";

if (process.platform !== "darwin") {
  console.error("Login agents use launchd, which is macOS only. Run `npm run watch` and `npm start` yourself instead.");
  process.exit(1);
}

const project = process.cwd();
// Version managers (fnm, nvm) hand out per-shell symlinks; launchd needs the real binary.
const node = fs.realpathSync(process.execPath);
const agentsDir = path.join(os.homedir(), "Library", "LaunchAgents");
const uid = os.userInfo().uid;
const args = process.argv.slice(2);

const AGENTS = {
  watcher: {
    label: "com.spendwise.watcher",
    program: [node, path.join(project, "node_modules/tsx/dist/cli.mjs"), path.join(project, "scripts/watcher.ts")],
    log: path.join(paths.logs, "watcher.log"),
  },
  web: {
    label: "com.spendwise.web",
    program: [node, path.join(project, "node_modules/next/dist/bin/next"), "start", "-H", "127.0.0.1", "-p", "3737"],
    log: path.join(paths.logs, "web.log"),
  },
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function plist(a: (typeof AGENTS)[keyof typeof AGENTS]): string {
  const env: Record<string, string> = { PATH: `${path.dirname(node)}:/usr/bin:/bin:/usr/sbin:/sbin`, NODE_ENV: "production" };
  if (process.env.SPENDWISE_HOME) env.SPENDWISE_HOME = path.resolve(process.env.SPENDWISE_HOME);
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${a.label}</string>
  <key>ProgramArguments</key>
  <array>
${a.program.map((p) => `    <string>${esc(p)}</string>`).join("\n")}
  </array>
  <key>WorkingDirectory</key><string>${esc(project)}</string>
  <key>EnvironmentVariables</key>
  <dict>
${Object.entries(env).map(([k, v]) => `    <key>${k}</key><string>${esc(v)}</string>`).join("\n")}
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>StandardOutPath</key><string>${esc(a.log)}</string>
  <key>StandardErrorPath</key><string>${esc(a.log)}</string>
</dict>
</plist>
`;
}

const plistPath = (label: string) => path.join(agentsDir, `${label}.plist`);
const bootout = (label: string) => spawnSync("launchctl", ["bootout", `gui/${uid}/${label}`], { stdio: "ignore" });

if (args.includes("--uninstall")) {
  for (const a of Object.values(AGENTS)) {
    bootout(a.label);
    fs.rmSync(plistPath(a.label), { force: true });
    console.log(`Removed ${a.label}`);
  }
  process.exit(0);
}

ensureDirs();
fs.mkdirSync(agentsDir, { recursive: true });
const wanted = args.includes("--no-web") ? [AGENTS.watcher] : [AGENTS.watcher, AGENTS.web];

if (wanted.includes(AGENTS.web)) {
  console.log("Building the dashboard (next build)…");
  execFileSync(node, [path.join(project, "node_modules/next/dist/bin/next"), "build"], { stdio: "inherit", cwd: project });
}

for (const a of wanted) {
  fs.writeFileSync(plistPath(a.label), plist(a));
  bootout(a.label);
  execFileSync("launchctl", ["bootstrap", `gui/${uid}`, plistPath(a.label)], { stdio: "inherit" });
  console.log(`Started ${a.label} (logs: ${a.log})`);
}
console.log(`\nDrop CSV exports into ${paths.inbox}${wanted.includes(AGENTS.web) ? "\nDashboard: http://127.0.0.1:3737" : ""}`);
console.log("After pulling new code, run this again to rebuild and restart.");
