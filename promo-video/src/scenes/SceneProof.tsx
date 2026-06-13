import React from "react";
import { AbsoluteFill, interpolate, Easing, useCurrentFrame } from "remotion";
import { C, FONT, MONO, RADIUS } from "../theme";
import { BreathingGradient } from "../components/BreathingGradient";
import { AppWindow } from "../components/AppWindow";
import { StaffGrid } from "../components/StaffGrid";
import { GenerationButton } from "../components/GenerationButton";
import { FauxCursor } from "../components/FauxCursor";
import { Caption } from "../components/Caption";

// Header row of the in-app panel: left title + the Geist-Mono target month,
// right the teal "Générer le planning" button. Held DEAD STILL — only the
// cursor and (after the press) the grid wave move. `pressed`/`loading` drive
// the single button state change.
const PanelHeader: React.FC<{
  pressed: boolean;
  loading: boolean;
  spin: number;
}> = ({ pressed, loading, spin }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 24,
      marginBottom: 22,
    }}
  >
    <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
      <span style={{ fontSize: 28, fontWeight: 700, color: C.softBlack }}>
        Génération du planning
      </span>
      <span
        style={{
          fontFamily: MONO,
          fontSize: 19,
          fontWeight: 500,
          color: C.mutedFg,
          background: C.muted,
          border: `1px solid ${C.border}`,
          borderRadius: RADIUS,
          padding: "5px 12px",
        }}
      >
        juin 2026
      </span>
    </div>
    <GenerationButton loading={loading} spin={spin} pressed={pressed} />
  </div>
);

// SCENE 2 — "Un clic — la preuve" (150 frames @ 30fps).
// The wedge as PROOF. A cursor glides on a Bézier to the teal generate button,
// presses it (~f22–30), and the StaffGrid populates in one calm wave where
// Léa's purple MARDI "École" cell LOCKS FIRST with the gold halo. Two focal
// points only: the button press, then Léa's locked cell. Everything else holds
// dead still; nothing here animates outside the cursor → button → grid causal
// chain.
export const SceneProof: React.FC = () => {
  const f = useCurrentFrame();

  // The window itself is calm — one tiny settle-in, then dead still.
  const intro = interpolate(f, [0, 14], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const winScale = 0.985 + 0.015 * intro;

  // FauxCursor glides on a Bézier toward the "Générer le planning" button.
  // Button center sits near the top-right of the window header.
  const BTN_X = 1545;
  const BTN_Y = 236;
  const cx = interpolate(f, [4, 24], [1360, BTN_X], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const cy = interpolate(f, [4, 24], [560, BTN_Y], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  // The press: clicking pulse ~f24–34; button "pressed" while the cursor is down.
  const clicking = f >= 24 && f <= 34;
  const pressed = f >= 24 && f <= 30;

  // Cause → effect: the spinner appears AFTER the press lands (~f30).
  const loading = f >= 30;
  const spin = (f - 30) * 9; // deterministic rotation for the Loader2 icon

  // Cursor lifts away once the grid wave is underway, so Léa's locked cell is
  // the sole remaining focal point.
  const cursorOut = interpolate(f, [40, 52], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });

  return (
    <AbsoluteFill style={{ fontFamily: FONT }}>
      <BreathingGradient />

      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "flex-start",
          paddingTop: 110,
        }}
      >
        <div
          style={{
            transform: `scale(${winScale})`,
            opacity: intro,
            width: 1500,
          }}
        >
          <AppWindow title="Pawly · Planning — juin 2026">
            <PanelHeader pressed={pressed} loading={loading} spin={spin} />

            {/* The grid populates only after the press: fillStart=28 (press lands
                ~f30, wave reads as the consequence). Léa's MARDI cell locks first
                with the gold halo — handled by StaffGrid via haloFrame. */}
            <StaffGrid
              frame={f}
              mode="generate"
              fillStart={28}
              showBadge={false}
              haloFrame={6}
            />
          </AppWindow>
        </div>
      </AbsoluteFill>

      <Caption
        frame={f}
        appearAt={60}
        text="Un clic. Le mardi de Léa reste à l'école."
      />

      {f <= 52 ? (
        <div style={{ opacity: cursorOut }}>
          <FauxCursor x={cx} y={cy} clicking={clicking} />
        </div>
      ) : null}
    </AbsoluteFill>
  );
};