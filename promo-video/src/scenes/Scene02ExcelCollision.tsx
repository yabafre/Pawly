import React from "react";
import { AbsoluteFill, interpolate, Easing, useCurrentFrame } from "remotion";
import { GraduationCap, AlertTriangle } from "lucide-react";
import { C, FONT, RADIUS } from "../theme";
import { Caption } from "../components/Caption";

// Scene 2 (4–11s of the full film, 210 frames) — the Excel nightmare.
// Beat A (0–90): a dense, dirty-yellow/grey fake spreadsheet with pulsing red
// conflict cells, a blinking "Léa — école ??" cell, and skewed post-it notes.
// Beat B (90–210): the grid splits into a SCHOOL calendar (left) and the CLINIC
// grid (right). They slide together and COLLIDE on the "mardi" column ~frame 150
// with a short shake + rose flash. Everything is deterministic (row/col indexed).

const DIRTY_YELLOW = "#D9C66A"; // felt-pen highlight on the Tuesday column
const DIRTY_YELLOW_WASH = "#F2ECC2";
const GRID_GREY = "#9C988E";
const GRID_LINE = "#C9C4B8";
const PAPER = "#EDEAE2"; // grubby off-white spreadsheet paper

const EMPLOYEES = ["Léa", "Marc", "Sophie", "Karim", "Nadia", "Tom"];
const DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
const TUESDAY_COL = 1; // "Mar"

// Deterministic shift codes per cell, derived purely from row/col index.
const CODES = ["M", "AM", "J", "—", "M", "J", "AM", "—"];
function cellCode(row: number, col: number): string {
  return CODES[(row * 7 + col * 3) % CODES.length];
}
// A couple of cells flagged as hard conflicts (red), chosen by index.
function isConflict(row: number, col: number): boolean {
  return (row === 1 && col === 3) || (row === 4 && col === 4);
}

// ---------------------------------------------------------------------------
// Beat A — the dense spreadsheet
// ---------------------------------------------------------------------------

const HeaderCell: React.FC<{ label: string; tuesday: boolean }> = ({
  label,
  tuesday,
}) => (
  <div
    style={{
      flex: 1,
      padding: "10px 0",
      textAlign: "center",
      fontSize: 20,
      fontWeight: 700,
      color: tuesday ? "#7A6A12" : GRID_GREY,
      background: tuesday ? DIRTY_YELLOW : "#E2DECF",
      borderRight: `1px solid ${GRID_LINE}`,
      letterSpacing: 0.5,
    }}
  >
    {label}
  </div>
);

const DataCell: React.FC<{
  row: number;
  col: number;
  frame: number;
}> = ({ row, col, frame }) => {
  const tuesday = col === TUESDAY_COL;
  const conflict = isConflict(row, col);
  const blinking = row === 0 && tuesday; // Léa's Tuesday — the "école ??" cell

  // Red conflict cells pulse (sine wave from frame).
  const pulse = 0.5 + 0.5 * Math.sin((frame + (row + col) * 6) / 5);
  const conflictBg = conflict
    ? `rgba(244,63,94,${0.16 + 0.34 * pulse})`
    : "transparent";

  // Léa's Tuesday blinks between empty and "école ??".
  const blink = Math.sin(frame / 6) > 0;

  const baseBg = tuesday ? DIRTY_YELLOW_WASH : "transparent";

  return (
    <div
      style={{
        flex: 1,
        height: 56,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 18,
        fontWeight: 600,
        color: conflict ? C.rose : blinking ? C.schoolText : "#6F6A60",
        background: conflict ? conflictBg : baseBg,
        borderRight: `1px solid ${GRID_LINE}`,
        borderBottom: `1px solid ${GRID_LINE}`,
        position: "relative",
        fontStyle: blinking ? "italic" : "normal",
      }}
    >
      {blinking ? (
        <span style={{ opacity: blink ? 1 : 0.25 }}>école ??</span>
      ) : conflict ? (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
          }}
        >
          <AlertTriangle size={16} color={C.rose} />
          {cellCode(row, col)}
        </span>
      ) : (
        cellCode(row, col)
      )}
    </div>
  );
};

