import React from "react";
import { C } from "../theme";

const Dot: React.FC<{ color: string }> = ({ color }) => (
  <div
    style={{ width: 13, height: 13, borderRadius: 999, background: color }}
  />
);

// A neutral app-window chrome so the mocked Pawly UI reads as "a real product".
export const AppWindow: React.FC<{
  title: string;
  children: React.ReactNode;
}> = ({ title, children }) => (
  <div
    style={{
      width: "100%",
      background: C.card,
      borderRadius: 18,
      boxShadow: "0 24px 70px rgba(26,26,26,0.14)",
      border: `1px solid ${C.border}`,
      overflow: "hidden",
    }}
  >
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "14px 18px",
        borderBottom: `1px solid ${C.border}`,
        background: "#ffffff",
      }}
    >
      <div style={{ display: "flex", gap: 7 }}>
        <Dot color="#FF5F57" />
        <Dot color="#FEBC2E" />
        <Dot color="#28C840" />
      </div>
      <span
        style={{
          marginLeft: 8,
          fontSize: 15,
          color: C.subtle,
          fontWeight: 600,
        }}
      >
        {title}
      </span>
    </div>
    <div style={{ padding: 28 }}>{children}</div>
  </div>
);
