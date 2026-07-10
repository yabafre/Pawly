import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";

// Inter — brand sans (--font-inter). Geist Mono — the real --font-geist-mono, used
// STRICTLY for data (cost counter, % prêt, +7h, clock, shift times).
//
// Self-hosted (public/fonts/) instead of @remotion/google-fonts: the studio preview
// and render must not depend on fonts.gstatic.com at runtime — that dependency breaks
// under VPN/firewall filtering (e.g. NordVPN Threat Protection) and offline CI, which
// surfaces as a blocking "A network error occurred" in the studio. woff2 files come
// from @fontsource/{inter,geist-mono}, copied into public/fonts/.
export const FONT = "Inter";
export const MONO = "Geist Mono";

const INTER_WEIGHTS = [400, 600, 700] as const;
const MONO_WEIGHTS = [400, 500, 600] as const;

for (const weight of INTER_WEIGHTS) {
  loadFont({
    family: FONT,
    url: staticFile(`fonts/inter-latin-${weight}-normal.woff2`),
    weight: String(weight),
    style: "normal",
  });
}
for (const weight of MONO_WEIGHTS) {
  loadFont({
    family: MONO,
    url: staticFile(`fonts/geist-mono-latin-${weight}-normal.woff2`),
    weight: String(weight),
    style: "normal",
  });
}

// Exact Pawly design-system tokens (apps/web globals.css, verified 2026).
export const C = {
  vetTeal: "#009588", // primary
  vetTealDark: "#007D72",
  warmLinen: "#FAF9F7", // background
  card: "#FCFCFC",
  softBlack: "#1A1A1A", // foreground
  ink: "#171717", // deep ink — flat logo
  tealWash: "#E0F2F1", // secondary / accent
  muted: "#F3F1EE",
  mutedFg: "#6B6B6B", // muted-foreground
  subtle: "#6B6B6B", // alias of mutedFg (kept for older components)
  border: "#E8E5E0", // exact DS border
  destructive: "#EF4444",
  indigo: "#4F46E5", // chart-2 Electric Indigo
  orange: "#F97316", // chart-3 Vital Orange — the single "humanise" accent
  // HealthBar honest segments (real product component colors)
  rose: "#F43F5E", // hard conflict
  warn: "#FB923C", // soft warning
  // AbsenceCell SCHOOL — the real purple product cell (the only off-DS color, a signal)
  schoolBg: "#FAF5FF",
  schoolBorder: "#E9D5FF",
  schoolText: "#7E22CE",
  gold: "#F5B400", // one-time halo on the locked school day
} as const;

export const RADIUS = 12; // xl 0.75rem base
export const RADIUS_2XL = 20;

// The ONE spring of the whole film.
export const SPRING = { stiffness: 300, damping: 30 } as const;