const ExcelGrid: React.FC<{ frame: number; mardiFlash: number }> = ({
  frame,
  mardiFlash,
}) => (
  <div
    style={{
      width: 980,
      background: PAPER,
      borderRadius: RADIUS,
      border: `2px solid ${GRID_LINE}`,
      boxShadow: "0 18px 50px rgba(26,26,26,0.18)",
      overflow: "hidden",
      position: "relative",
    }}
  >
    {/* sheet title bar */}
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "12px 16px",
        background: "#D7D2C4",
        borderBottom: `1px solid ${GRID_LINE}`,
        fontSize: 16,
        fontWeight: 700,
        color: "#6F6A60",
      }}
    >
      planning_v7_FINAL_vraiment(2).xlsx
    </div>

    {/* header row */}
    <div style={{ display: "flex" }}>
      <div
        style={{
          width: 150,
          padding: "10px 14px",
          fontSize: 18,
          fontWeight: 700,
          color: GRID_GREY,
          background: "#E2DECF",
          borderRight: `1px solid ${GRID_LINE}`,
        }}
      >
        Équipe
      </div>
      {DAYS.map((d, i) => (
        <HeaderCell key={d} label={d} tuesday={i === TUESDAY_COL} />
      ))}
    </div>

    {/* body rows */}
    {EMPLOYEES.map((name, row) => (
      <div key={name} style={{ display: "flex" }}>
        <div
          style={{
            width: 150,
            display: "flex",
            alignItems: "center",
            padding: "0 14px",
            height: 56,
            fontSize: 18,
            fontWeight: 600,
            color: "#55514A",
            background: "#E7E3D6",
            borderRight: `1px solid ${GRID_LINE}`,
            borderBottom: `1px solid ${GRID_LINE}`,
          }}
        >
          {name}
        </div>
        {DAYS.map((d, col) => (
          <DataCell key={d} row={row} col={col} frame={frame} />
        ))}
      </div>
    ))}

    {/* rose flash overlay on the mardi column (driven from Beat B collision) */}
    {mardiFlash > 0 ? (
      <div
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          // header "Équipe" col is 150px; each day col is (980-150)/6 wide.
          left: 150 + ((980 - 150) / 6) * TUESDAY_COL,
          width: (980 - 150) / 6,
          background: `rgba(244,63,94,${0.55 * mardiFlash})`,
          pointerEvents: "none",
        }}
      />
    ) : null}
  </div>
);

// ---------------------------------------------------------------------------
// Post-it notes (Beat A)
// ---------------------------------------------------------------------------

type PostIt = {
  text: string;
  left: number;
  top: number;
  rot: number; // resting rotation in deg
  bg: string;
  appear: number; // local frame it begins entering
};

const POSTITS: PostIt[] = [
  {
    text: "Marc indispo jeudi",
    left: 110,
    top: 150,
    rot: -7,
    bg: "#FBE38A",
    appear: 14,
  },
  {
    text: "repos légal ?",
    left: 1560,
    top: 210,
    rot: 6,
    bg: "#F8C8A0",
    appear: 26,
  },
  {
    text: "qui ferme samedi ?",
    left: 1490,
    top: 640,
    rot: -4,
    bg: "#C9E6A6",
    appear: 38,
  },
];

