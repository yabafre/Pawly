import React from "react";
import { C } from "../theme";

// A macOS-style arrow cursor, positioned in absolute composition coords by the scene.
export const FauxCursor: React.FC<{
  x: number;
  y: number;
  clicking?: boolean;
  scale?: number;
}> = ({ x, y, clicking, scale = 1 }) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      transform: `scale(${scale * (clicking ? 0.86 : 1)})`,
      transformOrigin: "top left",
      zIndex: 50,
      filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.3))",
    }}
  >
    <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
      <path
        d="M4 2 L4 20 L9 15 L12.5 22 L15.5 20.5 L12 14 L19 14 Z"
        fill="white"
        stroke="#1A1A1A"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
    {clicking && (
      <div
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 32,
          height: 32,
          borderRadius: 999,
          border: `2px solid ${C.vetTeal}`,
          opacity: 0.55,
        }}
      />
    )}
  </div>
);
