import React from "react";
import { interpolate, Easing } from "remotion";
import { GraduationCap } from "lucide-react";
import { C } from "../theme";

type Emp = {
  name: string;
  role: string;
  apprentice?: boolean;
  hours: string;
  extra?: string;
};

const EMPLOYEES: Emp[] = [
  { name: "Dr. Camille Roussel", role: "Vétérinaire", hours: "35h" },
  { name: "Dr. Hugo Mercier", role: "Vétérinaire", hours: "35h" },
  {
    name: "Léa Martin",
    role: "ASV en alternance",
    apprentice: true,
    hours: "28h",
    extra: "+7h école",
  },
  { name: "Sofiane Benali", role: "ASV", hours: "35h" },
  { name: "Inès Kaczmarek", role: "ASV", hours: "30h" },
  { name: "Tom Delaunay", role: "ASV", hours: "32h" },
];
const DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
const LEA = 2;
const SCHOOL_COL = 1;
const SHIFTS = ["08–14", "14–20", "09–17", "13–19", "10–16", "08–14"];
const SHIFT_COLORS = ["#E0F2F1", "#FDECEC", "#EAF3FF", "#F0ECFB", "#FDF3E6"];

const FILL_START = 56;
const SCHOOL_LOCK = 50; // school cell locks FIRST, before its neighbours fill in
const GRID_COLS = "240px repeat(6, 1fr) 120px";

export const StaffGrid: React.FC<{ frame: number }> = ({ frame }) => {
  // Focus beat: gently dim non-Léa rows so the eye lands on the apprentice row.
  const focus = interpolate(frame, [72, 100, 240, 268], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const haloPulse = 0.4 + 0.35 * (0.5 + 0.5 * Math.sin(frame / 6));

  const renderCell = (r: number, c: number) => {
    const isSchool = r === LEA && c === SCHOOL_COL;
    const delay = isSchool ? SCHOOL_LOCK : FILL_START + c * 8 + r * 3;
    const p = interpolate(frame, [delay, delay + 14], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    });
    const dy = (1 - p) * (isSchool ? -12 : 8);

    if (isSchool) {
      return (
        <div
          key={c}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 6,
          }}
        >
          <div
            style={{
              position: "relative",
              width: "100%",
              minHeight: 64,
              borderRadius: 10,
              background: C.schoolBg,
              border: `1.5px solid ${C.schoolBorder}`,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 1,
              opacity: p,
              transform: `translateY(${dy}px) scale(${0.85 + 0.15 * p})`,
              boxShadow: `0 0 0 ${3 * p}px rgba(245,180,0,${haloPulse * p}), 0 0 ${24 * p}px rgba(245,180,0,${0.5 * haloPulse * p})`,
            }}
          >
            <GraduationCap size={22} color={C.schoolText} />
            <span
              style={{ color: C.schoolText, fontWeight: 700, fontSize: 16 }}
            >
              École
            </span>
            <span style={{ color: C.schoolText, fontSize: 12, opacity: 0.8 }}>
              +7h
            </span>
          </div>
        </div>
      );
    }

    const shift = SHIFTS[(r + c) % SHIFTS.length];
    const bg = SHIFT_COLORS[(r * 2 + c) % SHIFT_COLORS.length];
    return (
      <div
        key={c}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 6,
        }}
      >
        <div
          style={{
            width: "100%",
            minHeight: 64,
            borderRadius: 10,
            background: bg,
            border: "1px solid rgba(0,0,0,0.05)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: C.softBlack,
            fontWeight: 600,
            fontSize: 17,
            opacity: p,
            transform: `translateY(${dy}px) scale(${0.85 + 0.15 * p})`,
          }}
        >
          {shift}
        </div>
      </div>
    );
  };

  return (
    <div style={{ width: "100%" }}>
      {/* header */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: GRID_COLS,
          alignItems: "center",
          paddingBottom: 6,
        }}
      >
        <div />
        {DAYS.map((d, c) => (
          <div
            key={c}
            style={{
              textAlign: "center",
              fontWeight: 700,
              fontSize: 18,
              color: c === SCHOOL_COL ? C.schoolText : C.subtle,
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
            fontSize: 16,
            color: C.subtle,
          }}
        >
          Heures
        </div>
      </div>

      {/* rows */}
      {EMPLOYEES.map((e, r) => {
        const isLea = r === LEA;
        const rowOpacity = isLea ? 1 : 1 - 0.5 * focus;
        return (
          <div
            key={r}
            style={{
              display: "grid",
              gridTemplateColumns: GRID_COLS,
              alignItems: "stretch",
              opacity: rowOpacity,
              background: isLea
                ? `rgba(0,149,136,${0.06 * focus})`
                : "transparent",
              borderRadius: 12,
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
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{ fontWeight: 600, fontSize: 17, color: C.softBlack }}
                >
                  {e.name}
                </span>
                {e.apprentice && (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: 0.5,
                      color: C.schoolText,
                      background: C.schoolBg,
                      border: `1px solid ${C.schoolBorder}`,
                      borderRadius: 999,
                      padding: "2px 8px",
                    }}
                  >
                    ALTERNANCE
                  </span>
                )}
              </div>
              <span style={{ fontSize: 13, color: C.subtle }}>{e.role}</span>
            </div>
            {DAYS.map((_, c) => renderCell(r, c))}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span
                style={{ fontWeight: 700, fontSize: 16, color: C.softBlack }}
              >
                {e.hours}
              </span>
              {e.extra && (
                <span
                  style={{ fontSize: 12, color: C.schoolText, fontWeight: 600 }}
                >
                  {e.extra}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
