import React from "react";
import {
  AbsoluteFill,
  interpolate,
  Easing,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { PawPrint } from "lucide-react";
import { C, FONT, MONO, RADIUS, SPRING } from "../theme";
import { BreathingGradient } from "../components/BreathingGradient";

// Scene 8 — "La promesse" (36–42s of the full film, 180 frames).
// Full-bleed on the calm backdrop. CLINIQUE-ZEN-BY-RESTRAINT: the FLAT Pawly
// wordmark holds DEAD STILL the entire scene (never a gradient — paw in vetTeal,
// "Pawly" in ink). The ONLY motion: two display lines spring-stagger in (the ONE
// film spring, 50ms/line), then the muted subtitle fades, then — last and held —
// the single Geist-Mono stat caption fades in. Nothing else moves.

// FLAT wordmark — dead still. lucide PawPrint (vetTeal) + "Pawly" (ink, Inter 700).
// No animation, no gradient: the credibility anchor.
const Wordmark: React.FC = () => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 16,
    }}
  >
    <PawPrint size={52} color={C.vetTeal} strokeWidth={2.25} />
    <span
      style={{
        fontFamily: FONT,
        fontSize: 56,
        fontWeight: 700,
        color: C.ink,
        letterSpacing: "-0.02em",
        lineHeight: 1,
      }}
    >
      Pawly
    </span>
  </div>
);

// One display line — rises + fades on the ONE film spring, per-line delayed.
const DisplayLine: React.FC<{
  text: string;
  frame: number;
  fps: number;
  startAt: number;
}> = ({ text, frame, fps, startAt }) => {
  const s = spring({
    frame: frame - startAt,
    fps,
    config: SPRING,
    durationInFrames: 22,
  });
  const ty = interpolate(s, [0, 1], [26, 0]);
  const o = interpolate(frame - startAt, [0, 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <div
      style={{
        opacity: o,
        transform: `translateY(${ty}px)`,
        fontSize: 78,
        fontWeight: 700,
        color: C.softBlack,
        lineHeight: 1.06,
        letterSpacing: "-0.02em",
      }}
    >
      {text}
    </div>
  );
};

export const ScenePromise: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Two display lines stagger in at 50ms (~1.5 frames) apart.
  const line1Start = 14;
  const line2Start = line1Start + 14; // second line a beat after the first settles

  // Muted subtitle fades up after the second line lands (ease-out enter).
  const subO = interpolate(frame, [48, 66], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const subY = interpolate(frame, [48, 66], [14, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  // Stat caption (Geist Mono) — fades in LAST and holds to the end (no exit).
  const statO = interpolate(frame, [82, 102], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const statY = interpolate(frame, [82, 102], [12, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  return (
    <AbsoluteFill style={{ fontFamily: FONT }}>
      <BreathingGradient />

      <AbsoluteFill
        style={{
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 36,
          padding: "0 120px",
        }}
      >
        {/* FLAT wordmark — dead still */}
        <Wordmark />

        {/* Two punchy display lines — the only motion alongside the stat caption */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
            gap: 6,
            marginTop: 10,
          }}
        >
          <DisplayLine
            text="Le planning intelligent."
            frame={frame}
            fps={fps}
            startAt={line1Start}
          />
          <DisplayLine
            text="Pour votre clinique."
            frame={frame}
            fps={fps}
            startAt={line2Start}
          />
        </div>

        {/* Muted subtitle */}
        <div
          style={{
            opacity: subO,
            transform: `translateY(${subY}px)`,
            fontSize: 30,
            fontWeight: 500,
            color: C.mutedFg,
            textAlign: "center",
            maxWidth: 1000,
            lineHeight: 1.4,
            marginTop: 2,
          }}
        >
          …pour vous concentrer sur l'essentiel&nbsp;: le soin animal.
        </div>

        {/* Single Geist-Mono stat caption — fades in last, holds.
            Keep the tilde: it's the owner's own estimate, not a benchmark. */}
        <div
          style={{
            opacity: statO,
            transform: `translateY(${statY}px)`,
            marginTop: 18,
            display: "flex",
            alignItems: "center",
            gap: 12,
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: RADIUS,
            padding: "14px 26px",
            fontFamily: MONO,
            fontVariantNumeric: "tabular-nums",
            fontSize: 28,
            fontWeight: 500,
            color: C.softBlack,
            letterSpacing: "0.01em",
          }}
        >
          ~3 h chaque dimanche → un clic
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};