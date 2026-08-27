import React from "react";
import { spring, useVideoConfig } from "remotion";
import { GraduationCap } from "lucide-react";
import { C, MONO, FONT, SPRING } from "../theme";

type Emp = { name: string; role: string; apprentice?: boolean; hours: string };

// 5 employees × 5 days — the real team, on-DS (no rainbow pastels).
const EMPLOYEES: Emp[] = [
  { name: "Dr. Camille Roussel", role: "Vétérinaire", hours: "35h" },
  {
    name: "Léa Martin",
    role: "ASV en alternance",
    apprentice: true,
    hours: "28h",
  },
  { name: "Sofiane Benali", role: "ASV", hours: "35h" },
  { name: "Inès Kaczmarek", role: "ASV", hours: "30h" },
  { name: "Tom Delaunay", role: "ASV", hours: "32h" },
];
const DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven"];
const LEA = 1;
const SCHOOL_COL = 1; // Léa's Tuesday
const SHIFTS = ["08–14", "14–20", "09–17", "13–19", "10–16"];

const GRID_COLS = "240px repeat(5, 1fr) 120px";

// SIGNATURE prop: in "generate" mode the grid fills in a calm wave, and Léa's
// purple "École" cell LOCKS FIRST (the wedge). "static" holds the filled grid.
export const StaffGrid: React.FC<{
  frame: number;
  mode?: "generate" | "static";
  fillStart?: number;
  focus?: number; // 0..1 — dims non-Léa rows, lifts Léa's
  showBadge?: boolean; // "+7h école" on Léa's hours
  haloFrame?: number; // local frame at which the gold halo pulses (generate)
}> = ({
  frame,
  mode = "generate",
  fillStart = 8,
  focus = 0,
  showBadge = false,
  haloFrame = 4,
}) => {
  const { fps } = useVideoConfig();

  const cellIn = (delay: number) =>
    mode === "static"
      ? 1
      : spring({
          frame: frame - delay,
          fps,
          config: SPRING,
          durationInFrames: 22,
        });

  // Halo: one triangular pulse around haloFrame.
  const halo =
    mode === "static"
      ? 0
      : Math.max(0, 1 - Math.abs(frame - (fillStart + haloFrame)) / 11);

  const cell = (r: number, c: number) => {
    const isSchool = r === LEA && c === SCHOOL_COL;
    // School locks ~8 frames BEFORE the wave reaches it.
    const delay = isSchool ? fillStart - 14 : fillStart + c * 6 + r * 3;
    const p = cellIn(delay);
    const lift = (1 - p) * (isSchool ? -10 : 7);

    if (isSchool) {
      return (
        <div key={c} style={{ padding: 5, display: "flex" }}>
          <div
            style={{
              position: "relative",
              width: "100%",
              minHeight: 58,
              borderRadius: 10,
              background: C.schoolBg,
              border: `1.5px solid ${C.schoolBorder}`,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 2,
              opacity: p,
              transform: `translateY(${lift}px) scale(${0.96 + 0.04 * p})`,
              boxShadow: `0 0 0 ${4 * halo}px rgba(245,180,0,${0.45 * halo}), 0 0 ${26 * halo}px rgba(245,180,0,${0.4 * halo})`,
            }}
          >
            <GraduationCap size={20} color={C.schoolText} />
            <span
              style={{ color: C.schoolText, fontWeight: 700, fontSize: 15 }}
            >
              École
            </span>
          </div>
        </div>
      );
    }

    return (
      <div key={c} style={{ padding: 5, display: "flex" }}>
        <div
          style={{
            width: "100%",
            minHeight: 58,
            borderRadius: 10,
            background: C.tealWash,
            border: `1px solid ${C.border}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: MONO,
            color: C.vetTealDark,
            fontWeight: 500,
            fontSize: 17,
            opacity: p,
            transform: `translateY(${lift}px) scale(${0.96 + 0.04 * p})`,
          }}
        >
          {SHIFTS[(r + c) % SHIFTS.length]}
        </div>
      </div>
    );
  };

  return (
    <div style={{ width: "100%", fontFamily: FONT }}>
      {/* header */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: GRID_COLS,
          alignItems: "center",
        }}
      >
        <div />
        {DAYS.map((d, c) => (
          <div
            key={c}
            style={{
              textAlign: "center",
              fontWeight: 700,
              fontSize: 17,
              color: c === SCHOOL_COL ? C.schoolText : C.mutedFg,
              padding: "8px 0",
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
            color: C.mutedFg,
          }}
        >
          Heures
        </div>
      </div>

      {/* rows */}
      {EMPLOYEES.map((e, r) => {
        const isLea = r === LEA;
        const rowOpacity = isLea ? 1 : 1 - 0.45 * focus;
        return (
          <div
            key={r}
            style={{
              display: "grid",
              gridTemplateColumns: GRID_COLS,
              alignItems: "stretch",
              opacity: rowOpacity,
              background: isLea
                ? `rgba(0,149,136,${0.05 * focus})`
                : "transparent",
              borderRadius: 12,
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                padding: "6px 14px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{ fontWeight: 600, fontSize: 16, color: C.softBlack }}
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
                      padding: "2px 8px",
                    }}
                  >
                    APPRENTIE
                  </span>
                )}
              </div>
              <span style={{ fontSize: 12, color: C.mutedFg }}>{e.role}</span>
            </div>
            {DAYS.map((_, c) => cell(r, c))}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span
                style={{
                  fontFamily: MONO,
                  fontWeight: 600,
                  fontSize: 16,
                  color: C.softBlack,
                }}
              >
                {e.hours}
              </span>
              {isLea && showBadge && (
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: 12,
                    color: C.schoolText,
                    fontWeight: 600,
                  }}
                >
                  +7h école
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
