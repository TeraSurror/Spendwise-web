import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runHousekeeping } from "../src/automation/housekeeping";
import { ensureDirs, processFile } from "../src/automation/inbox";
import { paths } from "../src/lib/paths";
import { FIXTURES, fixture, freshDb } from "./helpers";

let home: string;

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), "spendwise-test-"));
  process.env.SPENDWISE_HOME = home;
  process.env.SPENDWISE_NOTIFY = "0";
  ensureDirs();
});

afterEach(() => {
  fs.rmSync(home, { recursive: true, force: true });
  delete process.env.SPENDWISE_HOME;
});

const drop = (dir: string, name: string, content = fixture(name)) => {
  const file = path.join(dir, name);
  fs.writeFileSync(file, content);
  return file;
};

const filesUnder = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true, recursive: true }).filter((e) => e.isFile()).map((e) => e.name);

describe("inbox", () => {
  it("moves imported files to processed/ and unknown ones to failed/", () => {
    const db = freshDb();
    expect(processFile(db, drop(paths.inbox, FIXTURES.chaseCard), "inbox")?.status).toBe("imported");
    expect(processFile(db, drop(paths.inbox, FIXTURES.unknown), "inbox")?.status).toBe("unrecognized");
    expect(fs.readdirSync(paths.inbox).filter((f) => f.endsWith(".csv") || f.endsWith(".CSV"))).toEqual([]);
    expect(filesUnder(paths.processed)).toEqual([FIXTURES.chaseCard]);
    expect(fs.readdirSync(paths.failed)).toEqual([FIXTURES.unknown]);
  });

  it("doesn't overwrite an earlier file with the same name", () => {
    const db = freshDb();
    processFile(db, drop(paths.inbox, FIXTURES.chaseCard), "inbox");
    processFile(db, drop(paths.inbox, FIXTURES.chaseCard), "inbox");
    expect(filesUnder(paths.processed).sort()).toEqual(["Chase5678_Activity20261028-2.CSV", FIXTURES.chaseCard]);
  });

  it("ignores unrelated downloads and copies recognized ones without moving them", () => {
    const db = freshDb();
    const downloads = path.join(home, "Downloads");
    fs.mkdirSync(downloads);
    const unrelated = drop(downloads, "contacts.csv", "Name,Email\nJane,jane@example.com\n");
    expect(processFile(db, unrelated, "downloads")).toBeNull();
    const amex = drop(downloads, FIXTURES.amex);
    expect(processFile(db, amex, "downloads")?.status).toBe("imported");
    expect(fs.existsSync(unrelated) && fs.existsSync(amex)).toBe(true);
    expect(filesUnder(paths.processed)).toEqual([FIXTURES.amex]);
  });
});

describe("housekeeping", () => {
  it("backs up once a day and prunes old backups", async () => {
    const db = freshDb();
    for (const d of ["2026-10-01", "2026-10-02", "2026-10-03"]) fs.writeFileSync(path.join(paths.backups, `spendwise-${d}.db`), "");
    const first = await runHousekeeping(db, { keepBackups: 2, today: "2026-10-29" });
    expect(first.some((l) => l.startsWith("backup"))).toBe(true);
    expect(fs.readdirSync(paths.backups).sort()).toEqual(["spendwise-2026-10-03.db", "spendwise-2026-10-29.db"]);
    const again = await runHousekeeping(db, { keepBackups: 2, today: "2026-10-29" });
    expect(again.some((l) => l.startsWith("backup"))).toBe(false);
  });

  it("sends the stale-account reminder at most once a month", async () => {
    const db = freshDb();
    processFile(db, drop(paths.inbox, FIXTURES.amex), "inbox");
    expect(await runHousekeeping(db, { keepBackups: 30, today: "2026-12-20" })).toContainEqual(expect.stringMatching(/^stale reminder for 1/));
    expect(await runHousekeeping(db, { keepBackups: 30, today: "2026-12-21" })).not.toContainEqual(expect.stringMatching(/^stale/));
  });
});
