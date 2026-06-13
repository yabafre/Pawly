import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  Easing,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {
  Bell,
  Mail,
  GraduationCap,
  PawPrint,
  CalendarDays,
  Clock,
  Loader2,
  Check,
} from "lucide-react";
import { C, FONT, RADIUS } from "../theme";
import { Caption } from "../components/Caption";

// Scene 8 (51–59s, 240 frames) — "Côté équipe : PWA, notif email, confirmation 3-états".
// Full-bleed Warm Linen, centered phone mockup showing the installed Pawly PWA:
//   0–40   push/email notification slides down from the top (spring translateY)
//   40–120 the app opens on Léa's week (vertical Lun..Dim list); MARDI = purple "École"
//   120–240 a 3-STATE confirmation button cycles:
//           "Confirmer ma présence" → (tap ~150) "Confirmation en cours…" → "Confirmé"
// The phone is ONLINE the whole time — confirming presence needs the network, so no
// offline state is shown on-screen. Everything is driven per-frame from
// useCurrentFrame(); no CSS transitions/animations.

type DayKey = "mar"; // only Tuesday gets the school treatment

interface DayRow {
  label: string;
  day: string;
  start: string;
  end: string;
  hours?: string;
  school?: DayKey;
}

const WEEK: DayRow[] = [
  { label: "Lun", day: "Lundi", start: "09:00", end: "18:00", hours: "8h" },
  { label: "Mar", day: "Mardi", start: "École", end: "", school: "mar" },
  { label: "Mer", day: "Mercredi", start: "09:00", end: "18:00", hours: "8h" },
  { label: "Jeu", day: "Jeudi", start: "09:00", end: "18:00", hours: "8h" },
  { label: "Ven", day: "Vendredi", start: "09:00", end: "17:00", hours: "7h" },
  { label: "Sam", day: "Samedi", start: "09:00", end: "13:00", hours: "4h" },
  { label: "Dim", day: "Dimanche", start: "Repos", end: "" },
];

