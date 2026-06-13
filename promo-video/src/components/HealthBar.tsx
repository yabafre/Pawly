import React from "react";
import { interpolate, Easing, spring, useVideoConfig } from "remotion";
import { CheckCircle2, AlertCircle } from "lucide-react";
import { C, MONO, FONT, RADIUS_2XL } from "../theme";
import { CountUp } from "./CountUp";

// The real "Santé du planning" HealthBar. Two modes:
//  - "honest"  (scene 5): fills to 78%, a tidy rose conflict held, publish blocked.
//  - "resolve" (scene 6): the rose segment springs to teal, count-up settles on 100%,
//    publish unlocks → "Publié". The single before→after climax of the film.
const HONEST = { rose: 8, warn: 14, hole: 12 }; // teal = remainder

export const HealthBar: React.FC<{
  frame: number;
  mode: "honest" | "resolve";
  introStart?: number;
  morphStart?: number;
  morphEnd?: number;
}> = ({ frame, mode, introStart = 0, morphStart = 18, morphEnd = 70 }) => {
  const { fps } = useVideoConfig();

  const intro =
    mode === "honest"
      ? spring({
          frame: frame - introStart,
          fps,
          config: { stiffness: 120, damping: 26 },
          durationInFrames: 24,
        })
      : 1;
  const m =
    mode === "resolve"
      ? interpolate(frame, [morphStart, morphEnd], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.inOut(Easing.cubic),
        })
      : 0;

  const rose = HONEST.rose * (1 - m);
  const warn = HONEST.warn * (1 - m);
  const hole = HONEST.hole * (1 - m);
  const teal = 100 - rose - warn - hole;
  const ready = 78 + 22 * m;
  const resolved = mode === "resolve" && m > 0.92;
  const published = mode === "resolve" && frame > morphEnd + 14;

  const Seg: React.FC<{ w: number; color?: string; striped?: boolean }> = ({
    w,
    color,
    striped,
  }) =>
    w <= 0.2 ? null : (
      <div
        style={{
          width: `${w}%`,
          height: "100%",
          background: striped
            ? `repeating-linear-gradient(45deg, ${C.muted}, ${C.muted} 6px, #E6E2DB 6px, #E6E2DB 12px)`
            : color,
        }}
      />
    );

  return (
    <div
      style={{
        width: "100%",
        fontFamily: FONT,
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: RADIUS_2XL,
        padding: 26,
        boxShadow: "0 18px 50px rgba(26,26,26,0.06)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {resolved ? (
            <CheckCircle2 size={22} color={C.vetTeal} />
          ) : (
            <AlertCircle size={22} color={C.warn} />
          )}
          <span style={{ fontSize: 22, fontWeight: 700, color: C.softBlack }}>
            Santé du planning
          </span>
        </div>
        <span style={{ fontSize: 22, fontWeight: 700, color: C.vetTeal }}>
          <CountUp
            frame={frame}
            from={mode === "honest" ? 0 : 78}
            to={mode === "honest" ? 78 : Math.round(ready)}
            startAt={mode === "honest" ? introStart : morphStart}
            endAt={mode === "honest" ? introStart + 22 : morphEnd}
            kind="percent"
            style={{ color: C.vetTeal, fontSize: 22, fontWeight: 700 }}
          />{" "}
          <span style={{ fontFamily: FONT, fontSize: 18, color: C.mutedFg }}>
            prêt
          </span>
        </span>
      </div>

      {/* the segmented bar */}
      <div
        style={{
          position: "relative",
          width: "100%",
          height: 20,
          borderRadius: 999,
          overflow: "hidden",
          background: C.muted,
          border: `1px solid ${C.border}`,
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            width: `${intro * 100}%`,
            overflow: "hidden",
          }}
        >
          <Seg w={rose} color={C.rose} />
          <Seg w={warn} color={C.warn} />
          <Seg w={hole} striped />
          <Seg w={teal} color={C.vetTeal} />
        </div>
      </div>

      {/* status line */}
      <div
        style={{ marginTop: 14, fontSize: 16, fontWeight: 600, opacity: intro }}
      >
        {resolved ? (
          <span style={{ color: C.vetTeal }}>
            Tout est bon — aucune violation détectée
          </span>
        ) : (
          <span style={{ color: C.destructive, fontFamily: MONO }}>
            Publication impossible — résolvez les conflits d'abord
          </span>
        )}
      </div>

      {/* publish button */}
      <div
        style={{ marginTop: 18, display: "flex", justifyContent: "flex-end" }}
      >
        <div
          style={{
            padding: "12px 22px",
            borderRadius: 12,
            fontSize: 17,
            fontWeight: 700,
            color: resolved ? "#FFFFFF" : C.mutedFg,
            background: published
              ? C.vetTeal
              : resolved
                ? C.softBlack
                : C.muted,
            border: `1px solid ${resolved ? "transparent" : C.border}`,
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          {published && <CheckCircle2 size={18} color="#FFFFFF" />}
          {published ? "Publié" : "Publier"}
        </div>
      </div>
    </div>
  );
};
