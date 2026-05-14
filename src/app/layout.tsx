import type { Metadata } from "next";
import { Playfair_Display, Inter } from "next/font/google";
import "./globals.css";

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
});
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Reid",
  description: "Your personal advisor.",
};

// Static CSS string — no user input, no XSS surface — kept as a belt-and-braces
// hide for the legacy Next.js build watcher overlay, in addition to the
// `devIndicators: false` setting in next.config.ts.
const HIDE_NEXT_BUILD_WATCHER = "#__next-build-watcher{display:none}";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${playfair.variable} ${inter.variable}`}>
      <body className="min-h-screen bg-bg-dark text-text-primary font-sans antialiased">
        <style dangerouslySetInnerHTML={{ __html: HIDE_NEXT_BUILD_WATCHER }} />
        {children}
      </body>
    </html>
  );
}
