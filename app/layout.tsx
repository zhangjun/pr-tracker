import type { Metadata } from "next";
import "./globals.css";
import { Inter, JetBrains_Mono, Instrument_Serif } from "next/font/google";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });
const serif = Instrument_Serif({
  subsets: ["latin"], weight: "400", style: ["normal", "italic"],
  variable: "--font-serif", display: "swap",
});

export const metadata: Metadata = {
  title: "AI Infra PR Tracker — vLLM · SGLang · veRL · ViME · slime · Megatron · TRT-LLM",
  description:
    "Track pull requests & issues across the leading AI infrastructure repos — inference optimisation, training optimisation, and direction of evolution. Daily / weekly / monthly views.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable} ${serif.variable}`}>
      <body>{children}</body>
    </html>
  );
}
