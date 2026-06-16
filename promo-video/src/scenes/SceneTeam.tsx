import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  Easing,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { GraduationCap, Clock, Loader2, Check, PawPrint } from "lucide-react";
import { C, FONT, MONO, SPRING } from "../theme";
import { BreathingGradient } from "../components/BreathingGradient";
import { Caption } from "../components/Caption";

// Scene 7 "Côté équipe" (30–36s, 180 frames) — the employee PWA, confirm.
//
// CLINIQUE ZEN BY RESTRAINT: the phone holds DEAD STILL the entire scene — a fixed
// subtle perspective transform that is NEVER animated. The décor (status bar, header,
// three day rows incl. the purple "École" Mardi entry) is set once and never moves.
// The ONLY motion in the whole scene is the confirm BUTTON's 3-state machine, driven
// purely by frame thresholds (NOT a draggable slider):
//   idle → press (~frame 90, scale 0.97 + spinner) → "Présence confirmée" (Check springs in).
// That single clinical gesture is what reads as credible against the still frame.

interface DayRow {
  label: string;
  day: string;
  start: string;
  end: string;
  hours?: string;
  school?: boolean;
}

// Three days only — Léa's week, with Mardi as the real purple "École" signal cell.
const WEEK: DayRow[] = [
  { label: "Lun", day: "Lundi", start: "09:00", end: "18:00", hours: "8h" },
  { label: "Mar", day: "Mardi", start: "École", end: "", school: true },
  { label: "Mer", day: "Mercredi", start: "09:00", end: "18:00", hours: "8h" },
];

// One static day row. No per-frame animation — the décor holds dead still.
const DayItem: React.FC<{ row: DayRow }> = ({ row }) => {
  const isSchool = !!row.school;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "13px 14px",
        borderRadius: 14,
        background: isSchool ? C.schoolBg : C.card,
        border: `1px solid ${isSchool ? C.schoolBorder : C.border}`,
        boxShadow: isSchool
          ? "0 6px 14px rgba(126,34,206,0.10)"
          : "0 4px 12px rgba(26,26,26,0.05)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {/* Day-letter chip */}
        <div
          style={{
            width: 42,
            height: 42,
            borderRadius: 11,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: isSchool ? "#fff" : C.muted,
            border: `1px solid ${isSchool ? C.schoolBorder : C.border}`,
            color: isSchool ? C.schoolText : C.mutedFg,
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 700, lineHeight: 1 }}>
            {row.label}
          </span>
        </div>
        {/* Day name + shift / school line */}
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <span
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: isSchool ? C.schoolText : C.softBlack,
            }}
          >
            {row.day}
          </span>
          {isSchool ? (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <GraduationCap size={15} color={C.schoolText} strokeWidth={2.2} />
              <span
                style={{ fontSize: 13, fontWeight: 600, color: C.schoolText }}
              >
                École
              </span>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Clock size={14} color={C.mutedFg} strokeWidth={2.2} />
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: C.mutedFg,
                  fontFamily: MONO,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {`${row.start} – ${row.end}`}
              </span>
            </div>
          )}
        </div>
      </div>
      {/* Right-side meta — hours pill (teal) or "École" badge (purple) */}
      {isSchool ? (
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: C.schoolText,
            background: "#fff",
            border: `1px solid ${C.schoolBorder}`,
            borderRadius: 999,
            padding: "4px 10px",
          }}
        >
          École
        </span>
      ) : (
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: C.vetTealDark,
            background: C.tealWash,
            borderRadius: 999,
            padding: "4px 10px",
            fontFamily: MONO,
          }}
        >
          {row.hours}
        </span>
      )}
    </div>
  );
};

// The ONLY animated element of the scene — a 3-state confirm BUTTON (never a drag
// handle). State is a pure function of the frame: idle → confirming (~90) → confirmed.
const ConfirmButton: React.FC<{ frame: number; fps: number }> = ({
  frame,
  fps,
}) => {
  const TAP = 132; // tap later — give time to read the week (incl. Mardi École)
  const CONFIRMING_UNTIL = TAP + 18; // ~0.6s spinner
  const confirming = frame >= TAP && frame < CONFIRMING_UNTIL;
  const confirmed = frame >= CONFIRMING_UNTIL;

  // Press-in feedback at the tap moment (subtle 0.97 scale, ease in/out around tap).
  const press = interpolate(frame, [TAP - 2, TAP, TAP + 4], [1, 0.97, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });

  // The ONE spring (stiffness 300, damping 30) settles the confirmed state.
  const settle = spring({
    frame: frame - CONFIRMING_UNTIL,
    fps,
    config: SPRING,
    durationInFrames: 14,
  });
  const confirmedScale = interpolate(settle, [0, 1], [0.96, 1]);
  // Check icon scales in via the same spring.
  const checkScale = confirmed ? interpolate(settle, [0, 1], [0, 1]) : 0;

  const scale = confirmed ? confirmedScale : press;
  const spin = (frame - TAP) * 22; // spinner rotation while confirming

  const bg = confirming ? C.vetTealDark : C.vetTeal;
  const label = confirmed
    ? "Présence confirmée"
    : confirming
      ? "Confirmation…"
      : "Confirmer ma présence";

  return (
    <div
      style={{
        transform: `scale(${scale})`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        height: 56,
        borderRadius: 14,
        background: bg,
        color: "#fff",
        fontSize: 17,
        fontWeight: 700,
        boxShadow: confirmed
          ? "0 10px 24px rgba(0,149,136,0.32)"
          : "0 8px 18px rgba(0,149,136,0.22)",
      }}
    >
      {confirming && (
        <span
          style={{ display: "inline-flex", transform: `rotate(${spin}deg)` }}
        >
          <Loader2 size={20} color="#fff" strokeWidth={2.6} />
        </span>
      )}
      {confirmed && (
        <span
          style={{
            display: "inline-flex",
            transform: `scale(${checkScale})`,
          }}
        >
          <Check size={21} color="#fff" strokeWidth={3} />
        </span>
      )}
      <span>{label}</span>
    </div>
  );
};

