import React from "react";
import {
  AbsoluteFill,
  interpolate,
  Easing,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { CheckCircle2, Mail, Send } from "lucide-react";
import { C, FONT, RADIUS } from "../theme";
import { AppWindow } from "../components/AppWindow";
import { FauxCursor } from "../components/FauxCursor";
import { Caption } from "../components/Caption";

// Scene 7 (44–51s of the full film, 210 frames) — "100% prêt : déverrouillage de Publier".
// The HealthBar settles into its fully-healthy teal state, a "% prêt" counter climbs with a
// slight overshoot to 100, the Publier button unlocks from grey → active dark + pulses, the
// cursor clicks it (~f130), a restrained publish dialog flashes, and a teal "Publié" badge lands.

// ---- Final, fully-healthy HealthBar (inline) ---------------------------------
const FinalHealthBar: React.FC<{ frame: number; pct: number }> = ({
  frame,
  pct,
}) => {
  // Status icon pops in with a spring (driven by frame, not CSS).
  const iconPop = interpolate(frame, [6, 20], [0.6, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.back(1.6)),
  });
  // The teal fill sweeps across the track.
  const fillW = interpolate(frame, [0, 26], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 20,
        padding: "22px 26px",
        borderRadius: RADIUS,
        background: C.tealWash,
        border: `1.5px solid ${C.vetTeal}`,
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 999,
          background: "#ffffff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          transform: `scale(${iconPop})`,
          boxShadow: "0 4px 12px rgba(0,149,136,0.25)",
        }}
      >
        <CheckCircle2 size={34} color={C.vetTeal} strokeWidth={2.4} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 24,
            fontWeight: 700,
            color: C.vetTealDark,
            marginBottom: 6,
          }}
        >
          Planning conforme
        </div>
        <div style={{ fontSize: 18, color: C.softBlack, opacity: 0.78 }}>
          Tout est bon — aucune violation détectée
        </div>
        {/* Progress track */}
        <div
          style={{
            marginTop: 14,
            height: 12,
            width: "100%",
            borderRadius: 999,
            background: "rgba(0,149,136,0.18)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${fillW * 100}%`,
              borderRadius: 999,
              background: C.vetTeal,
            }}
          />
        </div>
      </div>

      <div
        style={{
          fontSize: 40,
          fontWeight: 700,
          color: C.vetTeal,
          fontVariantNumeric: "tabular-nums",
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}
      >
        {pct}% prêt
      </div>
    </div>
  );
};

