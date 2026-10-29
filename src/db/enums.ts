// Plain constants shared by server and client code (kept free of Drizzle imports).
export const ACCOUNT_TYPES = ["checking", "savings", "credit_card", "brokerage"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const KINDS = [
  "expense",
  "income",
  "refund",
  "transfer",
  "card_payment",
  "contribution",
  "withdrawal",
  "investment_internal",
] as const;
export type Kind = (typeof KINDS)[number];
