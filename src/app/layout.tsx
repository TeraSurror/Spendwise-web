import type { Metadata } from "next";
import { Nav } from "./nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Spendwise",
  description: "Personal spending and investing tracker",
};

// Every page reads the local SQLite database, so nothing is prerendered at build time.
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <div className="mx-auto flex max-w-7xl flex-col md:flex-row">
          <Nav />
          <main className="min-w-0 flex-1 px-4 py-6 md:px-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
