import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { ServiceWorkerRegistrar } from "@/components/ServiceWorkerRegistrar";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Construction Ledger - Multi-Site Khata Book",
  description:
    "Mobile-first khata book webapp for construction developers, contractors, and site supervisors.",
  applicationName: "Construction Ledger",
  icons: {
    icon: [{ url: "/icons/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  // Installed on iOS: run full-screen with the app's own name.
  appleWebApp: {
    capable: true,
    title: "Ledger",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#f59e0b",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark h-full antialiased">
      <body
        className={`${inter.className} min-h-full bg-slate-950 text-slate-100 flex flex-col`}
      >
        {children}
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