// ---- Publish dialog card (inline, flashes after the click) -------------------
const PublishDialog: React.FC<{ local: number; fps: number }> = ({
  local,
  fps,
}) => {
  // Card springs up from below.
  const enter = spring({
    frame: local,
    fps,
    config: { damping: 18, stiffness: 130, mass: 0.7 },
  });
  const y = interpolate(enter, [0, 1], [26, 0]);

  // The teal "Publié" badge resolves a bit later, replacing the send affordance.
  const published = local >= 26;
  const badgePop = interpolate(local, [26, 40], [0.7, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.back(1.8)),
  });

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(26,26,26,0.16)",
        zIndex: 30,
      }}
    >
      <div
        style={{
          width: 460,
          background: C.card,
          borderRadius: 16,
          border: `1px solid ${C.border}`,
          boxShadow: "0 24px 70px rgba(26,26,26,0.22)",
          padding: 28,
          opacity: enter,
          transform: `translateY(${y}px)`,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            marginBottom: 18,
          }}
        >
          <div
            style={{
              width: 46,
              height: 46,
              borderRadius: 12,
              background: C.tealWash,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Mail size={26} color={C.vetTeal} strokeWidth={2.2} />
          </div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, color: C.softBlack }}>
              Publier le planning
            </div>
            <div style={{ fontSize: 16, color: C.subtle }}>
              24 emails envoyés
            </div>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          {published ? (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 9,
                background: C.tealWash,
                color: C.vetTealDark,
                padding: "11px 20px",
                borderRadius: 999,
                fontSize: 18,
                fontWeight: 700,
                transform: `scale(${badgePop})`,
                border: `1.5px solid ${C.vetTeal}`,
              }}
            >
              <CheckCircle2 size={20} color={C.vetTeal} strokeWidth={2.6} />
              <span>Publié</span>
            </div>
          ) : (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 9,
                background: C.softBlack,
                color: "#ffffff",
                padding: "11px 22px",
                borderRadius: 999,
                fontSize: 18,
                fontWeight: 600,
              }}
            >
              <Send size={18} strokeWidth={2.2} />
              <span>Envoyer</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const Scene07Publish: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Window settle-in.
  const intro = interpolate(f, [0, 16], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const winScale = 0.97 + 0.03 * intro;

  // "% prêt" counter: climbs to ~104 then settles to 100 (slight overshoot).
  const rawPct = interpolate(f, [8, 52, 66], [0, 104, 100], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const pct = Math.min(100, Math.round(rawPct));

  // Click choreography around frame ~130.
  const clickFrame = 130;
  const cx = interpolate(f, [40, 120], [1500, 1230], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const cy = interpolate(f, [40, 120], [620, 372], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const clicking = f >= clickFrame && f <= clickFrame + 10;

  // Publish button: unlocks from disabled grey → active dark once it's 100% prêt (~f70),
  // then a restrained sine pulse invites the click.
  const unlocked = f >= 70;
  const unlockMix = interpolate(f, [70, 86], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  // Sine pulse, only while unlocked and before the click.
  const pulseActive = unlocked && f < clickFrame;
  const pulse = pulseActive ? 1 + 0.025 * Math.sin((f - 70) * 0.34) : 1;
  const pressed = clicking;
  const btnScale = (pressed ? 0.96 : 1) * pulse;
  const btnBg = unlocked ? C.softBlack : C.muted;
  const btnColor = unlocked ? "#ffffff" : C.subtle;
  const btnShadow = unlocked
    ? `0 10px 26px rgba(26,26,26,${0.22 * unlockMix})`
    : "none";

  // Dialog appears just after the click and lingers briefly (restrained single flash).
  const dialogStart = clickFrame + 6;
  const showDialog = f >= dialogStart;
  const dialogLocal = f - dialogStart;

  return (
    <AbsoluteFill style={{ background: C.warmLinen, fontFamily: FONT }}>
      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "flex-start",
          paddingTop: 130,
        }}
      >
        <div
          style={{
            transform: `scale(${winScale})`,
            opacity: intro,
            width: 1500,
          }}
        >
          <AppWindow title="Pawly · Planning — juin 2026">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 22,
              }}
            >
              <div>
                <div
                  style={{ fontSize: 26, fontWeight: 700, color: C.softBlack }}
                >
                  Planning — juin 2026
                </div>
                <div style={{ fontSize: 16, color: C.subtle }}>
                  Modèle de semaine · 6 collaborateurs
                </div>
              </div>

              {/* Publish button (inline) — grey/disabled → dark/active */}
              <div
                style={{
                  position: "relative",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 10,
                  background: btnBg,
                  color: btnColor,
                  padding: "15px 28px",
                  borderRadius: RADIUS,
                  fontSize: 20,
                  fontWeight: 700,
                  whiteSpace: "nowrap",
                  border: unlocked ? "none" : `1px solid ${C.border}`,
                  boxShadow: btnShadow,
                  transform: `scale(${btnScale})`,
                  transformOrigin: "center",
                }}
              >
                <Send size={20} strokeWidth={2.2} />
                <span>Publier</span>
              </div>
            </div>

            <FinalHealthBar frame={f} pct={pct} />

            {/* Light schedule context strip under the health bar (keeps the card grounded). */}
            <div
              style={{
                marginTop: 22,
                display: "flex",
                gap: 14,
              }}
            >
              {["Repos légal", "Disponibilités", "Équité", "Jours d'école"].map(
                (label, i) => {
                  const appear = interpolate(
                    f,
                    [18 + i * 5, 32 + i * 5],
                    [0, 1],
                    {
                      extrapolateLeft: "clamp",
                      extrapolateRight: "clamp",
                      easing: Easing.out(Easing.cubic),
                    },
                  );
                  return (
                    <div
                      key={label}
                      style={{
                        flex: 1,
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "14px 18px",
                        borderRadius: RADIUS,
                        background: C.muted,
                        border: `1px solid ${C.border}`,
                        opacity: appear,
                        transform: `translateY(${(1 - appear) * 8}px)`,
                      }}
                    >
                      <CheckCircle2
                        size={20}
                        color={C.vetTeal}
                        strokeWidth={2.4}
                      />
                      <span
                        style={{
                          fontSize: 17,
                          fontWeight: 600,
                          color: C.softBlack,
                        }}
                      >
                        {label}
                      </span>
                    </div>
                  );
                },
              )}
            </div>
          </AppWindow>
        </div>
      </AbsoluteFill>

      {showDialog ? <PublishDialog local={dialogLocal} fps={fps} /> : null}

      <Caption
        frame={f}
        appearAt={20}
        text="Repos légal, disponibilités, équité, jours d'école : tout est respecté. Planning prêt."
      />

      <FauxCursor x={cx} y={cy} clicking={clicking} />
    </AbsoluteFill>
  );
};