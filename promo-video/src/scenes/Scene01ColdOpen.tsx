import React from "react";
import { AbsoluteFill, interpolate, Easing, useCurrentFrame } from "remotion";
import { FileSpreadsheet } from "lucide-react";
import { C, FONT } from "../theme";
import { Caption } from "../components/Caption";

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

// The "fichier de la honte" — typed letter-by-letter via frame-based slicing.
const FILENAME = "planning_semaine_FINAL_v7_vraiment_final.xlsx";
// Index range of "_v7" inside FILENAME, used to flash it red around frame 90.
const V7_START = FILENAME.indexOf("_v7");
const V7_END = V7_START + "_v7".length;

// Scene 1 — Cold open (0–4s, 120 frames). Dimanche soir, 21h47, le planning à la main.
// Full-bleed near-black warm background, heavy vignette, monospace clock,
// a filename typing itself, and the lower-third caption.
export const Scene01ColdOpen: React.FC = () => {
  const f = useCurrentFrame();

  // Fade in from pure black over the first 18 frames.
  const intro = interpolate(f, [0, 18], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  // Clock breathes in slightly after the fade — cold, slow, tense.
  const clockRise = interpolate(f, [6, 30], [14, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  // Colon blinks (1Hz at 30fps) like a real digital clock — deterministic, frame-driven.
  const colonOn = Math.floor(f / 15) % 2 === 0;

  // Typewriter: reveal the filename one char at a time. Start ~frame 30, ~1.6 chars/frame.
  const typed = interpolate(
    f,
    [30, 30 + FILENAME.length / 1.6],
    [0, FILENAME.length],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.linear,
    },
  );
  const charCount = Math.floor(typed);
  const before = FILENAME.slice(0, Math.min(charCount, V7_START));
  const v7 = FILENAME.slice(
    Math.min(charCount, V7_START),
    Math.min(charCount, V7_END),
  );
  const after = FILENAME.slice(Math.min(charCount, V7_END), charCount);
  const doneTyping = charCount >= FILENAME.length;

  // The "_v7" flashes red (destructive) once around frame 90, then settles to grey.
  const flash = interpolate(f, [84, 90, 100], [0, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.quad),
  });
  const v7Color = flash > 0.04 ? C.destructive : "#9A9A9A";

  // Caret blinks while typing, then while idle after the line is complete.
  const caretOn = Math.floor(f / 8) % 2 === 0;
  const showCaret = (f >= 30 && !doneTyping) || (doneTyping && caretOn);

  return (
    <AbsoluteFill style={{ background: "#141110", fontFamily: FONT }}>
      {/* Faint warm panel under the vignette to avoid a flat black. */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(120% 90% at 50% 42%, #221C18 0%, #1A1714 45%, #100D0B 100%)",
          opacity: intro,
        }}
      />

      {/* The clock cluster — centered, slightly above middle. */}
      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "center",
          opacity: intro,
          transform: `translateY(${clockRise - 40}px)`,
        }}
      >
        <div
          style={{
            fontFamily: FONT,
            fontSize: 30,
            fontWeight: 600,
            letterSpacing: 14,
            textTransform: "uppercase",
            color: "#8C7F73",
            marginBottom: 18,
            paddingLeft: 14,
          }}
        >
          Dimanche
        </div>
        <div
          style={{
            fontFamily: MONO,
            fontSize: 220,
            fontWeight: 700,
            lineHeight: 1,
            letterSpacing: 6,
            color: "#F2EBE2",
            display: "flex",
            alignItems: "baseline",
            textShadow: "0 0 60px rgba(255,235,200,0.10)",
          }}
        >
          <span>21</span>
          <span
            style={{
              opacity: colonOn ? 0.92 : 0.18,
              padding: "0 8px",
              transform: "translateY(-12px)",
            }}
          >
            :
          </span>
          <span>47</span>
        </div>
      </AbsoluteFill>

      {/* Bottom-left: the filename typing itself — single line, no label. */}
      <div
        style={{
          position: "absolute",
          left: 120,
          right: 120,
          bottom: 190,
          opacity: intro,
          display: "flex",
          alignItems: "center",
          gap: 16,
        }}
      >
        <FileSpreadsheet
          size={32}
          strokeWidth={1.75}
          color="#6E635A"
          style={{ flexShrink: 0 }}
        />
        <span
          style={{
            fontFamily: MONO,
            fontSize: 34,
            fontWeight: 400,
            color: "#B7AEA3",
            whiteSpace: "nowrap",
          }}
        >
          {before}
          <span style={{ color: v7Color, fontWeight: 700 }}>{v7}</span>
          {after}
          <span
            style={{
              display: "inline-block",
              width: 14,
              height: 34,
              marginLeft: 2,
              transform: "translateY(5px)",
              background: showCaret ? "#B7AEA3" : "transparent",
            }}
          />
        </span>
      </div>

      {/* Heavy vignette overlay, darkening the edges. */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(75% 65% at 50% 46%, rgba(0,0,0,0) 38%, rgba(0,0,0,0.55) 78%, rgba(0,0,0,0.85) 100%)",
          pointerEvents: "none",
        }}
      />

      {/* Fade-in masking layer: pure black on top, lifted over 0..18. */}
      <AbsoluteFill
        style={{
          background: "#000",
          opacity: 1 - intro,
          pointerEvents: "none",
        }}
      />

      <Caption
        frame={f}
        appearAt={70}
        text="Dimanche. 21h47. Et je refais encore le planning à la main."
      />
    </AbsoluteFill>
  );
};