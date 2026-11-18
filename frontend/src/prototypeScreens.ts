/**
 * Organization search, join request and organization registration are click-through prototypes
 * that never call the server (#356). They stay in development builds for design review; a
 * production build shows the invitation notice instead.
 */
export function prototypeScreensEnabled(): boolean {
  return import.meta.env.DEV;
}
