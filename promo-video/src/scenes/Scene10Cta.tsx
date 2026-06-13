import React from "react";
import { AbsoluteFill, interpolate, Easing, useCurrentFrame } from "remotion";
import { C, FONT, RADIUS } from "../theme";
import { PawPrint, Check, Home, MapPin, Gift, Sparkles } from "lucide-react";

// Scene 10 (66–74s of the full film, 240 frames) — CTA "design-partner" end card.
// Full-bleed Warm Linen. Pawly wordmark, a first-person co-build line, an honest
// 5-slot scarcity row (2 filled / 3 softly blinking empty), three staggered CTA
// lines, and a calm founder contact line with a blinking text cursor. Genuine
// invitation, never an aggressive "limited offer". The end holds calm.

// One empty clinic slot — dashed outline, softly blinking via sine opacity.
const EmptySlot: React.FC<{ frame: number; index: number }> = ({
  frame,
  index,
}) => {
  // Per-slot phase offset so the three empties breathe out of sync (deterministic).
  const phase = index * 1.3;
  const blink = 0.45 + 0.35 * Math.sin(frame / 14 + phase);
  return (
    <div
      style={{
        width: 92,
        height: 92,
        borderRadius: RADIUS,
        border: `2px dashed ${C.border}`,
        background: C.card,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: blink,
      }}
    >
      <Home size={36} color={C.subtle} strokeWidth={1.75} />
    </div>
  );
};

// One filled clinic slot — solid teal with a check badge.
const FilledSlot: React.FC = () => {
  return (
    <div
      style={{
        position: "relative",
        width: 92,
        height: 92,
        borderRadius: RADIUS,
        background: C.vetTeal,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "0 8px 20px rgba(0,149,136,0.28)",
      }}
    >
      <Home size={36} color="#FFFFFF" strokeWidth={2} />
      <div
        style={{
          position: "absolute",
          top: -8,
          right: -8,
          width: 30,
          height: 30,
          borderRadius: 999,
          background: C.card,
          border: `2px solid ${C.vetTeal}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Check size={18} color={C.vetTeal} strokeWidth={3} />
      </div>
    </div>
  );
};

// One staggered CTA line — fade + translateY driven by a per-index delay.
const CtaLine: React.FC<{
  frame: number;
  delay: number;
  icon: React.ReactNode;
  text: string;
}> = ({ frame, delay, icon, text }) => {
  const o = interpolate(frame, [delay, delay + 14], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const ty = interpolate(frame, [delay, delay + 14], [22, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  return (
    <div
      style={{
        opacity: o,
        transform: `translateY(${ty}px)`,
        display: "flex",
        alignItems: "center",
        gap: 18,
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: RADIUS,
        padding: "18px 28px",
        width: 720,
      }}
    >
      <div
        style={{
          width: 46,
          height: 46,
          borderRadius: 10,
          background: C.tealWash,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div style={{ fontSize: 27, fontWeight: 600, color: C.softBlack }}>
        {text}
      </div>
    </div>
  );
};

export const Scene10Cta: React.FC = () => {
  const f = useCurrentFrame();

  // Wordmark drops in first.
  const wordIn = interpolate(f, [4, 24], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const wordY = interpolate(f, [4, 24], [-18, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  // Co-build line fades up after the wordmark.
  const lineIn = interpolate(f, [26, 48], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const lineY = interpolate(f, [26, 48], [16, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  // Scarcity row reveals after the headline; each filled/empty slot scales in.
  const rowIn = interpolate(f, [54, 74], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const rowScale = 0.92 + 0.08 * rowIn;

  // Contact block (last) fades up, then holds calm.
  const contactIn = interpolate(f, [150, 174], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const contactY = interpolate(f, [150, 174], [16, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  // Blinking text cursor after the email — square wave from sine, only once
  // the contact line has appeared so it doesn't blink into empty space.
  const cursorOn =
    f >= 176 && Math.sin(f / 6) > 0 ? 1 : f >= 176 ? 0.05 : 0;

  return (
    <AbsoluteFill style={{ background: C.warmLinen, fontFamily: FONT }}>
      <AbsoluteFill
        style={{
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 34,
          padding: "0 80px",
        }}
      >
        {/* Wordmark */}
        <div
          style={{
            opacity: wordIn,
            transform: `translateY(${wordY}px)`,
            display: "flex",
            alignItems: "center",
            gap: 14,
          }}
        >
          <PawPrint size={56} color={C.vetTeal} strokeWidth={2.25} />
          <span
            style={{
              fontSize: 60,
              fontWeight: 700,
              color: C.vetTeal,
              letterSpacing: "-0.02em",
            }}
          >
            Pawly
          </span>
        </div>

        {/* First-person co-build line */}
        <div
          style={{
            opacity: lineIn,
            transform: `translateY(${lineY}px)`,
            fontSize: 42,
            fontWeight: 700,
            color: C.softBlack,
            textAlign: "center",
            maxWidth: 1100,
            lineHeight: 1.18,
          }}
        >
          Je veux le finir AVEC vous, pas pour vous.
        </div>

        {/* Honest scarcity row — 2 filled, 3 softly blinking empty */}
        <div
          style={{
            opacity: rowIn,
            transform: `scale(${rowScale})`,
            display: "flex",
            alignItems: "center",
            gap: 22,
            marginTop: 4,
          }}
        >
          <FilledSlot />
          <FilledSlot />
          <EmptySlot frame={f} index={0} />
          <EmptySlot frame={f} index={1} />
          <EmptySlot frame={f} index={2} />
        </div>

        {/* Three staggered CTA lines */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 16,
            marginTop: 8,
          }}
        >
          <CtaLine
            frame={f}
            delay={84}
            icon={<MapPin size={24} color={C.vetTeal} strokeWidth={2.25} />}
            text="3 à 5 cliniques pilotes en Île-de-France"
          />
          <CtaLine
            frame={f}
            delay={102}
            icon={<Gift size={24} color={C.vetTeal} strokeWidth={2.25} />}
            text="Gratuit pendant 3 mois de co-design"
          />
          <CtaLine
            frame={f}
            delay={120}
            icon={<Sparkles size={24} color={C.vetTeal} strokeWidth={2.25} />}
            text="Vous décidez des prochaines fonctionnalités"
          />
        </div>

        {/* Founder contact line with blinking text cursor + soft pill */}
        <div
          style={{
            opacity: contactIn,
            transform: `translateY(${contactY}px)`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 18,
            marginTop: 12,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              fontSize: 30,
              fontWeight: 600,
              color: C.softBlack,
            }}
          >
            <span>Alex — fondateur · alex@pawly.fr</span>
            <span
              style={{
                display: "inline-block",
                width: 3,
                height: 30,
                marginLeft: 4,
                background: C.vetTeal,
                opacity: cursorOn,
              }}
            />
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              background: C.tealWash,
              border: `1px solid ${C.vetTeal}`,
              color: C.vetTealDark,
              fontSize: 22,
              fontWeight: 600,
              padding: "12px 24px",
              borderRadius: 999,
            }}
          >
            <Check size={18} color={C.vetTealDark} strokeWidth={2.5} />
            Réserver 20 min — sans engagement
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
