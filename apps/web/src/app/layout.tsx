import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pawly - Clinique Zen",
  description: "Le planning intelligent pour votre clinique vétérinaire.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html>
      <body>{children}</body>
    </html>
  );
}
