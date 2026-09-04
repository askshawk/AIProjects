import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/config";

/**
 * The signed-in-only pages carry per-page `robots: { index: false }` too
 * (belt-and-braces — a disallow here stops crawling, the meta tag stops
 * indexing something that got linked to from elsewhere anyway).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/account", "/train", "/history", "/gym", "/programs/review", "/api/"],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
