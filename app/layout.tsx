import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Playfair_Display } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

const playfairDisplay = Playfair_Display({
  variable: "--font-playfair-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const SITE_TITLE = "TGFI — Trilateral Geoeconomic Fragmentation Index";
const SITE_DESCRIPTION =
  "A rule-based detection engine surfacing direction reversals, expert disagreements, and cross-bucket divergences across China-US-EU economic and political analysis from leading think tanks.";

export const metadata: Metadata = {
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  robots: "noindex, nofollow",
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    siteName: "TGFI",
    type: "website",
    url: "https://trilateralindex.org",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  authors: [{ name: "Thomas Tse" }],
  applicationName: "TGFI",
  category: "research",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} ${playfairDisplay.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
