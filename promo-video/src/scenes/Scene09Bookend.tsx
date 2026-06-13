import React from "react";
import {
  AbsoluteFill,
  interpolate,
  Easing,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { CheckCircle2, FileSpreadsheet, Sparkles } from "lucide-react";
import { C, FONT, RADIUS } from "../theme";

// Scene 9 — Bookend: avant/après & double boucle (59–66s of the full film, 210 frames).
// LEFT: small, cold, dark "DIMANCHE 21:47 — Excel". RIGHT: large, warm Warm-Linen
// "DIMANCHE 18:30 — Pawly · Publié" with a teal check. A kinetic line rises
// word-by-word, then the payoff line reveals with "mardi" underlined in the intro's
// dirty-yellow felt (#E8C23B). Around f~150 the subtitle flashes FR⇄EN once to prove
// the real instant bilingual switch. Sober, warm — no triumphal feel.

const FELT_YELLOW = "#E8C23B"; // the intro's dirty-yellow felt underline

// A single word that rises (translateY) out of a clip mask, per-index delayed.
const RisingWord: React.FC<{
  word: string;
  frame: number;
  startAt: number;
  color: string;
  underline?: boolean;
}> = ({ word, frame, startAt, color, underline = false }) => {
  const local = frame - startAt;
  const y = interpolate(local, [0, 16], [42, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const o = interpolate(local, [0, 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  // The felt underline draws left→right once the word has settled.
  const underlineW = underline
    ? interpolate(local, [10, 26], [0, 100], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: Easing.out(Easing.cubic),
      })
    : 0;

  return (
    <span
      style={{
        display: "inline-block",
        overflow: "hidden",
        verticalAlign: "bottom",
        paddingBottom: underline ? 6 : 0,
      }}
    >
      <span
        style={{
          display: "inline-block",
          position: "relative",
          transform: `translateY(${y}px)`,
          opacity: o,
          color,
        }}
      >
        {word}
        {underline && (
          <span
            style={{
              position: "absolute",
              left: 0,
              bottom: -2,
              height: 10,
              width: `${underlineW}%`,
              background: FELT_YELLOW,
              borderRadius: 3,
              // slight felt-marker irregularity, deterministic (no randomness)
              transform: "rotate(-0.6deg)",
              opacity: 0.92,
            }}
          />
        )}
      </span>
    </span>
  );
};

export const Scene09Bookend: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // --- Panels enter ---
  const panelIn = spring({
    frame,
    fps,
    config: { damping: 200, stiffness: 90, mass: 0.9 },
    durationInFrames: 28,
  });
  // Left (cold) panel slides in from the left, slightly behind the warm one.
  const leftX = interpolate(panelIn, [0, 1], [-60, 0]);
  const leftO = interpolate(frame, [0, 18], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  // Right (warm) panel rises and breathes.
  const rightY = interpolate(panelIn, [0, 1], [50, 0]);
  const rightO = interpolate(frame, [4, 24], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  // Airy, slow breathing on the warm panel (deterministic sine on frame).
  const breath = Math.sin(frame / 26) * 0.006;
  const rightScale = 1 + breath;

  // --- Kinetic line 1: "Récupérez vos dimanches soir." ---
  const line1Words = ["Récupérez", "vos", "dimanches", "soir."];
  const line1Start = 26;
  const line1Step = 8;

  // --- Payoff line 2 ---
  // "Pawly — le planning qui sait déjà que, le mardi, il est à l'école."
  const line2Tokens: { text: string; underline?: boolean }[] = [
    { text: "Pawly" },
    { text: "—" },
    { text: "le" },
    { text: "planning" },
    { text: "qui" },
    { text: "sait" },
    { text: "déjà" },
    { text: "que," },
    { text: "le" },
    { text: "mardi,", underline: true },
    { text: "il" },
    { text: "est" },
    { text: "à" },
    { text: "l'école." },
  ];
  const line2Start = 78;
  const line2Step = 5;

  // Teal published-check pop.
  const checkPop = spring({
    frame: frame - 14,
    fps,
    config: { damping: 14, stiffness: 160, mass: 0.6 },
    durationInFrames: 24,
  });
  const checkScale = interpolate(checkPop, [0, 1], [0.4, 1]);

  // --- FR ⇄ EN subtitle flash (proves instant bilingual switch) ---
  // FR shows first, crossfades to EN around f~150, then back to FR.
  const subAppear = interpolate(frame, [150, 158], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  // 0 = FR, 1 = EN. Flip to EN at ~162, back to FR at ~184.
  const enT = interpolate(frame, [160, 166, 182, 188], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });
  const subFade = interpolate(frame, [150, 158, 202, 210], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const subRise = interpolate(subAppear, [0, 1], [14, 0]);

  return (
    <AbsoluteFill style={{ background: C.warmLinen, fontFamily: FONT }}>
      {/* Soft warm ambient wash on the right side to keep the right panel "airy". */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(1100px 700px at 72% 42%, rgba(0,149,136,0.07), transparent 70%)",
        }}
      />

      {/* Split layout */}
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 64,
          padding: "0 130px",
        }}
      >
        {/* LEFT — cold, small, dark: the old way */}
        <div
          style={{
            opacity: leftO,
            transform: `translateX(${leftX}px)`,
            width: 360,
            flexShrink: 0,
            background: "#1F2329",
            border: "1px solid #2C313A",
            borderRadius: RADIUS,
            padding: "28px 26px",
            boxShadow: "0 14px 40px rgba(0,0,0,0.28)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              color: "#6B7280",
              fontSize: 18,
              fontWeight: 600,
              letterSpacing: 0.5,
            }}
          >
            <FileSpreadsheet size={20} color="#6B7280" />
            Excel
          </div>
          <div
            style={{
              marginTop: 18,
              color: "#9AA1AC",
              fontSize: 15,
              fontWeight: 600,
              letterSpacing: 1.5,
            }}
          >
            DIMANCHE
          </div>
          <div
            style={{
              marginTop: 2,
              color: "#E5E7EB",
              fontSize: 52,
              fontWeight: 700,
              fontVariantNumeric: "tabular-nums",
              lineHeight: 1.05,
            }}
          >
            21:47
          </div>
          <div
            style={{
              marginTop: 14,
              color: "#6B7280",
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            Encore en train de refaire le planning.
          </div>
        </div>

        {/* RIGHT — warm, large, airy: Pawly, published */}
        <div
          style={{
            opacity: rightO,
            transform: `translateY(${rightY}px) scale(${rightScale})`,
            width: 620,
            flexShrink: 0,
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: RADIUS + 6,
            padding: "42px 44px",
            boxShadow: "0 26px 70px rgba(0,125,114,0.16)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                color: C.vetTeal,
                fontSize: 24,
                fontWeight: 700,
              }}
            >
              <Sparkles size={24} color={C.vetTeal} />
              Pawly
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: C.tealWash,
                color: C.vetTealDark,
                padding: "8px 16px",
                borderRadius: 999,
                fontSize: 17,
                fontWeight: 700,
              }}
            >
              <span
                style={{
                  display: "inline-flex",
                  transform: `scale(${checkScale})`,
                }}
              >
                <CheckCircle2 size={20} color={C.vetTeal} />
              </span>
              Publié
            </div>
          </div>

          <div
            style={{
              marginTop: 34,
              color: C.subtle,
              fontSize: 18,
              fontWeight: 600,
              letterSpacing: 2,
            }}
          >
            DIMANCHE
          </div>
          <div
            style={{
              marginTop: 4,
              color: C.softBlack,
              fontSize: 92,
              fontWeight: 700,
              fontVariantNumeric: "tabular-nums",
              lineHeight: 1,
            }}
          >
            18:30
          </div>
          <div
            style={{
              marginTop: 22,
              color: C.subtle,
              fontSize: 20,
              fontWeight: 500,
            }}
          >
            Planning de la semaine envoyé à l'équipe.
          </div>
        </div>
      </AbsoluteFill>

      {/* Kinetic copy block (top-centered, above the panels' baseline area). */}
      <div
        style={{
          position: "absolute",
          top: 120,
          left: 0,
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          pointerEvents: "none",
        }}
      >
        {/* Line 1 — "Récupérez vos dimanches soir." */}
        <div
          style={{
            fontSize: 58,
            fontWeight: 700,
            lineHeight: 1.1,
            color: C.softBlack,
            letterSpacing: -0.5,
          }}
        >
          {line1Words.map((w, i) => (
            <React.Fragment key={`l1-${i}`}>
              <RisingWord
                word={w}
                frame={frame}
                startAt={line1Start + i * line1Step}
                color={i === 2 ? C.vetTeal : C.softBlack}
              />
              {i < line1Words.length - 1 ? " " : null}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Payoff line — bottom-centered, with felt-underlined "mardi". */}
      <div
        style={{
          position: "absolute",
          bottom: 150,
          left: 0,
          width: "100%",
          display: "flex",
          justifyContent: "center",
          padding: "0 160px",
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            maxWidth: 1400,
            textAlign: "center",
            fontSize: 36,
            fontWeight: 600,
            lineHeight: 1.45,
            color: C.softBlack,
          }}
        >
          {line2Tokens.map((t, i) => (
            <React.Fragment key={`l2-${i}`}>
              <RisingWord
                word={t.text}
                frame={frame}
                startAt={line2Start + i * line2Step}
                color={i === 0 ? C.vetTeal : C.softBlack}
                underline={t.underline}
              />
              {i < line2Tokens.length - 1 ? " " : null}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* FR ⇄ EN proof — styled as a real language-switcher UI element, not a
          caption pill: an FR/EN segmented chip flips and the line follows. */}
      <div
        style={{
          position: "absolute",
          bottom: 64,
          width: "100%",
          display: "flex",
          justifyContent: "center",
          opacity: subFade,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            transform: `translateY(${subRise}px)`,
            background: "#ffffff",
            border: `1px solid ${C.border}`,
            padding: "10px 18px",
            borderRadius: 999,
            boxShadow: "0 10px 30px rgba(26,26,26,0.12)",
          }}
        >
          {/* Segmented FR/EN chip — the knob is the teal-filled active segment */}
          <div
            style={{
              display: "flex",
              borderRadius: 999,
              border: `1px solid ${C.border}`,
              overflow: "hidden",
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            <span
              style={{
                padding: "5px 12px",
                background: enT < 0.5 ? C.vetTeal : "#ffffff",
                color: enT < 0.5 ? "#ffffff" : C.subtle,
              }}
            >
              FR
            </span>
            <span
              style={{
                padding: "5px 12px",
                background: enT >= 0.5 ? C.vetTeal : "#ffffff",
                color: enT >= 0.5 ? "#ffffff" : C.subtle,
              }}
            >
              EN
            </span>
          </div>
          {/* The line itself crossfades with the switch */}
          <div
            style={{
              display: "grid",
              fontSize: 21,
              fontWeight: 600,
              color: C.softBlack,
            }}
          >
            <span
              style={{
                gridArea: "1 / 1",
                opacity: 1 - enT,
                whiteSpace: "nowrap",
              }}
            >
              le planning qui sait déjà
            </span>
            <span
              style={{
                gridArea: "1 / 1",
                opacity: enT,
                whiteSpace: "nowrap",
                justifySelf: "center",
              }}
            >
              the schedule that already knows
            </span>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
