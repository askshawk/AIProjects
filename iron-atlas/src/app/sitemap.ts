import type { MetadataRoute } from "next";
import { db } from "@/db";
import { exercises, programs } from "@/db/schema";
import { listAuthors } from "@/lib/authors";
import { siteUrl } from "@/lib/config";

/**
 * The library's public surface: home, the browse pages, and every program,
 * author, and exercise detail page. Account/train/history/gym/review are
 * left out entirely — see robots.ts, which also marks them noindex.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();

  const [programRows, authorRows, exerciseRows] = await Promise.all([
    db.select({ slug: programs.slug }).from(programs),
    listAuthors(),
    db.select({ slug: exercises.slug }).from(exercises),
  ]);

  return [
    { url: base, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/programs`, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/programs/authors`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${base}/exercises`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${base}/about`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${base}/terms`, changeFrequency: "monthly", priority: 0.3 },
    ...programRows.map((p) => ({
      url: `${base}/programs/${p.slug}`,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
    ...authorRows.map((a) => ({
      url: `${base}/programs/authors/${a.slug}`,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
    ...exerciseRows.map((e) => ({
      url: `${base}/exercises/${e.slug}`,
      changeFrequency: "yearly" as const,
      priority: 0.5,
    })),
  ];
}
