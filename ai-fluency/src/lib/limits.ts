/**
 * Input limits shared by the pages (to guide typing) and the server (to
 * enforce them). Kept free of server imports so client components can use it.
 */
export const MAX_EXPLAIN_CHARS = 2000;
/** A practice call ends after this many answers from you. */
export const MAX_REP_TURNS = 8;
export const MAX_TURN_CHARS = 1500;
export const MAX_NOTES_CHARS = 30_000;
export const MAX_QUESTION_CHARS = 500;
