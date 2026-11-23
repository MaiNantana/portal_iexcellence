/**
 * "Remember me" on sign-in.
 * Checked (default): the session lasts SESSION_MAX_AGE (30 days).
 * Unchecked: the session ends when the browser closes (BROWSER_COOKIE is a session cookie the
 * jwt callback requires) and at most SHORT_SESSION_MS after sign-in.
 */
export const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // seconds
export const SHORT_SESSION_MS = 8 * 60 * 60 * 1000;
/** Carries the choice through the Google / Microsoft round trip (credentials pass it directly). */
export const REMEMBER_COOKIE = "ix_remember";
/** Session-only cookie: gone after the browser closes, which ends a non-remembered session. */
export const BROWSER_COOKIE = "ix_browser";
