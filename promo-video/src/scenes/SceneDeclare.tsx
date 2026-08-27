import React from "react";
import { AbsoluteFill, interpolate, Easing, useCurrentFrame } from "remotion";
import { GraduationCap } from "lucide-react";
import { C, FONT, RADIUS } from "../theme";
import { AppWindow } from "../components/AppWindow";
import { Caption } from "../components/Caption";
import { BreathingGradient } from "../components/BreathingGradient";

// Léa's mini avatar — initials "LM" in a teal-wash circle. Holds dead still.
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

// A small check whose stroke "writes itself" via strokeDashoffset (the only
// secondary motion, riding the single chip beat). progress 0→1.
const DrawnCheck: React.FC<{ progress: number; color: string }> = ({
  progress,
  color,
}) => {
  const LEN = 26; // approx path length of the two-segment check
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

// Scene 4 "Déclaré une seule fois" (12–17s, 150 frames). Plausibility — WHY Pawly
// knows the school days. The ApprenticeDeclarationPanel is shown, dead still, and
// EXACTLY ONE element animates: Léa's status chip flips "Déclaration manquante"
// (destructive on soft rose) → "Jours d'école fournis" (vetTeal on teal-wash)
// around frame 60 — a ~10-frame crossfade plus a self-drawing check. Nothing else moves.
export const SceneDeclare: React.FC = () => {
  const f = useCurrentFrame();

  // The single animated beat: rose → teal crossfade (~10 frames) around frame 60.
  // We render BOTH chip states stacked and cross-fade their opacities, so the
  // pill itself never resizes or jumps — only the content dissolves.
  const flip = interpolate(f, [60, 70], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });
  // Check draws itself just as the teal state settles in (ease-out).
  const checkProgress = interpolate(f, [68, 84], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  // Soft rose background for the missing-declaration state (destructive text on it).
  const roseBg = "#FEECEC";

  // Both chip layers share one box so the pill geometry is identical and still.
  const chipBase: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    display: "inline-flex",
    alignItems: "center",
    gap: 9,
    padding: "11px 18px",
    borderRadius: 999,
    fontSize: 17,
    fontWeight: 700,
    whiteSpace: "nowrap",
  };

  return (
    <AbsoluteFill style={{ fontFamily: FONT }}>
      <BreathingGradient />

      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "flex-start",
          paddingTop: 168,
        }}
      >
        <div style={{ width: 1500 }}>
          <AppWindow title="Pawly · Déclarations apprentis">
            {/* Title (fg) */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}
            >
              <GraduationCap size={28} color={C.schoolText} />
              <div style={{ fontSize: 28, fontWeight: 700, color: C.softBlack }}>
                Déclarations jours d'école des apprentis
              </div>
            </div>

            {/* Subtitle (muted-fg) — VERBATIM */}
            <div
              style={{
                marginTop: 12,
                marginBottom: 26,
                fontSize: 17,
                lineHeight: 1.4,
                color: C.mutedFg,
              }}
            >
              Confirmez le statut des jours d'école pour chaque apprenti avant de
              générer le planning
            </div>

            {/* Léa Martin row — holds dead still */}
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
                  <div style={{ fontSize: 15, color: C.mutedFg }}>
                    Apprentie · ASV
                  </div>
                </div>
              </div>

              {/* THE one animated element: status chip flips rose → teal.
                  A fixed-size box holds two cross-faded layers so the pill
                  geometry never shifts — only the content dissolves. */}
              <div
                style={{
                  position: "relative",
                  width: 256,
                  height: 44,
                  flexShrink: 0,
                }}
              >
                {/* Missing — destructive text on soft rose (fades OUT) */}
                <div
                  style={{
                    ...chipBase,
                    justifyContent: "center",
                    background: roseBg,
                    color: C.destructive,
                    opacity: 1 - flip,
                  }}
                >
                  <span
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: 999,
                      border: `2.5px solid ${C.destructive}`,
                      display: "inline-block",
                    }}
                  />
                  <span>Déclaration manquante</span>
                </div>

                {/* Provided — vetTeal text on teal-wash (fades IN), check draws */}
                <div
                  style={{
                    ...chipBase,
                    justifyContent: "center",
                    background: C.tealWash,
                    color: C.vetTeal,
                    opacity: flip,
                  }}
                >
                  <DrawnCheck progress={checkProgress} color={C.vetTeal} />
                  <span>Jours d'école fournis</span>
                </div>
              </div>
            </div>
          </AppWindow>
        </div>
      </AbsoluteFill>

      <Caption
        frame={f}
        appearAt={30}
        text="L'apprentie déclare ses jours d'école une seule fois."
      />
    </AbsoluteFill>
  );
};