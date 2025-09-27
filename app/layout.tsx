import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ultimate Car River — Game Codex",
  description: "Deterministic curling-inspired car duel designed for quick guest multiplayer on the web.",
  metadataBase: new URL("https://ultimate-car-river.example"),
  openGraph: {
    title: "Ultimate Car River — Game Codex",
    description:
      "All-in-one reference for the deterministic curling/pétanque hybrid featuring five unique car archetypes.",
    url: "https://ultimate-car-river.example",
    siteName: "Ultimate Car River",
    type: "website"
  },
  twitter: {
    card: "summary_large_image",
    title: "Ultimate Car River — Game Codex",
    description:
      "Competitive car curling codex with deterministic physics, instant guest multiplayer, and vercel-ready Next.js hosting.",
    creator: "@UltimateCarRiver"
  }
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <main>{children}</main>
        <footer>© {new Date().getFullYear()} Ultimate Car River Codex. Built for instant guest play.</footer>
      </body>
    </html>
  );
}
