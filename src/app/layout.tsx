import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { RegisterServiceWorker } from "./register-service-worker";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

// PWA — Web App Manifest (L5-T05, ADR-001/RNF-04). O campo `manifest` da
// Metadata API injeta `<link rel="manifest">` automaticamente no `<head>`;
// `appleWebApp` cobre o comportamento de instalação em iOS/Safari, que não
// segue o manifest padrão.
export const metadata: Metadata = {
  title: "CurtaMais",
  description: "Planejador de viagens com decisão guiada por IA",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "CurtaMais",
  },
  icons: {
    icon: "/icons/icon-192.svg",
    apple: "/icons/icon-192.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#0F172A",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}
      >
        {children}
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
