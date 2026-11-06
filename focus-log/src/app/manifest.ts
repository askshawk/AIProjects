import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Focus Log",
    short_name: "Focus Log",
    description: "Track focus time and gaming time.",
    start_url: "/",
    display: "standalone",
    background_color: "#0e0e13",
    theme_color: "#0e0e13",
    orientation: "portrait",
    icons: [
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
