import React from "react";
import { AbsoluteFill, interpolate, Easing, useCurrentFrame } from "remotion";
import { C, FONT, MONO } from "../theme";
import { BreathingGradient } from "../components/BreathingGradient";
import { AppWindow } from "../components/AppWindow";
import { StaffGrid } from "../components/StaffGrid";
import { Caption } from "../components/Caption";

// Scene 3 "Le pourquoi" (7–12s, 150 frames). The FILLED grid holds dead still.
// A compact left rail of three Geist-Mono constraint labels draws one fine teal
// beam each, converging into the grid, then the whole rail retires so it never
// lingers. Léa's "+7h école" badge (StaffGrid native) reads on her row.
// Layout is a CENTERED flex [rail | window] group so nothing leaves the frame.

const LABELS = ["Repos légal", "Disponibilités", "Jours d’école"] as const;
const LABEL_Y = [150, 234, 318]; // beam origins (rail-local)

const BEAM_LEN = 320;
const BEAM_START = 40;
const BEAM_STAGGER = 6;
const BEAM_DRAW = 18;
const BEAM_FADE = 95;

// Three fine beams in one overflow-visible svg, converging from the labels into
// the grid. Drawn left→right via stroke-dashoffset, eased like the rest of the film.
const ConstraintBeams: React.FC<{ frame: number }> = ({ frame }) => (
  <svg
    width={340}
    height={460}
    viewBox="0 0 340 460"
    style={{ position: "absolute", inset: 0, overflow: "visible" }}
  >
    <defs>
      <linearGradient id="beam-grad" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor={C.vetTeal} stopOpacity={0.12} />
        <stop offset="100%" stopColor={C.vetTeal} stopOpacity={0.85} />
      </linearGradient>
    </defs>
    {LABEL_Y.map((y, i) => {
      const start = BEAM_START + i * BEAM_STAGGER;
      const draw = interpolate(
        frame,
        [start, start + BEAM_DRAW],
        [BEAM_LEN, 0],
        {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        },
      );
      return (
        <path
          key={i}
          d={`M 214 ${y} C 300 ${y}, 380 234, 474 234`}
          fill="none"
          stroke="url(#beam-grad)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeDasharray={BEAM_LEN}
          strokeDashoffset={draw}
        />
      );
    })}
  </svg>
);

export const SceneWhy: React.FC = () => {
  const f = useCurrentFrame();

  const intro = interpolate(f, [0, 16], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const winScale = 0.97 + 0.03 * intro;

  // Focus settles on Léa's row over frames 40–70.
  const focusValue = interpolate(f, [40, 70], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  const labelOpacity = (i: number) =>
    interpolate(
      f,
      [BEAM_START + i * BEAM_STAGGER - 8, BEAM_START + i * BEAM_STAGGER],
      [0, 1],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
    );
  const railFade = interpolate(f, [BEAM_FADE, BEAM_FADE + 12], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });

  return (
    <AbsoluteFill style={{ fontFamily: FONT }}>
      <BreathingGradient />

      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            transform: `scale(${winScale})`,
            opacity: intro,
          }}
        >
          {/* Left rail — labels + converging beams, all inside the frame. */}
          <div
            style={{
              position: "relative",
              width: 340,
              height: 460,
              flexShrink: 0,
              opacity: railFade,
            }}
          >
            {LABELS.map((label, i) => (
              <span
                key={label}
                style={{
                  position: "absolute",
                  right: 150,
                  top: LABEL_Y[i] - 13,
                  fontFamily: MONO,
                  fontSize: 18,
                  fontWeight: 500,
                  color: C.mutedFg,
                  whiteSpace: "nowrap",
                  textAlign: "right",
                  opacity: labelOpacity(i),
                }}
              >
                {`« ${label} »`}
              </span>
            ))}
            <ConstraintBeams frame={f} />
          </div>

          {/* The still grid window. */}
          <div style={{ width: 1280, flexShrink: 0 }}>
            <AppWindow title="Pawly · Planning — juin 2026">
              <StaffGrid frame={f} mode="static" focus={focusValue} showBadge />
            </AppWindow>
          </div>
        </div>
      </AbsoluteFill>

      <Caption
        frame={f}
        appearAt={30}
        text="Repos légal · Disponibilités · Jours d’école — respectés automatiquement."
      />
    </AbsoluteFill>
  );
};
