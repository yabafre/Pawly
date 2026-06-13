import React from "react";
import {
  AbsoluteFill,
  interpolate,
  Easing,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { GraduationCap, Plus, AlertTriangle } from "lucide-react";
import { C, FONT } from "../theme";
import { AppWindow } from "../components/AppWindow";
import { Caption } from "../components/Caption";
import { FauxCursor } from "../components/FauxCursor";

// Scene 6 (36–44s of the full film, 240 frames) — "Honnêteté greedy".
// The grid is full and coherent but honestly imperfect: ONE hole cell (dashed
// border + Plus) and ONE orange conflict badge remain. A real-style health bar
// animates in. A dragged shift card drops into the hole (~f170): the dashed
// segment shrinks, the teal segment grows, and the subtitle moves toward "0 trou".

const DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
const SCHOOL_COL = 1; // Léa's Tuesday stays PURPLE for continuity.

type Row = {
  name: string;
  role: string;
  apprentice?: boolean;
  hours: string;
};

const ROWS: Row[] = [
  { name: "Dr. Camille Roussel", role: "Vétérinaire", hours: "35h" },
  {
    name: "Léa Martin",
    role: "ASV en alternance",
    apprentice: true,
    hours: "28h",
  },
  { name: "Sofiane Benali", role: "ASV", hours: "35h" },
  { name: "Inès Kaczmarek", role: "ASV", hours: "30h" },
];
const LEA = 1;

// Deterministic per-cell shift code, varied by index (never random).
const SHIFTS = ["08–14", "14–20", "09–17", "13–19", "10–16", "08–14"];
const SHIFT_COLORS = ["#E0F2F1", "#FDECEC", "#EAF3FF", "#F0ECFB", "#FDF3E6"];

// The single remaining hole + the single conflict badge.
const HOLE_R = 2;
const HOLE_C = 4;
const HOLE_SHIFT = "14–20";
const CONFLICT_R = 0;
const CONFLICT_C = 3;

const GRID_COLS = "230px repeat(6, 1fr) 96px";

// Timeline.
const DROP_START = 120;
const DROP_END = 170;

// A single static (already-filled) cell.
const FilledCell: React.FC<{ r: number; c: number; filled: boolean }> = ({
  r,
  c,
  filled,
}) => {
  const shift = SHIFTS[(r + c) % SHIFTS.length];
  const bg = SHIFT_COLORS[(r * 2 + c) % SHIFT_COLORS.length];
  const isConflict = r === CONFLICT_R && c === CONFLICT_C;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 5,
      }}
    >
      <div
        style={{
          position: "relative",
          width: "100%",
          minHeight: 56,
          borderRadius: 10,
          background: filled ? C.tealWash : bg,
          border: filled
            ? `1.5px solid ${C.vetTeal}`
            : "1px solid rgba(0,0,0,0.05)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: C.softBlack,
          fontWeight: 600,
          fontSize: 16,
        }}
      >
        {filled ? HOLE_SHIFT : shift}
        {isConflict && (
          <div
            style={{
              position: "absolute",
              top: -8,
              right: -8,
              width: 24,
              height: 24,
              borderRadius: 999,
              background: C.orange,
              border: "2px solid #ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 2px 6px rgba(251,146,60,0.5)",
            }}
          >
            <AlertTriangle size={13} color="#ffffff" strokeWidth={2.6} />
          </div>
        )}
      </div>
    </div>
  );
};

// Léa's purple "École" Tuesday cell.
const SchoolCell: React.FC = () => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 5,
    }}
  >
    <div
      style={{
        width: "100%",
        minHeight: 56,
        borderRadius: 10,
        background: C.schoolBg,
        border: `1.5px solid ${C.schoolBorder}`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 1,
      }}
    >
      <GraduationCap size={18} color={C.schoolText} />
      <span style={{ color: C.schoolText, fontWeight: 700, fontSize: 13 }}>
        École
      </span>
    </div>
  </div>
);

