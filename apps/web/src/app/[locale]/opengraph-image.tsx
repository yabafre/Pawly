import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Pawly - Planning vétérinaire intelligent";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const translations = {
  fr: {
    title: "Pawly",
    subtitle: "Planning intelligent pour cliniques vétérinaires",
    cta: "Simplifiez la gestion de votre équipe",
  },
  en: {
    title: "Pawly",
    subtitle: "Intelligent scheduling for veterinary clinics",
    cta: "Simplify your team management",
  },
};

export default async function OgImage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = translations[locale as keyof typeof translations] ?? translations.fr;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #faf8f5 0%, #f5f0eb 50%, #ede8e1 100%)",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {/* Logo circle */}
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: 20,
            background: "#171717",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 24,
          }}
        >
          <span style={{ fontSize: 40, color: "#faf8f5" }}>🐾</span>
        </div>

        {/* Title */}
        <h1
          style={{
            fontSize: 64,
            fontWeight: 800,
            color: "#171717",
            margin: 0,
            letterSpacing: "-2px",
          }}
        >
          {t.title}
        </h1>

        {/* Subtitle */}
        <p
          style={{
            fontSize: 28,
            color: "#737373",
            margin: "12px 0 0 0",
            maxWidth: 700,
            textAlign: "center",
          }}
        >
          {t.subtitle}
        </p>

        {/* CTA pill */}
        <div
          style={{
            marginTop: 32,
            padding: "12px 28px",
            borderRadius: 999,
            background: "#009588",
            color: "white",
            fontSize: 20,
            fontWeight: 600,
          }}
        >
          {t.cta}
        </div>

        {/* Bottom bar */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            width: "100%",
            height: 6,
            background: "linear-gradient(90deg, #009588, #171717)",
          }}
        />
      </div>
    ),
    { ...size },
  );
}