// One row of the vertical day list. Tuesday renders as a purple "École" entry.
const DayItem: React.FC<{ row: DayRow; frame: number; index: number }> = ({
  row,
  frame,
  index,
}) => {
  // Rows stagger-reveal once the app body is visible (from ~frame 52).
  const appear = interpolate(
    frame,
    [52 + index * 5, 52 + index * 5 + 12],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    },
  );
  const isSchool = !!row.school;
  const isRest = !row.hours && !isSchool;
  return (
    <div
      style={{
        opacity: appear,
        transform: `translateX(${(1 - appear) * 14}px)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "11px 13px",
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
            width: 40,
            height: 40,
            borderRadius: 11,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: isSchool ? "#fff" : C.muted,
            border: `1px solid ${isSchool ? C.schoolBorder : C.border}`,
            color: isSchool ? C.schoolText : C.subtle,
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 700, lineHeight: 1 }}>
            {row.label}
          </span>
        </div>
        {/* Day name + shift / school info */}
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <span
            style={{
              fontSize: 13,
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
                École — Apprenti·e
              </span>
            </div>
          ) : isRest ? (
            <span style={{ fontSize: 13, fontWeight: 500, color: C.subtle }}>
              Repos
            </span>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Clock size={14} color={C.subtle} strokeWidth={2.2} />
              <span style={{ fontSize: 13, fontWeight: 500, color: C.subtle }}>
                {`${row.start} – ${row.end}`}
              </span>
            </div>
          )}
        </div>
      </div>
      {/* Right-side meta: hours pill, school badge, or nothing */}
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
      ) : row.hours ? (
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: C.vetTealDark,
            background: C.tealWash,
            borderRadius: 999,
            padding: "4px 10px",
          }}
        >
          {row.hours}
        </span>
      ) : null}
    </div>
  );
};

// The 3-state confirmation button (NOT a draggable handle). State is purely a
// function of the current frame: idle → confirming (~150) → confirmed.
const ConfirmButton: React.FC<{ frame: number }> = ({ frame }) => {
  const TAP = 150;
  const CONFIRMING_UNTIL = TAP + 18; // ~0.6s spinner
  const confirming = frame >= TAP && frame < CONFIRMING_UNTIL;
  const confirmed = frame >= CONFIRMING_UNTIL;

  // Subtle press-in feedback at the tap moment.
  const press = interpolate(frame, [TAP - 2, TAP + 3], [1, 0.97], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  // Pop when reaching the "Confirmé" state.
  const pop = interpolate(
    frame,
    [CONFIRMING_UNTIL, CONFIRMING_UNTIL + 6, CONFIRMING_UNTIL + 12],
    [0.96, 1.03, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  const scale = confirmed ? pop : press;
  const spin = frame * 16;

  const bg = confirmed ? C.vetTeal : confirming ? C.vetTealDark : C.vetTeal;

  let label = "Confirmer ma présence";
  if (confirming) label = "Confirmation en cours…";
  if (confirmed) label = "Confirmé";

  return (
    <div
      style={{
        transform: `scale(${scale})`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        height: 54,
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
          style={{
            display: "inline-flex",
            transform: `rotate(${spin}deg)`,
          }}
        >
          <Loader2 size={20} color="#fff" strokeWidth={2.6} />
        </span>
      )}
      {confirmed && <Check size={21} color="#fff" strokeWidth={3} />}
      <span>{label}</span>
    </div>
  );
};

export const Scene08EmployeePwa: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Phone entrance — gentle rise + fade as the scene opens.
  const phoneIn = spring({
    frame,
    fps,
    config: { damping: 200, mass: 0.8 },
    durationInFrames: 26,
  });
  const phoneY = (1 - phoneIn) * 36;
  const phoneOpacity = interpolate(frame, [0, 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Notification card slides down from above the phone (spring translateY).
  const notifIn = spring({
    frame: frame - 4,
    fps,
    config: { damping: 18, stiffness: 130, mass: 0.7 },
    durationInFrames: 24,
  });
  const notifY = interpolate(notifIn, [0, 1], [-120, 0]);
  // It eases back up and out as the app takes over (~frame 36→48).
  const notifExit = interpolate(frame, [36, 48], [0, -150], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const notifOpacity = interpolate(frame, [40, 48], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // App content (home screen → opened PWA) cross-reveals around frame 40–60.
  const appReveal = interpolate(frame, [42, 58], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const homeFade = interpolate(frame, [40, 50], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Header reveal — slides in just after the app body.
  const headerIn = interpolate(frame, [48, 60], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  const PHONE_W = 380;
  const PHONE_H = 800;

  return (
    <AbsoluteFill style={{ background: C.warmLinen, fontFamily: FONT }}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        {/* Static perspective for depth — fixed transform, never animated as a transition. */}
        <div
          style={{
            transform: `translateY(${phoneY}px) perspective(1600px) rotateY(-9deg) rotateX(3deg)`,
            opacity: phoneOpacity,
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
                background: C.warmLinen,
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

              {/* Status bar — clean: time + small Pawly wordmark + paw */}
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
                <span>09:41</span>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <PawPrint size={14} color={C.vetTeal} strokeWidth={2.4} />
                  <span style={{ color: C.softBlack }}>Pawly</span>
                </span>
              </div>

              {/* ===== Home screen (pre-open) ===== */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  opacity: homeFade,
                  paddingTop: 120,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <div
                  style={{
                    width: 82,
                    height: 82,
                    borderRadius: 22,
                    background: C.vetTeal,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 10px 24px rgba(0,149,136,0.32)",
                  }}
                >
                  <PawPrint size={40} color="#fff" strokeWidth={2.4} />
                </div>
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: C.softBlack,
                  }}
                >
                  Pawly
                </span>
              </div>

              {/* ===== Opened PWA ===== */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  paddingTop: 52,
                  opacity: appReveal,
                  transform: `translateY(${(1 - appReveal) * 18}px)`,
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                {/* App header — "Ma semaine" + week label */}
                <div
                  style={{
                    padding: "14px 20px 12px",
                    opacity: headerIn,
                    transform: `translateY(${(1 - headerIn) * -10}px)`,
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
                        fontSize: 24,
                        fontWeight: 800,
                        color: C.softBlack,
                        letterSpacing: -0.4,
                      }}
                    >
                      Ma semaine
                    </div>
                    <div
                      style={{
                        width: 34,
                        height: 34,
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
                      display: "flex",
                      alignItems: "center",
                      gap: 7,
                      marginTop: 4,
                    }}
                  >
                    <CalendarDays
                      size={14}
                      color={C.subtle}
                      strokeWidth={2.2}
                    />
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: C.subtle,
                      }}
                    >
                      1 – 7 juin · Léa Martin
                    </span>
                  </div>
                </div>

                {/* Day list */}
                <div
                  style={{
                    padding: "12px 18px 0",
                    display: "flex",
                    flexDirection: "column",
                    gap: 9,
                    flex: 1,
                  }}
                >
                  {WEEK.map((row, i) => (
                    <DayItem
                      key={row.label}
                      row={row}
                      frame={frame}
                      index={i}
                    />
                  ))}
                </div>

                {/* Confirmation button anchored at the bottom (focused demo — no fake tab bar) */}
                <div style={{ padding: "14px 18px 34px" }}>
                  <ConfirmButton frame={frame} />
                </div>
              </div>

              {/* ===== Notification card (slides down from the top) ===== */}
              {frame < 50 && (
                <div
                  style={{
                    position: "absolute",
                    top: 52,
                    left: 16,
                    right: 16,
                    transform: `translateY(${notifY + notifExit}px)`,
                    opacity: notifOpacity,
                    background: "rgba(252,252,252,0.94)",
                    border: `1px solid ${C.border}`,
                    borderRadius: RADIUS + 4,
                    boxShadow: "0 16px 40px rgba(26,26,26,0.18)",
                    padding: "13px 14px",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 11,
                    zIndex: 25,
                  }}
                >
                  <div
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 10,
                      background: C.tealWash,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      position: "relative",
                    }}
                  >
                    <Mail size={19} color={C.vetTealDark} strokeWidth={2.2} />
                    <div
                      style={{
                        position: "absolute",
                        top: -4,
                        right: -4,
                        width: 18,
                        height: 18,
                        borderRadius: 999,
                        background: C.vetTeal,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        border: "2px solid #fff",
                      }}
                    >
                      <Bell size={9} color="#fff" strokeWidth={3} />
                    </div>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: 2,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          color: C.softBlack,
                        }}
                      >
                        Pawly
                      </span>
                      <span style={{ fontSize: 11, color: C.subtle }}>
                        maintenant
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: 13.5,
                        fontWeight: 600,
                        color: C.softBlack,
                        lineHeight: 1.3,
                      }}
                    >
                      Votre planning de la semaine est disponible
                    </div>
                  </div>
                </div>
              )}
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
        text="Toute l'équipe est prévenue. Chacun confirme sa présence en un geste, depuis son mobile."
      />
    </AbsoluteFill>
  );
};
