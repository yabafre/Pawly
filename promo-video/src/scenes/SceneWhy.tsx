import React from "react";
import { AbsoluteFill, interpolate, Easing, useCurrentFrame } from "remotion";
import { Check, GraduationCap } from "lucide-react";
import { C, FONT } from "../theme";
import { BreathingGradient } from "../components/BreathingGradient";
import { AppWindow } from "../components/AppWindow";
import { StaffGrid } from "../components/StaffGrid";
import { Caption } from "../components/Caption";

// Scene 3 "Le pourquoi" (7–12s, 150 frames). The CENTERED grid is the hero and
// holds dead still. Above it, a tidy row of "constraint respected" chips ticks
// in with a stagger — « Jours d'école » in the school-purple to tie to the wedge.
// Two elements animate: the chip row (staggered check-ins), then the focus on Léa.

const CHIPS = [
  { label: "Repos légal", school: false },
  { label: "Disponibilités", school: false },
  { label: "Équité", school: false },
  { label: "Jours d’école", school: true },
] as const;

const CHIP_START = 38;
const CHIP_STAGGER = 9;

const Chip: React.FC<{ label: string; school: boolean; p: number }> = ({
  label,
  school,
  p,
}) => (
  <div
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      background: school ? C.schoolBg : C.tealWash,
      border: `1px solid ${school ? C.schoolBorder : "transparent"}`,
      color: school ? C.schoolText : C.vetTealDark,
      padding: "9px 16px",
      borderRadius: 999,
      fontSize: 17,
      fontWeight: 600,
      fontFamily: FONT,
      whiteSpace: "nowrap",
      opacity: p,
      transform: `translateY(${(1 - p) * 8}px) scale(${0.94 + 0.06 * p})`,
    }}
  >
    {school ? (
      <GraduationCap size={17} color={C.schoolText} />
    ) : (
      <Check size={17} color={C.vetTeal} strokeWidth={3} />
    )}
    {label}
  </div>
);

export const SceneWhy: React.FC = () => {
  const f = useCurrentFrame();

  const intro = interpolate(f, [0, 16], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const winScale = 0.97 + 0.03 * intro;

  // Focus settles on Léa's row over frames 70–100 (after the chips have ticked).
  const focusValue = interpolate(f, [70, 100], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  const chipP = (i: number) =>
    interpolate(
      f,
      [CHIP_START + i * CHIP_STAGGER, CHIP_START + i * CHIP_STAGGER + 12],
      [0, 1],
      {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: Easing.out(Easing.cubic),
      },
    );

  return (
    <AbsoluteFill style={{ fontFamily: FONT }}>
      <BreathingGradient />

      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div
          style={{
            transform: `scale(${winScale})`,
            opacity: intro,
            width: 1340,
          }}
        >
          <AppWindow title="Pawly · Planning — juin 2026">
            {/* Constraint chips — tick in with a stagger, above the hero grid. */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                marginBottom: 20,
              }}
            >
              {CHIPS.map((c, i) => (
                <Chip
                  key={c.label}
                  label={c.label}
                  school={c.school}
                  p={chipP(i)}
                />
              ))}
            </div>

            <StaffGrid frame={f} mode="static" focus={focusValue} showBadge />
          </AppWindow>
        </div>
      </AbsoluteFill>

      <Caption
        frame={f}
        appearAt={30}
        text="Repos légal · Disponibilités · Équité · Jours d’école — respectés automatiquement."
      />
    </AbsoluteFill>
  );
};
