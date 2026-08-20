import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Iron Atlas",
    short_name: "Iron Atlas",
    description:
      "Lifting programs from the coaches worth reading, adapted to your gym and logged as you train.",
    // Straight into the workout — this is installed to be used in a gym, not
    // browsed from a home page.
    start_url: "/train",
    display: "standalone",
    background_color: "#0b0d10",
    theme_color: "#0b0d10",
    orientation: "portrait",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
