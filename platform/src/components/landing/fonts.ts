import { Geist, Instrument_Serif, Nunito } from "next/font/google";

// Self-hosted by next/font (no Google request at runtime, size-adjusted fallbacks so text doesn't
// jump when the font arrives). Geist and Instrument Serif are the same files the app shell loads,
// so a visitor's browser fetches each at most once. Nunito is only fetched by pages that use it.
export const lpSans = Geist({ subsets: ["latin"], variable: "--lpf-sans", display: "swap" });
export const lpSerif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: "normal", variable: "--lpf-serif", display: "swap" });
export const lpRounded = Nunito({ subsets: ["latin"], variable: "--lpf-rounded", display: "swap", preload: false });

export const lpFontClasses = `${lpSans.variable} ${lpSerif.variable} ${lpRounded.variable}`;
