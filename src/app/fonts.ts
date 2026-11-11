import { Bodoni_Moda, Rasa, Schibsted_Grotesk } from "next/font/google";

// All three families are SIL Open Font License; next/font self-hosts them at build time.
export const bodoni = Bodoni_Moda({
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz"],
  display: "swap",
  variable: "--font-bodoni",
});

export const schibsted = Schibsted_Grotesk({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-schibsted",
});

// Gujarati accents only (wordmark companion, small bilingual labels).
export const rasa = Rasa({
  subsets: ["gujarati"],
  weight: ["400", "500"],
  display: "swap",
  variable: "--font-rasa",
  preload: false,
});

export const fontVariables = `${bodoni.variable} ${schibsted.variable} ${rasa.variable}`;
