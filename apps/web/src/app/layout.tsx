import type { Metadata } from "next";
import "./globals.css";

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://pawly.com';

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: "Pawly - Clinique Zen",
  description: "Le planning intelligent pour votre clinique vétérinaire.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
