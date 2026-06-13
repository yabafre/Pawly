import React from "react";
import { interpolate, Easing } from "remotion";
import { C, FONT } from "../theme";

// Minimal, on-brand lower-third — a clean light card, not a heavy black pill.
// VO carries the message; the caption is a quiet anchor.
export const Caption: React.FC<{
  text: string;
  frame: number;
  appearAt?: number;
  outAt?: number;
}> = ({ text, frame, appearAt = 0, outAt }) => {
  const o = interpolate(frame, [appearAt, appearAt + 9], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const out = outAt
    ? interpolate(frame, [outAt, outAt + 7], [1, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: Easing.in(Easing.cubic),
      })
    : 1;
  const y = interpolate(frame, [appearAt, appearAt + 9], [10, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  return (
    <div
      style={{
        position: "absolute",
        bottom: 84,
        width: "100%",
        display: "flex",
        justifyContent: "center",
        fontFamily: FONT,
      }}
    >
      <div
        style={{
          opacity: o * out,
          transform: `translateY(${y}px)`,
          background: "rgba(252,252,252,0.92)",
          color: C.softBlack,
          padding: "13px 26px",
          borderRadius: 999,
          border: `1px solid ${C.border}`,
          fontSize: 24,
          fontWeight: 600,
          boxShadow: "0 10px 30px rgba(26,26,26,0.08)",
        }}
      >
        {text}
      </div>
    </div>
  );
};
