import React from "react";
import {
  AbsoluteFill,
  interpolate,
  Easing,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { C, FONT, MONO } from "../theme";
import { BreathingGradient } from "../components/BreathingGradient";
import { AppWindow } from "../components/AppWindow";
import { StaffGrid } from "../components/StaffGrid";
import { Caption } from "../components/Caption";

// Scene 3 "Le pourquoi" (7–12s, 150 frames). The FILLED grid holds dead still.
// We explain the constraints with ONE beam group: three Geist-Mono labels to the
// LEFT draw a fine teal beam each toward the grid, then fade out so they never
// linger. Léa's "+7h école" badge scales in with the ONE spring. Two elements
// animate per the restraint rule: the beam group, then the badge.

// The three constraints, top→bottom. Each owns a beam staggered 6 frames apart.
const LABELS = ["Repos légal", "Disponibilités", "Jours d’école"] as const;

// Beam-draw timing (one shared length so stroke-dashoffset reads L→0 cleanly).
const BEAM_LEN = 220;
const BEAM_START = 44; // first beam begins to draw
const BEAM_STAGGER = 6; // 6 frames between beams
const BEAM_DRAW = 18; // each beam draws over ~18 frames
const BEAM_FADE = 95; // the whole group fades out around here

// Léa's badge spring kicks in ~frame 80.
const BADGE_START = 80;

// One fine SVG beam, drawn left→right via stroke-dashoffset, eased like the film.
const ConstraintBeam: React.FC<{
  frame: number;
  index: number;
  gradientId: string;
}> = ({ frame, index, gradientId }) => {
  const start = BEAM_START + index * BEAM_STAGGER;
  const draw = interpolate(frame, [start, start + BEAM_DRAW], [BEAM_LEN, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  // Group fade-out: the beams retire so they never linger over the grid.
  const fade = interpolate(frame, [BEAM_FADE, BEAM_FADE + 12], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  // A gentle downward bow toward the grid row the label points at.
  const dy = (index - 1) * 26;
  return (
    <svg
      width={BEAM_LEN}
      height={120}
      viewBox={`0 0 ${BEAM_LEN} 120`}
      style={{ position: "absolute", left: 0, top: 60 - dy, opacity: fade }}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={C.vetTeal} stopOpacity={0.15} />
          <stop offset="100%" stopColor={C.vetTeal} stopOpacity={0.9} />
        </linearGradient>
      </defs>
      <path
        d={`M 0 60 C ${BEAM_LEN * 0.45} 60, ${BEAM_LEN * 0.6} ${60 + dy}, ${BEAM_LEN} ${60 + dy}`}
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeWidth={2}
        strokeLinecap="round"
        strokeDasharray={BEAM_LEN}
        strokeDashoffset={draw}
      />
    </svg>
  );
};

export const SceneWhy: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Window settles once, then holds. Subtle, single, ease-out entrance.
  const intro = interpolate(f, [0, 16], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const winScale = 0.97 + 0.03 * intro;

  // Focus animates 0→1 over ~frames 40–70 to settle on Léa's row.
  const focusValue = interpolate(f, [40, 70], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  // The labels fade in just before their beams draw, in the same stagger.
  const labelOpacity = (i: number) =>
    interpolate(
      f,
      [BEAM_START + i * BEAM_STAGGER - 8, BEAM_START + i * BEAM_STAGGER],
      [0, 1],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
    );
  // The whole left rail retires with its beams.
  const railFade = interpolate(f, [BEAM_FADE, BEAM_FADE + 12], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });

  // Element 2: the "+7h école" badge scales in on Léa's hours with the ONE spring.
  const badge = spring({
    frame: f - BADGE_START,
    fps,
    config: { stiffness: 300, damping: 30 },
    durationInFrames: 18,
  });

  return (
    <AbsoluteFill style={{ fontFamily: FONT }}>
      <BreathingGradient />

      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "center",
          paddingLeft: 120,
        }}
      >
        {/* Stage: left constraint rail + the still grid window. */}
        <div
          style={{
            position: "relative",
            transform: `scale(${winScale})`,
            opacity: intro,
            width: 1500,
          }}
        >
          {/* Left rail — three Geist-Mono labels, each firing one fine beam. */}
          <div
            style={{
              position: "absolute",
              left: -300,
              top: "50%",
              transform: "translateY(-50%)",
              width: 280,
              opacity: railFade,
            }}
          >
            {LABELS.map((label, i) => (
              <div
                key={label}
                style={{
                  position: "relative",
                  height: 96,
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: 17,
                    fontWeight: 500,
                    color: C.mutedFg,
                    whiteSpace: "nowrap",
                    opacity: labelOpacity(i),
                  }}
                >
                  {`« ${label} »`}
                </span>
                {/* Beam anchored just right of the label, reaching to the grid. */}
                <div style={{ position: "absolute", left: 200, top: -36 }}>
                  <ConstraintBeam
                    frame={f}
                    index={i}
                    gradientId={`beam-grad-${i}`}
                  />
                </div>
              </div>
            ))}
          </div>

          <AppWindow title="Pawly · Planning — juin 2026">
            <StaffGrid
              frame={f}
              mode="static"
              focus={focusValue}
              showBadge={false}
            />

            {/* Element 2 overlay: Léa's "+7h école" badge, spring scale-in.
                Positioned over the Heures column on Léa's row (row 1). */}
            <div
              style={{
                position: "absolute",
                right: 28 + 60,
                top: 196,
                transform: `translateX(50%) scale(${badge})`,
                opacity: badge,
                pointerEvents: "none",
              }}
            >
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: 13,
                  fontWeight: 600,
                  color: C.schoolText,
                  background: C.schoolBg,
                  border: `1px solid ${C.schoolBorder}`,
                  borderRadius: 999,
                  padding: "3px 10px",
                  whiteSpace: "nowrap",
                }}
              >
                +7h école
              </span>
            </div>
          </AppWindow>
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