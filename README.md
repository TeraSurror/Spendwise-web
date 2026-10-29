# Spendwise

A local, private tracker for what you spend across bank accounts and credit cards, and how much you put into your brokerage accounts. Everything runs on your Mac. No bank logins, no aggregator, no cloud.

You export a CSV from each bank once a month and drop it into a folder. Spendwise handles the rest:

- figures out which bank and account the file is from
- removes duplicates
- categorizes each transaction
- pairs card payments and brokerage transfers so they don't count as spending
- updates the dashboard

## Quick start

```bash
npm install
npm run dev          # http://127.0.0.1:3737
```

Drop your exports on the **Imports** page, or run the watcher and save them into `~/Spendwise/inbox/`:

```bash
npm run watch
```

To try it with sample data first (kept in `./.demo`, separate from your real data):

```bash
npm run demo:seed && npm run demo   # http://127.0.0.1:3738
```

### Run it automatically at login (macOS)

```bash
npm run install-agent            # builds the app, starts the watcher + dashboard via launchd
npm run install-agent -- --no-web  # watcher only
npm run uninstall-agent
```

Logs go to `~/Spendwise/logs/`. Run `install-agent` again after pulling new code.

## Supported exports

| Institution | Where to export | Notes |
|---|---|---|
| Chase checking | Account → Download account activity → CSV | Last 4 digits come from the file name |
| Chase credit card | Same as above | Purchases are already negative |
| American Express | Statements & Activity → Download → CSV | Charges are positive in the file, so the sign is flipped |
| Capital One card | Transactions → Download → CSV | Card number is read from the file |
| Capital One 360 | Account → Download transactions → CSV | |
| Fidelity | Activity & Orders → Download | Preamble and disclaimer footer are skipped |
| Schwab | History → Export | Handles `$` amounts and "as of" dates |
| Vanguard | Transaction history → Download (CSV) | Holdings section is skipped; transactions are read |

Banks change their export formats now and then. If a file isn't recognized, the Imports page asks you to map its columns once, and files with the same headers import on their own after that. **These presets were built from published format descriptions, not your real exports.** If one misreads a file, open an issue with a redacted sample, or add it to `tests/fixtures/` along with a test.

## How it counts

- **Spending** is expenses minus refunds. Card payments, transfers between your accounts and brokerage deposits are left out.
- **Invested** is net contributions: cash moved into brokerage accounts minus cash taken out. Buys, sells, dividends and reinvestments inside an account don't count. A bank-side transfer to Fidelity/Schwab/Vanguard counts until the matching brokerage deposit is imported. After that, the brokerage side carries it, so nothing is counted twice.
- **Transfers** are matched when the same amount leaves one of your accounts and arrives in another within 5 days.
- **Duplicates** are found by account, date, amount and description, and the count matters: two identical coffees on the same day are both kept, while overlapping exports add only the new rows.

## Categorizing

Rules are checked in this order: your rules, then the roughly 60 built-in merchant rules, then the bank's own category, then Uncategorized. When you change a transaction's category, Spendwise offers to create a rule for that merchant and apply it to past transactions. Transactions you edit by hand are never overwritten when rules run again.

## Where data lives

| Path | What |
|---|---|
| `~/Spendwise/data/spendwise.db` | SQLite database |
| `~/Spendwise/inbox/` | Drop exports here; they move to `processed/YYYY-MM/` or `failed/` |
| `~/Spendwise/backups/` | Nightly copies of the database (last 30 kept) |
| `~/Spendwise/config.json` | Optional settings, see below |

Set `SPENDWISE_HOME` to use a different folder.

```json
{
  "watchDownloads": true,
  "extraWatchDirs": [],
  "keepBackups": 30
}
```

With `watchDownloads` on, the watcher also imports new files in `~/Downloads` whose headers match a known export. It copies them and never moves or deletes anything in Downloads.

The dashboard only listens on `127.0.0.1`. The database never leaves your machine, and it isn't in the repo.

## Development

```bash
npm test            # vitest
npm run typecheck
npm run import -- path/to/export.csv
npm run backup
npm run db:generate # after editing src/db/schema.ts
```

| Path | What |
|---|---|
| `src/import/` | Parsing, dedupe, classification, transfer matching (`pipeline.ts` ties it together) |
| `src/import/presets/` | One file per institution |
| `src/automation/` | Inbox processing, backups, reminders, notifications |
| `src/lib/queries.ts` | Dashboard aggregates |
| `src/app/` | Next.js pages and server actions |
| `scripts/` | Watcher, CLI import, backup, launchd installer |
