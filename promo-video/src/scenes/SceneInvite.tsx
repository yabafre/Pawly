import React from "react";
import {
  AbsoluteFill,
  interpolate,
  Easing,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Building2, Home, Check } from "lucide-react";
import { C, FONT, MONO, RADIUS, RADIUS_2XL, SPRING } from "../theme";
import { BreathingGradient } from "../components/BreathingGradient";

// Scene 9 — "L'invitation" (42–52s of the full film, 300 frames @ 30fps).
// The single design-partner CTA. CLINIQUE-ZEN-BY-RESTRAINT: the whole block
// spring-reveals ONCE in a quiet stagger, then EVERYTHING holds DEAD STILL to
// the final frame (the last ~1s is fully frozen). One primary teal button, no
// second ask, no feature list. The ONLY off-DS color is the single Vital Orange
// underline path-draw under the word « ensemble » — the one human accent.

// One filled clinic slot — solid teal with a small Check badge. DEAD STILL.
const FilledSlot: React.FC<{ icon: React.ReactNode }> = ({ icon }) => (
  <div
    style={{
      position: "relative",
      width: 76,
      height: 76,
      borderRadius: RADIUS,
      background: C.vetTeal,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      boxShadow: "0 8px 20px rgba(0,149,136,0.26)",
    }}
  >
    {icon}
    <div
      style={{
        position: "absolute",
        top: -7,
        right: -7,
        width: 26,
        height: 26,
        borderRadius: 999,
        background: C.card,
        border: `2px solid ${C.vetTeal}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Check size={15} color={C.vetTeal} strokeWidth={3} />
    </div>
  </div>
);

// One empty clinic slot — bordered, GENTLY pulsing opacity 0.6↔1.0 on a sine
// loop. Per-slot phase offset (deterministic, by index) so the three breathe
// just out of sync. This is the only sustained motion after the reveal — quiet.
const EmptySlot: React.FC<{
  frame: number;
  index: number;
  revealed: number;
}> = ({ frame, index, revealed }) => {
  const phase = index * 1.1; // deterministic offset per slot
  const pulse = 0.8 + 0.2 * Math.sin(frame / 18 + phase); // 0.6 .. 1.0
  return (
    <div
      style={{
        width: 76,
        height: 76,
        borderRadius: RADIUS,
        border: `2px solid ${C.border}`,
        background: C.card,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: revealed * pulse,
      }}
    >
      <Home size={32} color={C.mutedFg} strokeWidth={1.75} />
    </div>
  );
};

export const SceneInvite: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Shared staggered reveal — each beat keys off the ONE film spring (40ms ≈
  // 1.2-frame stagger). After ~frame 150 nothing moves; the scene holds calm to
  // the final frame (the last ~1s is fully still).
  const headStart = 6;
  const rowStart = headStart + 14;
  const subStart = rowStart + 14;
  const founderStart = subStart + 14;
  const tagStart = founderStart + 14;
  const btnStart = tagStart + 14;

  // Headline rises + fades on the ONE spring.
  const headS = spring({
    frame: frame - headStart,
    fps,
    config: SPRING,
    durationInFrames: 22,
  });
  const headY = interpolate(headS, [0, 1], [24, 0]);
  const headO = interpolate(frame - headStart, [0, 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Scarcity row scales + fades in once, then the empty slots take over with
  // their quiet pulse.
  const rowS = spring({
    frame: frame - rowStart,
    fps,
    config: SPRING,
    durationInFrames: 22,
  });
  const rowScale = interpolate(rowS, [0, 1], [0.94, 1]);
  const rowO = interpolate(frame - rowStart, [0, 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Sub-line (muted) fades up — ease-out enter, then dead still.
  const subO = interpolate(frame, [subStart, subStart + 16], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const subY = interpolate(frame, [subStart, subStart + 16], [14, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  // Founder line + Geist-Mono contact fade up together.
  const founderO = interpolate(
    frame,
    [founderStart, founderStart + 16],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    },
  );
  const founderY = interpolate(
    frame,
    [founderStart, founderStart + 16],
    [14, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    },
  );

  // « Construisons-le ensemble. » fades in; then the single Vital Orange
  // underline draws under « ensemble » ONLY (ease-out path-draw, scaleX 0→1
  // from the left). This is the one human accent of the whole scene.
  const tagO = interpolate(frame, [tagStart, tagStart + 14], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const underlineDraw = interpolate(
    frame,
    [tagStart + 10, tagStart + 34],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    },
  );

  // Primary teal button scales in LAST on the ONE spring (subtle 0.97→1.0).
  const btnS = spring({
    frame: frame - btnStart,
    fps,
    config: SPRING,
    durationInFrames: 24,
  });
  const btnScale = interpolate(btnS, [0, 1], [0.97, 1]);
  const btnO = interpolate(frame - btnStart, [0, 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ fontFamily: FONT }}>
      <BreathingGradient />

      <AbsoluteFill
        style={{
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 30,
          padding: "0 80px",
        }}
      >
        {/* Headline */}
        <div
          style={{
            opacity: headO,
            transform: `translateY(${headY}px)`,
            fontSize: 58,
            fontWeight: 700,
            color: C.softBlack,
            textAlign: "center",
            maxWidth: 1180,
            lineHeight: 1.14,
            letterSpacing: "-0.02em",
          }}
        >
          Devenez clinique partenaire — pilote gratuit 3 mois
        </div>

        {/* Honest-scarcity row — 2 filled teal (still), 3 empty (gentle pulse) */}
        <div
          style={{
            opacity: rowO,
            transform: `scale(${rowScale})`,
            display: "flex",
            alignItems: "center",
            gap: 20,
            marginTop: 2,
          }}
        >
          <FilledSlot
            icon={<Building2 size={32} color="#FFFFFF" strokeWidth={2} />}
          />
          <FilledSlot
            icon={<Home size={32} color="#FFFFFF" strokeWidth={2} />}
          />
          <EmptySlot frame={frame} index={0} revealed={rowO} />
          <EmptySlot frame={frame} index={1} revealed={rowO} />
          <EmptySlot frame={frame} index={2} revealed={rowO} />
        </div>

        {/* Sub-line — muted-foreground */}
        <div
          style={{
            opacity: subO,
            transform: `translateY(${subY}px)`,
            fontSize: 28,
            fontWeight: 600,
            color: C.mutedFg,
            textAlign: "center",
            maxWidth: 980,
            lineHeight: 1.3,
          }}
        >
          On co-construit Pawly avec 3 à 5 cliniques d'Île-de-France.
        </div>

        {/* Founder line + Geist-Mono contact */}
        <div
          style={{
            opacity: founderO,
            transform: `translateY(${founderY}px)`,
            display: "flex",
            alignItems: "center",
            gap: 16,
            fontSize: 26,
            fontWeight: 600,
            color: C.softBlack,
          }}
        >
          <span>Alex — fondateur</span>
          <span style={{ color: C.border }}>·</span>
          <span
            style={{
              fontFamily: MONO,
              fontSize: 24,
              fontWeight: 500,
              color: C.vetTealDark,
              background: C.tealWash,
              border: `1px solid ${C.border}`,
              borderRadius: RADIUS,
              padding: "6px 14px",
            }}
          >
            alex@pawly.fr
          </span>
        </div>

        {/* « Construisons-le ensemble. » — the ONE Vital Orange accent under
            « ensemble » only (ease-out path-draw underline). */}
        <div
          style={{
            opacity: tagO,
            fontSize: 34,
            fontWeight: 700,
            color: C.softBlack,
            letterSpacing: "-0.01em",
            marginTop: 4,
          }}
        >
          Construisons-le{" "}
          <span style={{ position: "relative", display: "inline-block" }}>
            ensemble
            <span
              style={{
                position: "absolute",
                left: 0,
                bottom: -8,
                height: 4,
                width: "100%",
                background: C.orange,
                borderRadius: 999,
                transform: `scaleX(${underlineDraw})`,
                transformOrigin: "left center",
              }}
            />
          </span>
          .
        </div>

        {/* Primary teal button — scales in last on the ONE spring. */}
        <div
          style={{
            opacity: btnO,
            transform: `scale(${btnScale})`,
            marginTop: 10,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              background: C.vetTeal,
              color: "#FFFFFF",
              fontSize: 26,
              fontWeight: 700,
              padding: "20px 40px",
              borderRadius: RADIUS_2XL,
              boxShadow: "0 14px 34px rgba(0,149,136,0.30)",
            }}
          >
            <Check size={22} color="#FFFFFF" strokeWidth={2.5} />
            Réserver 20 min — sans engagement
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};