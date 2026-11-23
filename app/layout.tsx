import type { Metadata, Viewport } from "next";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "KUCCPS Cluster Points Calculator & Course Checker (KCSE)",
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "KUCCPS cluster points calculator",
    "KCSE cluster points",
    "KUCCPS cutoff points",
    "weighted cluster points",
    "KUCCPS courses I qualify for",
    "KCSE mean grade calculator",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "en_KE",
    url: "/",
    siteName: SITE_NAME,
    title: "Which KUCCPS degree courses can you get?",
    description: SITE_DESCRIPTION,
  },
  twitter: { card: "summary_large_image", title: "KUCCPS Cluster Points Calculator", description: SITE_DESCRIPTION },
  robots: { index: true, follow: true },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
  colorScheme: "light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-KE">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
