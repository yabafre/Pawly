import React from "react";
import { interpolate, Easing } from "remotion";
import { C, MONO } from "../theme";

type Kind = "int" | "percent" | "clock";

const format = (v: number, kind: Kind): string => {
  if (kind === "percent") return `${Math.round(v)}%`;
  if (kind === "clock") {
    const s = Math.max(0, Math.floor(v));
    const hh = String(Math.floor(s / 3600)).padStart(2, "0");
    const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  }
  return String(Math.round(v));
};

// SIGNATURE 3 — the single count-up device for the whole film (Geist Mono, tabular).
// Carries every number: the cost counter, +7h, % prêt → 100.
export const CountUp: React.FC<{
  frame: number;
  from: number;
  to: number;
  startAt?: number;
  endAt?: number;
  kind?: Kind;
  style?: React.CSSProperties;
}> = ({ frame, from, to, startAt = 0, endAt = 30, kind = "int", style }) => {
  const v = interpolate(frame, [startAt, endAt], [from, to], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  return (
    <span
      style={{
        fontFamily: MONO,
        fontVariantNumeric: "tabular-nums",
        color: C.softBlack,
        ...style,
      }}
    >
      {format(v, kind)}
    </span>
  );
};
