"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Overview" },
  { href: "/transactions", label: "Transactions" },
  { href: "/spending", label: "Spending" },
  { href: "/investing", label: "Investing" },
  { href: "/imports", label: "Imports" },
  { href: "/accounts", label: "Accounts" },
  { href: "/rules", label: "Rules" },
  { href: "/categories", label: "Categories" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="border-line flex shrink-0 gap-1 overflow-x-auto border-b px-4 py-3 md:sticky md:top-0 md:h-screen md:w-52 md:flex-col md:border-r md:border-b-0 md:py-6">
      <Link href="/" className="mr-4 px-2 pb-0 text-lg font-semibold whitespace-nowrap md:mr-0 md:pb-4">Spendwise</Link>
      {LINKS.map((l) => {
        const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`rounded-lg px-2 py-1.5 text-sm whitespace-nowrap ${active ? "bg-surface-2 text-ink font-medium" : "text-ink-2 hover:bg-surface-2"}`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
