import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { C } from "../theme";

// SIGNATURE 1 — the single calm "breathing" backdrop present behind EVERY scene.
// One slow radial teal-wash that inhales/exhales over ~6s. It never moves to the
// foreground; it just makes the whole film feel like one living, calm surface.
export const BreathingGradient: React.FC<{ intensity?: number }> = ({
  intensity = 1,
}) => {
  const frame = useCurrentFrame();
  const t = (Math.sin((frame / 180) * Math.PI * 2) + 1) / 2; // 0..1, 6s loop
  const radius = 60 + 7 * t;
  const opacity = (0.5 + 0.18 * t) * intensity;
  return (
    <AbsoluteFill style={{ background: C.warmLinen }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(${radius}% ${radius}% at 50% 40%, ${C.tealWash} 0%, ${C.warmLinen} 72%)`,
          opacity,
        }}
      />
    </AbsoluteFill>
  );
};
