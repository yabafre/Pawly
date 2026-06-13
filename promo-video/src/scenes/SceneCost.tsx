import React from "react";
import { AbsoluteFill, interpolate, Easing, useCurrentFrame } from "remotion";
import { C, FONT } from "../theme";
import { BreathingGradient } from "../components/BreathingGradient";
import { CountUp } from "../components/CountUp";

// 03:47:12 = 3*3600 + 47*60 + 12 = 13632 seconds of planning, this week.
const TARGET_SECONDS = 13632;
const COUNT_END = 42; // counter freezes here (CountUp clamps right)

// Scene 1 "Le coût" (0–2s, 60 frames). The hook, stage 1. Full-bleed on the
// breathing backdrop. ONLY two motions in the whole frame: the count-up of the
// cost clock (beat 1), then ONE crossfade-in of the line below (beat 2). The
// décor holds dead still so the rising number reads as clinical and credible.
export const SceneCost: React.FC = () => {
  const f = useCurrentFrame();

  // BEAT 1 — the cost clock. The number itself is animated by CountUp; the
  // surrounding cluster only fades+settles once on entry, then holds still.
  const intro = interpolate(f, [0, 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const rise = interpolate(f, [0, 12], [16, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  // BEAT 2 — after the counter freezes (frame 42), ONE line crossfades in
  // below, dead-centre so the cost stays the whole frame. Ease-out enter only.
  const lineIn = interpolate(f, [44, 56], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const lineRise = interpolate(f, [44, 56], [10, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  return (
    <AbsoluteFill style={{ fontFamily: FONT }}>
      <BreathingGradient />

      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* Cost cluster — settles once, then holds dead still. */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            opacity: intro,
            transform: `translateY(${rise - 26}px)`,
          }}
        >
          <CountUp
            frame={f}
            from={TARGET_SECONDS - 1600}
            to={TARGET_SECONDS}
            startAt={0}
            endAt={COUNT_END}
            kind="clock"
            style={{
              fontSize: 120,
              fontWeight: 600,
              lineHeight: 1,
              letterSpacing: 2,
              color: C.softBlack,
              fontVariantNumeric: "tabular-nums",
            }}
          />
          <div
            style={{
              marginTop: 28,
              fontFamily: FONT,
              fontSize: 26,
              fontWeight: 400,
              letterSpacing: 0.2,
              color: C.mutedFg,
            }}
          >
            temps passé sur le planning cette semaine
          </div>
        </div>

        {/* BEAT 2 — the single crossfaded line, just below the cluster. */}
        <div
          style={{
            marginTop: 56,
            fontFamily: FONT,
            fontSize: 32,
            fontWeight: 600,
            letterSpacing: 0.2,
            color: C.ink,
            opacity: lineIn,
            transform: `translateY(${lineRise}px)`,
          }}
        >
          Encore un dimanche soir sur Excel ?
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};