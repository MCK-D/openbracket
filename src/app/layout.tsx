import "~/styles/globals.css";

import { type Metadata } from "next";
import "@fontsource/geist/latin-400.css";
import "@fontsource/geist/latin-600.css";
import Link from "next/link";

import { TRPCReactProvider } from "~/trpc/react";

export const metadata: Metadata = {
  title: { default: "OpenBracket | Tournaments", template: "%s | OpenBracket" },
  description:
    "Community tournaments, shared predictions, and results that keep everyone in the game.",
  icons: [{ rel: "icon", url: "/favicon.svg" }],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <TRPCReactProvider>
          <a href="#main" className="skip-link">
            Skip to content
          </a>
          <header className="border-border border-b">
            <nav
              aria-label="Main navigation"
              className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-5"
            >
              <Link href="/" className="text-xl font-semibold tracking-tight">
                OpenBracket<span className="text-primary">.</span>
              </Link>
              <div className="flex items-center gap-6 text-sm">
                <Link href="/">Tournaments</Link>
                <Link href="/accessibility">Accessibility</Link>
              </div>
            </nav>
          </header>
          {children}
          <footer className="border-border text-muted-foreground mx-auto flex max-w-6xl flex-wrap justify-between gap-4 border-t px-6 py-6 text-sm">
            <p>Community competition. Points only.</p>
            <p>Synthetic demo data · Foundation v0.1.0</p>
          </footer>
        </TRPCReactProvider>
      </body>
    </html>
  );
}
