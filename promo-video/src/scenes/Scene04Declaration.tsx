import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  Easing,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { GraduationCap } from "lucide-react";
import { C, FONT, RADIUS } from "../theme";
import { AppWindow } from "../components/AppWindow";
import { GenerationButton } from "../components/GenerationButton";
import { FauxCursor } from "../components/FauxCursor";
import { Caption } from "../components/Caption";

// Léa's mini avatar — initials "LM" in a teal-wash circle, for human realism.
const LeaAvatar: React.FC = () => (
  <div
    style={{
      width: 52,
      height: 52,
      borderRadius: 999,
      background: C.tealWash,
      border: `2px solid ${C.vetTeal}`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 19,
      fontWeight: 700,
      color: C.vetTealDark,
      flexShrink: 0,
    }}
  >
    LM
  </div>
);

// A small drawn check whose stroke "writes itself" via strokeDashoffset.
const DrawnCheck: React.FC<{ progress: number; color: string }> = ({
  progress,
  color,
}) => {
  // Total path length of the two-segment check (approx). Dash from full → 0.
  const LEN = 26;
  const offset = LEN * (1 - progress);
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path
        d="M5 12.5 L10 17.5 L19 7"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={LEN}
        strokeDashoffset={offset}
      />
    </svg>
  );
};

// Scene 4 (17–25s, 240 frames) — declaring an apprentice's school days BEFORE generating.
// Léa Martin's status chip flips "Déclaration manquante" (rose) → "Jours d'école fournis"
// (green) around frame ~90 with a self-drawing check; then a GenerationPanel preview slides
// in below and a faux cursor glides toward the teal "Générer le planning" button (no click).
export const Scene04Declaration: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Window scale-in.
  const intro = interpolate(f, [0, 18], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const winScale = 0.96 + 0.04 * intro;

  // Chip entrance — spring (stiffness 300, damping 30).
  const chipSpring = spring({
    frame: f - 24,
    fps,
    config: { stiffness: 300, damping: 30 },
  });
  const chipScale = interpolate(chipSpring, [0, 1], [0.7, 1]);
  const chipOpacity = interpolate(chipSpring, [0, 1], [0, 1]);

  // Status flip rose → green around frame ~90.
  const flip = interpolate(f, [86, 98], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });
  const isProvided = flip > 0.5;
  // Check draws itself just after the color settles to green.
  const checkProgress = interpolate(f, [98, 116], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  // Chip palette cross-fades between rose (missing) and green (provided).
  const roseBg = "#FDECEC";
  const roseText = "#B91C1C";
  const greenBg = "#DCFCE7";
  const greenText = "#166534";

  // Generation preview panel slides up from ~frame 150.
  const panel = interpolate(f, [150, 172], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const panelY = interpolate(panel, [0, 1], [28, 0]);

  // Faux cursor glides toward the Generate button near the end (no click yet).
  const cx = interpolate(f, [186, 234], [1330, 1018], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const cy = interpolate(f, [186, 234], [560, 792], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  return (
    <AbsoluteFill style={{ background: C.warmLinen, fontFamily: FONT }}>
      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "flex-start",
          paddingTop: 96,
        }}
      >
        <div
          style={{
            transform: `scale(${winScale})`,
            opacity: intro,
            width: 1500,
          }}
        >
          <AppWindow title="Pawly · Déclarations apprentis">
            {/* Header */}
            <div style={{ marginBottom: 6 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <GraduationCap size={28} color={C.schoolText} />
                <div
                  style={{ fontSize: 28, fontWeight: 700, color: C.softBlack }}
                >
                  Déclarations jours d'école des apprentis
                </div>
              </div>
            </div>

            {/* Subtitle bandeau (verbatim) */}
            <div
              style={{
                marginTop: 14,
                marginBottom: 22,
                padding: "13px 18px",
                background: C.schoolBg,
                border: `1px solid ${C.schoolBorder}`,
                borderRadius: RADIUS,
                color: C.schoolText,
                fontSize: 17,
                fontWeight: 600,
              }}
            >
              Confirmez le statut des jours d'école pour chaque apprenti avant
              de générer le planning
            </div>

            {/* Léa Martin row */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "18px 22px",
                background: C.card,
                border: `1px solid ${C.border}`,
                borderRadius: RADIUS,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <LeaAvatar />
                <div>
                  <div
                    style={{
                      fontSize: 22,
                      fontWeight: 700,
                      color: C.softBlack,
                    }}
                  >
                    Léa Martin
                  </div>
                  <div style={{ fontSize: 15, color: C.subtle }}>
                    Apprentie · ASV
                  </div>
                </div>
              </div>

              {/* Status chip — flips rose → green, cross-faded by `flip`. */}
              <div
                style={{
                  position: "relative",
                  transform: `scale(${chipScale})`,
                  opacity: chipOpacity,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 9,
                  padding: "11px 18px",
                  borderRadius: 999,
                  fontSize: 17,
                  fontWeight: 700,
                  whiteSpace: "nowrap",
                  background: isProvided ? greenBg : roseBg,
                  color: isProvided ? greenText : roseText,
                }}
              >
                {isProvided ? (
                  <>
                    <DrawnCheck progress={checkProgress} color={greenText} />
                    <span>Jours d'école fournis</span>
                  </>
                ) : (
                  <>
                    <span
                      style={{
                        width: 16,
                        height: 16,
                        borderRadius: 999,
                        border: `2.5px solid ${roseText}`,
                        display: "inline-block",
                      }}
                    />
                    <span>Déclaration manquante</span>
                  </>
                )}
              </div>
            </div>

            {/* Generation preview panel (slides in ~frame 150) */}
            <div
              style={{
                marginTop: 22,
                opacity: panel,
                transform: `translateY(${panelY}px)`,
                padding: "22px 24px",
                background: C.muted,
                border: `1px solid ${C.border}`,
                borderRadius: RADIUS,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 24,
              }}
            >
              <div style={{ display: "flex", gap: 40 }}>
                <div>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: C.subtle,
                      textTransform: "uppercase",
                      letterSpacing: 0.6,
                    }}
                  >
                    Mois cible
                  </div>
                  <div
                    style={{
                      fontSize: 21,
                      fontWeight: 700,
                      color: C.softBlack,
                      marginTop: 4,
                    }}
                  >
                    juin 2026
                  </div>
                </div>
                <div>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: C.subtle,
                      textTransform: "uppercase",
                      letterSpacing: 0.6,
                    }}
                  >
                    Stratégie
                  </div>
                  <div
                    style={{
                      fontSize: 21,
                      fontWeight: 700,
                      color: C.softBlack,
                      marginTop: 4,
                    }}
                  >
                    Modèle de semaine
                  </div>
                </div>
              </div>

              <GenerationButton loading={false} spin={0} />
            </div>
          </AppWindow>
        </div>
      </AbsoluteFill>

      <Caption
        frame={f}
        appearAt={40}
        text="Avec Pawly, l'apprenti déclare ses jours d'école une fois."
      />

      {/* Cursor only glides in once the panel is present; no click in scene 4. */}
      {f >= 186 ? <FauxCursor x={cx} y={cy} clicking={false} /> : null}
    </AbsoluteFill>
  );
};
