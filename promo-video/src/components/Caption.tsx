import React from "react";
import { interpolate } from "remotion";

// Lower-third caption. VO/caption strings are French, verbatim where they map to product copy.
export const Caption: React.FC<{
  text: string;
  frame: number;
  appearAt?: number;
}> = ({ text, frame, appearAt = 0 }) => {
  const o = interpolate(frame, [appearAt, appearAt + 10], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const y = interpolate(frame, [appearAt, appearAt + 10], [16, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <div
      style={{
        position: "absolute",
        bottom: 70,
        width: "100%",
        display: "flex",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          opacity: o,
          transform: `translateY(${y}px)`,
          background: "rgba(26,26,26,0.9)",
          color: "white",
          padding: "14px 28px",
          borderRadius: 999,
          fontSize: 25,
          fontWeight: 600,
          boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
        }}
      >
        {text}
      </div>
    </div>
  );
};
