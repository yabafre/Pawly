import React from "react";
import {
  AbsoluteFill,
  interpolate,
  Easing,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { C, FONT, SPRING } from "../theme";
import { BreathingGradient } from "../components/BreathingGradient";
import { AppWindow } from "../components/AppWindow";
import { HealthBar } from "../components/HealthBar";
import { Caption } from "../components/Caption";

// SCENE 5 "La vérité" (17–24s, 210 frames) — the honesty turn: Pawly does not lie.
// ONE motion only: the HealthBar card slides up (y spring 40→0, opacity in over
// frames 0–20). After that, the card holds DEAD STILL and the only remaining
// change is the HealthBar's OWN internal fill to "78% prêt" (introStart=10),
// with its tidy, motionless rose conflict + warn + striped hole + teal, the
// « Publication impossible — résolvez les conflits d'abord » line and the
// disabled Publier. Tension is shown as data, never as chaos.
export const SceneTruth: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();

  // THE one element that moves: the declaration card slides up and fades in.
  const rise = spring({
    frame: f,
    fps,
    config: SPRING,
    durationInFrames: 20,
  });
  const cardY = interpolate(rise, [0, 1], [40, 0]);
  const cardOpacity = interpolate(f, [0, 18], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  // The short title line above settles with the card, then holds still.
  const titleOpacity = interpolate(f, [2, 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  return (
    <AbsoluteFill style={{ fontFamily: FONT }}>
      <BreathingGradient />

      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: 920,
            transform: `translateY(${cardY}px)`,
            opacity: cardOpacity,
          }}
        >
          <div
            style={{
              textAlign: "center",
              marginBottom: 26,
              fontSize: 32,
              fontWeight: 700,
              letterSpacing: -0.4,
              color: C.softBlack,
              opacity: titleOpacity,
            }}
          >
            Le moteur vous dit la vérité
          </div>

          <AppWindow title="Pawly · Santé du planning">
            <HealthBar frame={f} mode="honest" introStart={10} />
          </AppWindow>
        </div>
      </AbsoluteFill>

      <Caption
        frame={f}
        appearAt={40}
        text="Tant qu'un conflit demeure, Pawly ne publie pas."
      />
    </AbsoluteFill>
  );
};