import React from "react";
import { AbsoluteFill, interpolate, Easing, useCurrentFrame } from "remotion";
import { GraduationCap } from "lucide-react";
import { C, FONT, RADIUS } from "../theme";
import { Caption } from "../components/Caption";

// Scene 3 (11–17s of the full film, 180 frames) — "L'aspiration".
// Full-bleed pivot: a small cluster of RECOGNIZABLE "Excel chaos" artifacts —
// light schedule cells with shift text, a red "Conflit" chip, a post-it
// "Léa · école", an "35h ?" chip — first jitter (f0→20), then get drawn toward
// screen center in a smooth, accelerating spiral and vanish (~f20→f85). The
// background crossfades from cold grey to Warm Linen (f30→f115). After that a
// calm Vet Teal seed/ring gently breathes in center.

const CENTER_X = 960;
const CENTER_Y = 540;

type FragmentKind = "cell" | "conflict" | "postit" | "hours";

type Fragment = {
  // Resting position (where the fragment sits before the vacuum pulls it in).
  x: number;
  y: number;
  w: number;
  h: number;
  kind: FragmentKind;
  delay: number; // per-index stagger for the suck-in
  spin: number; // total rotation (deg) applied as it spirals inward
  label?: string;
  sub?: string; // secondary line (e.g. shift hours under a cell title)
};

// Deterministic cluster — positions/sizes hand-tuned, no randomness at render.
const FRAGMENTS: Fragment[] = [
  {
    x: 690,
    y: 350,
    w: 158,
    h: 92,
    kind: "cell",
    delay: 0,
    spin: 220,
    label: "Lun",
    sub: "08–14",
  },
  {
    x: 880,
    y: 318,
    w: 158,
    h: 92,
    kind: "cell",
    delay: 6,
    spin: -260,
    label: "Mar",
    sub: "—",
  },
  {
    x: 1072,
    y: 360,
    w: 158,
    h: 92,
    kind: "cell",
    delay: 12,
    spin: 200,
    label: "Mer",
    sub: "14–20",
  },
  {
    x: 838,
    y: 470,
    w: 200,
    h: 62,
    kind: "conflict",
    delay: 4,
    spin: -300,
    label: "Conflit",
  },
  {
    x: 1120,
    y: 640,
    w: 178,
    h: 138,
    kind: "postit",
    delay: 18,
    spin: 300,
    label: "Léa · école",
  },
  {
    x: 660,
    y: 632,
    w: 150,
    h: 64,
    kind: "hours",
    delay: 14,
    spin: -210,
    label: "35h ?",
  },
];

const VACUUM_START = 20;
const VACUUM_SPAN = 50; // a fragment finishes ~50 frames after its own delay
// (max delay 18 + start 20 + span 50 ≈ frame 88 → cluster cleared by ~f85)