export const SceneTeam: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const PHONE_W = 380;
  const PHONE_H = 780;

  // The confirmation-line under the button reveals (crossfade) once the presence is
  // confirmed — a quiet effect that is a direct consequence of the one button press.
  const noticeReveal = interpolate(frame, [150, 164], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  return (
    <AbsoluteFill style={{ fontFamily: FONT }}>
      <BreathingGradient />

      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        {/* Phone holds DEAD STILL — a fixed subtle perspective, never animated. */}
        <div
          style={{
            transform: "perspective(1600px) rotateY(-8deg) rotateX(3deg)",
          }}
        >
          <div
            style={{
              position: "relative",
              width: PHONE_W,
              height: PHONE_H,
              borderRadius: 52,
              background: "#0E0E10",
              padding: 13,
              boxShadow:
                "0 40px 90px rgba(26,26,26,0.32), 0 8px 24px rgba(26,26,26,0.2)",
            }}
          >
            {/* Screen */}
            <div
              style={{
                position: "relative",
                width: "100%",
                height: "100%",
                borderRadius: 40,
                background: C.card,
                overflow: "hidden",
              }}
            >
              {/* Notch */}
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: "50%",
                  transform: "translateX(-50%)",
                  width: 132,
                  height: 26,
                  background: "#0E0E10",
                  borderBottomLeftRadius: 16,
                  borderBottomRightRadius: 16,
                  zIndex: 30,
                }}
              />

              {/* Status bar — Geist-Mono time + small Pawly wordmark */}
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  height: 44,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0 26px",
                  fontSize: 13,
                  fontWeight: 700,
                  color: C.softBlack,
                  zIndex: 20,
                }}
              >
                <span
                  style={{
                    fontFamily: MONO,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  09:41
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <PawPrint size={14} color={C.vetTeal} strokeWidth={2.4} />
                  <span style={{ color: C.softBlack }}>Pawly</span>
                </span>
              </div>

              {/* App body — set once, holds still */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  paddingTop: 56,
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                {/* Header — « Ma semaine » */}
                <div
                  style={{
                    padding: "16px 22px 14px",
                    borderBottom: `1px solid ${C.border}`,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 25,
                        fontWeight: 800,
                        color: C.softBlack,
                        letterSpacing: -0.4,
                      }}
                    >
                      Ma semaine
                    </div>
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 999,
                        background: C.tealWash,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 13,
                        fontWeight: 800,
                        color: C.vetTealDark,
                      }}
                    >
                      LM
                    </div>
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: C.mutedFg,
                      marginTop: 5,
                    }}
                  >
                    Léa Martin · Apprentie
                  </div>
                </div>

                {/* Day list — three static rows incl. the purple Mardi "École" */}
                <div
                  style={{
                    padding: "16px 18px 0",
                    display: "flex",
                    flexDirection: "column",
                    gap: 11,
                    flex: 1,
                  }}
                >
                  {WEEK.map((row) => (
                    <DayItem key={row.label} row={row} />
                  ))}
                </div>

                {/* Confirm button (the single animated element) + notice line */}
                <div
                  style={{
                    padding: "16px 18px 34px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                  }}
                >
                  <ConfirmButton frame={frame} fps={fps} />
                  <div
                    style={{
                      opacity: noticeReveal,
                      textAlign: "center",
                      fontSize: 12.5,
                      fontWeight: 500,
                      color: C.mutedFg,
                      lineHeight: 1.3,
                    }}
                  >
                    Équipe prévenue par e-mail et notification.
                  </div>
                </div>
              </div>
            </div>

            {/* Home indicator */}
            <div
              style={{
                position: "absolute",
                bottom: 22,
                left: "50%",
                transform: "translateX(-50%)",
                width: 120,
                height: 5,
                borderRadius: 999,
                background: "rgba(255,255,255,0.55)",
                zIndex: 30,
              }}
            />
          </div>
        </div>
      </AbsoluteFill>

      <Caption
        frame={frame}
        appearAt={30}
        text="Chacun confirme sa présence d'un geste."
      />
    </AbsoluteFill>
  );
};