const PostItNote: React.FC<{ note: PostIt; frame: number }> = ({
  note,
  frame,
}) => {
  // Enter with a slight stagger + micro-rotation overshoot, then settle.
  const t = interpolate(frame, [note.appear, note.appear + 16], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.back(1.6)),
  });
  const o = interpolate(frame, [note.appear, note.appear + 8], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  // Micro-rotation: overshoots past resting angle, settles back.
  const rot = note.rot + (1 - t) * (note.rot < 0 ? 8 : -8);
  const scale = 0.7 + 0.3 * t;

  return (
    <div
      style={{
        position: "absolute",
        left: note.left,
        top: note.top,
        width: 200,
        height: 130,
        background: note.bg,
        borderRadius: 4,
        boxShadow: "0 10px 24px rgba(26,26,26,0.22)",
        opacity: o,
        transform: `rotate(${rot}deg) scale(${scale})`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: 16,
        fontSize: 22,
        fontWeight: 700,
        color: "#5A4A14",
        fontFamily: "'Comic Sans MS', " + FONT,
      }}
    >
      {note.text}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Beat B — split panels (school calendar + clinic grid)
// ---------------------------------------------------------------------------

// Real June 2026 layout: the month starts on a Monday and has 30 days, so a
// Lun–Dim grid puts every Tuesday at column 1 → 2, 9, 16, 23, 30.
const CAL_DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const JUNE_DAYS = 30;

const SchoolPanel: React.FC<{ frame: number }> = ({ frame }) => {
  // Mini month calendar; Tuesdays carry a GraduationCap. 5 weeks x 7 cols (Lun–Dim).
  const weeks = 5;
  return (
    <div
      style={{
        width: 520,
        background: C.schoolBg,
        border: `2px solid ${C.schoolBorder}`,
        borderRadius: RADIUS,
        boxShadow: "0 18px 50px rgba(126,34,206,0.18)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "16px 20px",
          background: "#F3E8FF",
          borderBottom: `1px solid ${C.schoolBorder}`,
          fontSize: 22,
          fontWeight: 700,
          color: C.schoolText,
        }}
      >
        <GraduationCap size={26} color={C.schoolText} />
        Calendrier — École de Léa
      </div>
      <div style={{ display: "flex" }}>
        {CAL_DAYS.map((d, i) => (
          <div
            key={d}
            style={{
              flex: 1,
              textAlign: "center",
              padding: "8px 0",
              fontSize: 15,
              fontWeight: 700,
              color: i === TUESDAY_COL ? C.schoolText : "#A78BC2",
            }}
          >
            {d}
          </div>
        ))}
      </div>
      {Array.from({ length: weeks }).map((_, w) => (
        <div key={w} style={{ display: "flex" }}>
          {CAL_DAYS.map((d, col) => {
            const dayNum = w * 7 + col + 1;
            const inMonth = dayNum <= JUNE_DAYS;
            const tuesday = col === TUESDAY_COL && inMonth;
            // Tuesdays pulse gently to draw the eye.
            const pulse = 0.5 + 0.5 * Math.sin((frame + w * 8) / 7);
            return (
              <div
                key={d}
                style={{
                  flex: 1,
                  height: 64,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 2,
                  borderRight: `1px solid ${C.schoolBorder}`,
                  borderBottom: `1px solid ${C.schoolBorder}`,
                  background: tuesday
                    ? `rgba(233,213,255,${0.45 + 0.4 * pulse})`
                    : "transparent",
                  color: tuesday ? C.schoolText : "#B9A6CF",
                  fontSize: 14,
                  fontWeight: 600,
                }}
              >
                <span>{inMonth ? dayNum : ""}</span>
                {tuesday ? (
                  <GraduationCap size={18} color={C.schoolText} />
                ) : null}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
};

const ClinicPanel: React.FC<{ frame: number; mardiFlash: number }> = ({
  frame,
  mardiFlash,
}) => {
  const cols = DAYS;
  const rows = ["Accueil", "Soins", "Chirurgie", "Garde"];
  return (
    <div
      style={{
        width: 520,
        background: C.card,
        border: `2px solid ${C.border}`,
        borderRadius: RADIUS,
        boxShadow: "0 18px 50px rgba(0,149,136,0.16)",
        overflow: "hidden",
        position: "relative",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "16px 20px",
          background: C.tealWash,
          borderBottom: `1px solid ${C.border}`,
          fontSize: 22,
          fontWeight: 700,
          color: C.vetTealDark,
        }}
      >
        Clinique — besoins en personnel
      </div>
      <div style={{ display: "flex" }}>
        <div style={{ width: 120 }} />
        {cols.map((d, i) => (
          <div
            key={d}
            style={{
              flex: 1,
              textAlign: "center",
              padding: "8px 0",
              fontSize: 15,
              fontWeight: 700,
              color: i === TUESDAY_COL ? C.vetTealDark : C.subtle,
            }}
          >
            {d}
          </div>
        ))}
      </div>
      {rows.map((r, ri) => (
        <div key={r} style={{ display: "flex" }}>
          <div
            style={{
              width: 120,
              display: "flex",
              alignItems: "center",
              padding: "0 12px",
              height: 60,
              fontSize: 15,
              fontWeight: 600,
              color: C.softBlack,
              background: C.muted,
              borderRight: `1px solid ${C.border}`,
              borderBottom: `1px solid ${C.border}`,
            }}
          >
            {r}
          </div>
          {cols.map((d, col) => {
            const tuesday = col === TUESDAY_COL;
            const needed = (ri + col) % 2 === 0 ? "2" : "1";
            const pulse = 0.5 + 0.5 * Math.sin((frame + ri * 5) / 6);
            return (
              <div
                key={d}
                style={{
                  flex: 1,
                  height: 60,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 16,
                  fontWeight: 700,
                  borderRight: `1px solid ${C.border}`,
                  borderBottom: `1px solid ${C.border}`,
                  background: tuesday
                    ? `rgba(0,149,136,${0.1 + 0.14 * pulse})`
                    : "transparent",
                  color: tuesday ? C.vetTealDark : C.subtle,
                }}
              >
                {needed}
              </div>
            );
          })}
        </div>
      ))}

      {/* rose flash on the clinic's mardi column at collision */}
      {mardiFlash > 0 ? (
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: 120 + ((520 - 120) / 6) * TUESDAY_COL,
            width: (520 - 120) / 6,
            background: `rgba(244,63,94,${0.5 * mardiFlash})`,
            pointerEvents: "none",
          }}
        />
      ) : null}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Scene root
// ---------------------------------------------------------------------------

export const Scene02ExcelCollision: React.FC = () => {
  const f = useCurrentFrame();

  // --- Beat A: spreadsheet present 0–~100, slow drift scale 1.0 -> 1.06 ---
  const driftScale = interpolate(f, [0, 90], [1.0, 1.06], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  // Beat A fades/scales out as Beat B takes over (90–110).
  const aOut = interpolate(f, [90, 112], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });

  // --- Beat B: panels slide toward each other; collide on mardi ~frame 150 ---
  const bIn = interpolate(f, [96, 116], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  // Approach: from far apart toward each other, easing into the collision frame.
  // They STOP with a preserved gap (resting at 0) so they never overlap the badge.
  const approach = interpolate(f, [116, 150], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.quad),
  });
  const leftX = interpolate(approach, [0, 1], [-560, 0]);
  const rightX = interpolate(approach, [0, 1], [560, 0]);

  // 3-frame shake at impact (150–153), decaying micro-wobble after.
  const impact = f - 150;
  const shakeEnv = interpolate(f, [150, 153, 168], [1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const shake =
    f >= 150 && f <= 168 ? Math.sin(impact * 3.4) * 16 * shakeEnv : 0;
  const shakeY =
    f >= 150 && f <= 168 ? Math.cos(impact * 3.0) * 8 * shakeEnv : 0;

  // Rose flash on the mardi column: spikes at impact, fades out.
  const mardiFlash = interpolate(f, [150, 152, 174], [0, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Collision "MARDI" badge appears at impact with a back-eased pop-in.
  const badgeIn = interpolate(f, [150, 158], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.back(2)),
  });
  // Subtle impact pulse (sine) that lives at/after the collision frame.
  const pulseEnv = interpolate(f, [150, 200], [1, 0.35], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const badgePulse =
    f >= 150 ? 1 + 0.08 * pulseEnv * Math.sin((f - 150) / 3) : 1;
  const badgeScale = badgeIn * badgePulse;

  return (
    <AbsoluteFill style={{ background: "#E4E0D6", fontFamily: FONT }}>
      {/* dirty paper vignette so the muted palette reads as "old Excel" */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(circle at 50% 42%, rgba(255,255,255,0.5), rgba(120,114,98,0.12) 70%, rgba(90,84,70,0.22))",
        }}
      />

      {/* ---------------- Beat A ---------------- */}
      {aOut > 0 ? (
        <AbsoluteFill
          style={{
            opacity: aOut,
            alignItems: "center",
            justifyContent: "center",
            transform: `scale(${driftScale * (0.9 + 0.1 * aOut)})`,
          }}
        >
          <ExcelGrid frame={f} mardiFlash={0} />
        </AbsoluteFill>
      ) : null}

      {/* post-its float above the grid during Beat A */}
      {aOut > 0
        ? POSTITS.map((note) => (
            <div key={note.text} style={{ opacity: aOut }}>
              <PostItNote note={note} frame={f} />
            </div>
          ))
        : null}

      {/* ---------------- Beat B ---------------- */}
      {bIn > 0 ? (
        <AbsoluteFill
          style={{
            opacity: bIn,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              // A clear, FIXED horizontal gap between the panels — the badge lives
              // here and the panels rest against the gap edges, never overlapping it.
              gap: 120,
              transform: `translateX(${shake}px) translateY(${shakeY}px)`,
            }}
          >
            <div style={{ transform: `translateX(${leftX}px)` }}>
              <SchoolPanel frame={f} />
            </div>

            {/* central conflict badge — self-contained, centered in the gap,
                high zIndex + overflow visible so it is NEVER clipped */}
            <div
              style={{
                position: "relative",
                width: 0,
                height: 360,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "visible",
                zIndex: 10,
              }}
            >
              {/* thin clean centered divider — does not overlap the badge text */}
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  bottom: 0,
                  left: "50%",
                  transform: "translateX(-50%)",
                  width: 2,
                  background: `rgba(244,63,94,${0.18 + 0.42 * mardiFlash})`,
                  borderRadius: 2,
                }}
              />
              {/* the conflict pill */}
              <div
                style={{
                  position: "absolute",
                  left: "50%",
                  top: "50%",
                  transform: `translate(-50%,-50%) scale(${badgeScale})`,
                  opacity: badgeIn,
                  background: C.rose,
                  color: "white",
                  fontWeight: 800,
                  fontSize: 22,
                  letterSpacing: 1.5,
                  padding: "14px 24px",
                  borderRadius: 999,
                  whiteSpace: "nowrap",
                  boxShadow: "0 12px 32px rgba(244,63,94,0.45)",
                  border: "3px solid white",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  overflow: "visible",
                }}
              >
                <AlertTriangle size={22} color="white" />
                MARDI
              </div>
            </div>

            <div style={{ transform: `translateX(${rightX}px)` }}>
              <ClinicPanel frame={f} mardiFlash={mardiFlash} />
            </div>
          </div>
        </AbsoluteFill>
      ) : null}

      <Caption
        frame={f}
        appearAt={120}
        text="L'école d'un côté. La clinique de l'autre. Le mardi, les deux en même temps."
      />
    </AbsoluteFill>
  );
};
