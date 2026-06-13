import { loadFont } from "@remotion/google-fonts/Inter";

// Inter — the real Pawly brand font (--font-inter).
// Restrict to the weights/subset we actually use to keep renders fast (avoids 100+ font requests).
const { fontFamily } = loadFont("normal", {
  weights: ["400", "600", "700"],
  subsets: ["latin"],
});
export const FONT = fontFamily;

// Brand + product colors, code-verified from the Pawly codebase (2026-06-03).
export const C = {
  vetTeal: "#009588", // primary — HealthBar healthy, generate button, published check
  vetTealDark: "#007D72",
  warmLinen: "#FAF9F7", // background
  card: "#FCFCFC",
  softBlack: "#1A1A1A", // foreground
  tealWash: "#E0F2F1", // secondary/accent
  muted: "#F3F1EE",
  border: "#EAE7E1",
  subtle: "#8A857C",
  destructive: "#EF4444",
  rose: "#F43F5E", // HealthBar hard conflicts
  orange: "#FB923C", // HealthBar soft warnings
  // AbsenceCell type SCHOOL — PURPLE (the most-cited fidelity fix: NOT blue)
  schoolBg: "#FAF5FF",
  schoolBorder: "#E9D5FF",
  schoolText: "#7E22CE",
  gold: "#F5B400", // halo accent on the locked school day
} as const;

export const RADIUS = 12;
