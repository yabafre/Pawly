import React from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { C, RADIUS } from "../theme";

// Mirrors the real GenerationPanel button: idle "Générer le planning" (Sparkles)
// → loading "Génération en cours..." (Loader2). Strings verbatim from fr.json.
export const GenerationButton: React.FC<{
  loading: boolean;
  spin: number;
  pressed?: boolean;
}> = ({ loading, spin, pressed }) => (
  <div
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 10,
      background: C.vetTeal,
      color: "white",
      padding: "15px 24px",
      borderRadius: RADIUS,
      fontSize: 20,
      fontWeight: 600,
      whiteSpace: "nowrap",
      boxShadow: pressed
        ? "0 1px 2px rgba(0,0,0,0.2)"
        : "0 6px 16px rgba(0,149,136,0.35)",
      transform: pressed ? "translateY(1px)" : "none",
    }}
  >
    {loading ? (
      <>
        <Loader2 size={22} style={{ transform: `rotate(${spin}deg)` }} />
        <span>Génération en cours...</span>
      </>
    ) : (
      <>
        <Sparkles size={22} />
        <span>Générer le planning</span>
      </>
    )}
  </div>
);
