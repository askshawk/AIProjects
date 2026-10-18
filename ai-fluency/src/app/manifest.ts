import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AI Fluency",
    short_name: "AI Fluency",
    description: "Learn AI terms well enough to explain them to customers.",
    // Opened from the home screen, it should land on today's study plan.
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