// The remaining hole: dashed muted border + Plus + small shift-type code.
const HoleCell: React.FC<{ filled: boolean; highlight: number }> = ({
  filled,
  highlight,
}) => {
  if (filled) {
    return <FilledCell r={HOLE_R} c={HOLE_C} filled />;
  }
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 5,
      }}
    >
      <div
        style={{
          width: "100%",
          minHeight: 56,
          borderRadius: 10,
          background: C.muted,
          border: `2px dashed ${C.subtle}`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 2,
          boxShadow: `0 0 0 ${3 * highlight}px rgba(0,149,136,${0.18 * highlight})`,
        }}
      >
        <Plus size={18} color={C.subtle} strokeWidth={2.4} />
        <span style={{ color: C.subtle, fontWeight: 700, fontSize: 12 }}>
          {HOLE_SHIFT}
        </span>
      </div>
    </div>
  );
};

// One segment of the health bar.
const Seg: React.FC<{ width: number; color: string; dashed?: boolean }> = ({
  width,
  color,
  dashed,
}) => (
  <div
    style={{
      width: `${width}%`,
      height: "100%",
      background: dashed ? C.muted : color,
      border: dashed ? `2px dashed ${C.subtle}` : "none",
      boxSizing: "border-box",
    }}
  />
);

export const Scene06GreedyHonesty: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();

  const intro = interpolate(f, [0, 18], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const winScale = 0.96 + 0.04 * intro;

  // Health bar fills from 0 via spring.
  const barGrow = spring({
    frame: f - 40,
    fps,
    config: { damping: 18, mass: 0.7 },
  });

  // Drop progress: the dragged card lands and the hole is filled.
  const drop = interpolate(f, [DROP_START, DROP_END], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });
  const filled = f >= DROP_END;

  // Health-bar segment widths — ALWAYS sum to 100%.
  // Honest "before": conflict + warning + hole are visible.
  const ROSE = 8; // 1 conflit (hard)
  const ORANGE = 14; // 1 avertissement (soft)
  const HOLE_FULL = 14; // 1 trou
  // On drop the hole transfers into healthy teal (hole → 0, teal grows).
  const hole = HOLE_FULL * (1 - drop);
  const teal = 100 - ROSE - ORANGE - hole;

  // Readiness % climbs 78 → 92 as the hole closes (still honest: conflict/warning remain).
  const ready = Math.round(interpolate(drop, [0, 1], [78, 92]));
  const holeCount = filled ? 0 : 1;
  const subtitle = `1 conflit · 1 avertissement · ${holeCount} trou · ${ready}% prêt`;

  // Dragged shift card: glides from a staging spot into the hole cell, then snaps.
  // Coordinates are in absolute composition space (1920×1080).
  const HOLE_X = 1268;
  const HOLE_Y = 470;
  const dragX = interpolate(f, [DROP_START, DROP_END], [1540, HOLE_X], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });
  const dragY = interpolate(f, [DROP_START, DROP_END], [688, HOLE_Y], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });
  const dragVisible = f >= DROP_START - 4 && f < DROP_END + 6;
  const dragOpacity = interpolate(
    f,
    [DROP_START - 4, DROP_START + 4, DROP_END - 2, DROP_END + 4],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const clicking = f >= DROP_START && f < DROP_END;
  // Hole gets a teal halo while the card hovers, to telegraph the valid drop target.
  const holeHighlight = interpolate(
    f,
    [DROP_START - 6, DROP_START + 6],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );

  return (
    <AbsoluteFill style={{ background: C.warmLinen, fontFamily: FONT }}>
      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "flex-start",
          paddingTop: 86,
        }}
      >
        <div
          style={{
            transform: `scale(${winScale})`,
            opacity: intro,
            width: 1520,
          }}
        >
          <AppWindow title="Pawly · Planning — juin 2026">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 14,
              }}
            >
              <div>
                <div
                  style={{ fontSize: 25, fontWeight: 700, color: C.softBlack }}
                >
                  Planning généré · semaine 24
                </div>
                <div style={{ fontSize: 15, color: C.subtle }}>
                  Le moteur s’arrête sur les trous impossibles à combler
                </div>
              </div>
            </div>

            {/* Header row */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: GRID_COLS,
                alignItems: "center",
                paddingBottom: 4,
              }}
            >
              <div />
              {DAYS.map((d, c) => (
                <div
                  key={c}
                  style={{
                    textAlign: "center",
                    fontWeight: 700,
                    fontSize: 16,
                    color: c === SCHOOL_COL ? C.schoolText : C.subtle,
                    padding: "6px 0",
                  }}
                >
                  {d}
                </div>
              ))}
              <div
                style={{
                  textAlign: "center",
                  fontWeight: 700,
                  fontSize: 15,
                  color: C.subtle,
                }}
              >
                Heures
              </div>
            </div>

            {/* Body rows */}
            {ROWS.map((e, r) => (
              <div
                key={r}
                style={{
                  display: "grid",
                  gridTemplateColumns: GRID_COLS,
                  alignItems: "stretch",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    padding: "6px 12px",
                  }}
                >
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 8 }}
                  >
                    <span
                      style={{
                        fontWeight: 600,
                        fontSize: 16,
                        color: C.softBlack,
                      }}
                    >
                      {e.name}
                    </span>
                    {e.apprentice && (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          letterSpacing: 0.5,
                          color: C.schoolText,
                          background: C.schoolBg,
                          border: `1px solid ${C.schoolBorder}`,
                          borderRadius: 999,
                          padding: "2px 7px",
                        }}
                      >
                        ALTERNANCE
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: 12, color: C.subtle }}>
                    {e.role}
                  </span>
                </div>

                {DAYS.map((_, c) => {
                  if (r === LEA && c === SCHOOL_COL) {
                    return <SchoolCell key={c} />;
                  }
                  if (r === HOLE_R && c === HOLE_C) {
                    return (
                      <HoleCell
                        key={c}
                        filled={filled}
                        highlight={holeHighlight}
                      />
                    );
                  }
                  return <FilledCell key={c} r={r} c={c} filled={false} />;
                })}

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <span
                    style={{
                      fontWeight: 700,
                      fontSize: 15,
                      color: C.softBlack,
                    }}
                  >
                    {e.hours}
                  </span>
                </div>
              </div>
            ))}

            {/* Health bar */}
            <div style={{ marginTop: 18 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 8,
                }}
              >
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    letterSpacing: 0.4,
                    color: C.subtle,
                    textTransform: "uppercase",
                  }}
                >
                  Santé du planning
                </span>
                <span
                  style={{ fontSize: 15, fontWeight: 700, color: C.vetTeal }}
                >
                  {ready}%
                </span>
              </div>
              <div
                style={{
                  position: "relative",
                  width: "100%",
                  height: 18,
                  borderRadius: 999,
                  overflow: "hidden",
                  background: C.muted,
                  border: `1px solid ${C.border}`,
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    width: `${barGrow * 100}%`,
                    overflow: "hidden",
                  }}
                >
                  <Seg width={ROSE} color={C.rose} />
                  <Seg width={ORANGE} color={C.orange} />
                  <Seg width={hole} color={C.muted} dashed />
                  <Seg width={teal} color={C.vetTeal} />
                </div>
              </div>
              <div
                style={{
                  marginTop: 8,
                  fontSize: 15,
                  fontWeight: 600,
                  color: C.subtle,
                  opacity: barGrow,
                }}
              >
                {subtitle}
              </div>
            </div>
          </AppWindow>
        </div>
      </AbsoluteFill>

      {/* Dragged shift card travelling into the hole */}
      {dragVisible && (
        <div
          style={{
            position: "absolute",
            left: dragX,
            top: dragY,
            opacity: dragOpacity,
            zIndex: 40,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 132,
            minHeight: 52,
            borderRadius: 10,
            background: C.tealWash,
            border: `1.5px solid ${C.vetTeal}`,
            color: C.softBlack,
            fontWeight: 700,
            fontSize: 16,
            boxShadow: "0 16px 36px rgba(0,149,136,0.32)",
            transform: `rotate(-3deg) scale(${1 - 0.04 * drop})`,
            transformOrigin: "top left",
          }}
        >
          {HOLE_SHIFT}
        </div>
      )}

      <Caption
        frame={f}
        appearAt={30}
        text="Le moteur laisse les trous impossibles. À vous d’ajuster en deux gestes."
      />

      <FauxCursor
        x={dragX + 96}
        y={dragY + 40}
        clicking={clicking}
        scale={dragVisible ? 1 : 0}
      />
    </AbsoluteFill>
  );
};