const FragmentView: React.FC<{ frag: Fragment; frame: number }> = ({
  frag,
  frame,
}) => {
  // Local progress of THIS fragment's suck-in (0 at rest → 1 swallowed).
  // Accelerating ease so the pull "grabs" them harder as they near center.
  const t = interpolate(
    frame,
    [VACUUM_START + frag.delay, VACUUM_START + frag.delay + VACUUM_SPAN],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.in(Easing.cubic),
    },
  );

  // Pre-vacuum jitter (f0→20): a tiny restless drift so the cluster feels alive
  // before it gets pulled in. Deterministic, varies by resting position.
  const jitterAmt = interpolate(frame, [0, 20], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const jx = Math.sin((frame + frag.x) / 6) * 4 * jitterAmt;
  const jy = Math.cos((frame + frag.y) / 7) * 4 * jitterAmt;

  // Center of the fragment at rest.
  const restCx = frag.x + frag.w / 2;
  const restCy = frag.y + frag.h / 2;

  // Spiral: blend the fragment's center toward screen center while orbiting.
  const angle = (frag.spin * Math.PI) / 180;
  const swirl = angle * t;
  const dx = restCx - CENTER_X;
  const dy = restCy - CENTER_Y;
  const radius = 1 - t; // collapses to 0 at the center
  const orbitedDx = (dx * Math.cos(swirl) - dy * Math.sin(swirl)) * radius;
  const orbitedDy = (dx * Math.sin(swirl) + dy * Math.cos(swirl)) * radius;
  const cx = CENTER_X + orbitedDx + jx;
  const cy = CENTER_Y + orbitedDy + jy;

  // Scale 1 → slight 1.1 (as the vacuum grabs) → 0 (swallowed).
  const scale = interpolate(t, [0, 0.18, 1], [1, 1.1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const rotate = frag.spin * t;
  // Subtle motion trail: opacity fades as it shrinks toward the center.
  const opacity = interpolate(t, [0, 0.55, 1], [1, 0.85, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Light, recognizable styling per kind — reads clearly against the grey bg.
  let bg: string = C.card;
  let border = `1px solid ${C.border}`;
  let color: string = C.softBlack;
  let shadow = "0 6px 20px rgba(0,0,0,0.28)";
  if (frag.kind === "conflict") {
    bg = "#FFF1F3";
    border = `1.5px solid ${C.rose}`;
    color = C.rose;
    shadow = "0 6px 22px rgba(244,63,94,0.32)";
  } else if (frag.kind === "postit") {
    bg = "#FCEFA8"; // dirty-yellow post-it
    border = "1px solid #E9CF5E";
    color = "#6B5A14";
    shadow = "0 10px 26px rgba(0,0,0,0.32)";
  } else if (frag.kind === "hours") {
    bg = "#FFF7E6";
    border = `1.5px solid ${C.orange}`;
    color = "#B45309";
    shadow = "0 6px 20px rgba(251,146,60,0.3)";
  }

  if (opacity <= 0) return null;

  return (
    <div
      style={{
        position: "absolute",
        left: cx - frag.w / 2,
        top: cy - frag.h / 2,
        width: frag.w,
        height: frag.h,
        background: bg,
        border,
        borderRadius: frag.kind === "postit" ? 6 : RADIUS,
        opacity,
        transform: `scale(${scale}) rotate(${rotate}deg)`,
        transformOrigin: "center center",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        textAlign: "center",
        boxShadow: shadow,
      }}
    >
      {frag.kind === "cell" ? (
        <>
          <span style={{ fontSize: 16, fontWeight: 600, color: C.subtle }}>
            {frag.label}
          </span>
          <span style={{ fontSize: 24, fontWeight: 700, color }}>
            {frag.sub}
          </span>
        </>
      ) : frag.kind === "postit" ? (
        <>
          <GraduationCap size={28} color="#6B5A14" />
          <span style={{ fontSize: 22, fontWeight: 700, color }}>
            {frag.label}
          </span>
        </>
      ) : (
        <span
          style={{
            fontSize: frag.kind === "conflict" ? 24 : 26,
            fontWeight: 700,
            color,
            letterSpacing: 0.3,
          }}
        >
          {frag.label}
        </span>
      )}
    </div>
  );
};

export const Scene03Vacuum: React.FC = () => {
  const f = useCurrentFrame();

  // Background crossfade: cold grey → Warm Linen over f30..115.
  const bgT = interpolate(f, [30, 115], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });
  const lerp = (a: number, b: number) => Math.round(a + (b - a) * bgT);
  // cold grey #2A2724 → warm linen #FAF9F7
  const bg = `rgb(${lerp(0x2a, 0xfa)}, ${lerp(0x27, 0xf9)}, ${lerp(0x24, 0xf7)})`;

  // A subtle inward "pull" vignette that intensifies while the vacuum is active,
  // then fades as the scene settles.
  const pull = interpolate(f, [20, 60, 100], [0, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const vignette = `radial-gradient(circle at 50% 50%, rgba(0,0,0,${
    0.34 * pull
  }) 0%, rgba(0,0,0,0) 42%)`;

  // The calm "held breath": a soft Vet Teal seed/ring breathes in after ~f100.
  const ringIn = interpolate(f, [100, 132], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  // Gentle continuous breathing once present (drives scale subtly).
  const breath = Math.sin((f - 100) / 16);
  const ringScale =
    (0.7 + 0.3 * ringIn) * (1 + 0.03 * Math.max(ringIn, 0) * breath);
  const dotScale =
    (0.6 + 0.4 * ringIn) * (1 + 0.05 * Math.max(ringIn, 0) * breath);

  return (
    <AbsoluteFill style={{ background: bg, fontFamily: FONT }}>
      {/* Inward-pull vignette (only visible while sucking). */}
      <AbsoluteFill style={{ background: vignette }} />

      {/* Chaos fragments spiraling into the center. */}
      {FRAGMENTS.map((frag, i) => (
        <FragmentView key={i} frag={frag} frame={f} />
      ))}

      {/* Calm resolution: outer ring + inner wash + seed dot in Vet Teal. */}
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div
          style={{
            position: "absolute",
            width: 220,
            height: 220,
            borderRadius: "50%",
            border: `2px solid ${C.vetTeal}`,
            opacity: 0.45 * ringIn,
            transform: `scale(${ringScale})`,
          }}
        />
        <div
          style={{
            position: "absolute",
            width: 96,
            height: 96,
            borderRadius: "50%",
            background: C.tealWash,
            opacity: 0.9 * ringIn,
            transform: `scale(${ringScale})`,
          }}
        />
        <div
          style={{
            position: "absolute",
            width: 30,
            height: 30,
            borderRadius: "50%",
            background: C.vetTeal,
            opacity: ringIn,
            transform: `scale(${dotScale})`,
            boxShadow: `0 0 28px rgba(0,149,136,${0.5 * ringIn})`,
          }}
        />
      </AbsoluteFill>

      <Caption
        frame={f}
        appearAt={95}
        text="Et si la semaine se construisait toute seule ?"
      />
    </AbsoluteFill>
  );
};
