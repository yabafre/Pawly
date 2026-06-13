import React from "react";
import { AbsoluteFill, interpolate, Easing, useCurrentFrame } from "remotion";
import { C, FONT } from "../theme";
import { AppWindow } from "../components/AppWindow";
import { StaffGrid } from "../components/StaffGrid";
import { GenerationButton } from "../components/GenerationButton";
import { FauxCursor } from "../components/FauxCursor";
import { Caption } from "../components/Caption";

// Scene 5 (25–36s of the full film, 330 frames) — THE differentiator beat.
// Cursor clicks "Générer le planning" → the StaffGrid fills in a wave, but Léa's
// Tuesday locks FIRST as a purple "École" cell while every other day fills around it.
export const Scene05Differentiator: React.FC = () => {
  const f = useCurrentFrame();

  const intro = interpolate(f, [0, 18], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const winScale = 0.96 + 0.04 * intro;

  // Faux cursor glides to the Generate button and clicks. It only appears
  // AFTER the crossfade from scene 4 (whose own cursor fades out), so the
  // transition never shows two cursors at once.
  const cursorIn = interpolate(f, [12, 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const cx = interpolate(f, [12, 30], [1640, 1500], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const cy = interpolate(f, [12, 30], [470, 168], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const clicking = f >= 33 && f <= 45;
  const loading = f >= 37;
  const spin = f * 14;

  return (
    <AbsoluteFill style={{ background: C.warmLinen, fontFamily: FONT }}>
      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "flex-start",
          paddingTop: 120,
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
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 18,
              }}
            >
              <div>
                <div
                  style={{ fontSize: 26, fontWeight: 700, color: C.softBlack }}
                >
                  Génération du planning
                </div>
                <div style={{ fontSize: 16, color: C.subtle }}>
                  Modèle de semaine · 6 collaborateurs
                </div>
              </div>
              <GenerationButton
                loading={loading}
                spin={spin}
                pressed={clicking}
              />
            </div>
            <StaffGrid frame={f} />
          </AppWindow>
        </div>
      </AbsoluteFill>

      {f < 120 ? (
        <Caption
          frame={f}
          appearAt={38}
          text="Un clic. Le moteur place chaque équipe…"
        />
      ) : (
        <Caption
          frame={f}
          appearAt={122}
          text="Le mardi de Léa reste libre — automatiquement."
        />
      )}

      <div style={{ opacity: cursorIn }}>
        <FauxCursor x={cx} y={cy} clicking={clicking} />
      </div>
    </AbsoluteFill>
  );
};
