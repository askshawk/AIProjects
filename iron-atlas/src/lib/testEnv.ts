/**
 * Suites that need a live embedding provider and a re-seeded catalogue guard
 * themselves with `describe.skipIf(!hasEmbeddings)`. A red suite should mean
 * "something is broken", not "you haven't finished setup yet".
 */
export const hasEmbeddings = Boolean(process.env.VOYAGE_API_KEY);
