import type { MetadataRoute } from "next";

/** Web app manifest: lets the app be installed to a phone's home screen. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Construction Ledger",
    short_name: "Ledger",
    description:
      "Khata book for construction sites: ledgers, expenses and contractor balances.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f1f5f9",
    theme_color: "#f59e0b",
    icons: [
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
