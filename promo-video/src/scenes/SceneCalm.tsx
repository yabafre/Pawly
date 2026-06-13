import React from "react";
import { AbsoluteFill, interpolate, Easing, useCurrentFrame } from "remotion";
import { FONT } from "../theme";
import { BreathingGradient } from "../components/BreathingGradient";
import { AppWindow } from "../components/AppWindow";
import { HealthBar } from "../components/HealthBar";
import { FauxCursor } from "../components/FauxCursor";
import { Caption } from "../components/Caption";

// Scene 6 "Le calme retrouvé" (24–30s of the full film, 180 frames) — the
// before→after CLIMAX. A single centered HealthBar holds at the honest 78% state,
// then MORPHS (the most important spring of the film): rose/warn/hole resolve to
// teal, the count-up settles on "100% prêt", the status flips to green, and Publier
// enables → "Publié". The only two motions in the whole scene are that morph and the
// cursor press on Publier. The window, the gradient décor: dead still by design.
export const SceneCalm: React.FC = () => {
  const f = useCurrentFrame();

  // --- The single morph window (HealthBar internals key off these exact values) --
  const morphStart = 20;
  const morphEnd = 80;
  // The component flips to "Publié" at frame > morphEnd + 14 = 94. The cursor must
  // land its press just BEFORE that, so the click reads as the cause of the publish.
  const clickAt = 90;

  // --- Cursor: glides in, presses Publier, holds. The ONLY non-morph motion. ------
  // The centered window is 1500 wide → left edge ≈ (1920-1500)/2 = 210. The HealthBar
  // sits inside the AppWindow body; its Publier button is bottom-right of the card.
  const cursorIn = interpolate(f, [40, 52], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const cx = interpolate(f, [40, clickAt - 2], [1560, 1452], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const cy = interpolate(f, [40, clickAt - 2], [760, 690], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const clicking = f >= clickAt && f <= clickAt + 6;

  return (
    <AbsoluteFill style={{ fontFamily: FONT }}>
      <BreathingGradient />

      {/* The window holds DEAD STILL — the morph is the only motion inside the card. */}
      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ width: 1500 }}>
          <AppWindow title="Pawly · Planning — juin 2026">
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
              }}
            >
              <div style={{ width: 900 }}>
                <HealthBar
                  frame={f}
                  mode="resolve"
                  morphStart={morphStart}
                  morphEnd={morphEnd}
                />
              </div>
            </div>
          </AppWindow>
        </div>
      </AbsoluteFill>

      <Caption
        frame={f}
        appearAt={30}
        text="Tout est vert. Vous publiez. L'équipe est prévenue — e-mail et notification."
      />

      <div style={{ opacity: cursorIn }}>
        <FauxCursor x={cx} y={cy} clicking={clicking} />
      </div>
    </AbsoluteFill>
  );
};