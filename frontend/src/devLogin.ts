export function devLoginEnabled(): boolean {
  return import.meta.env.DEV || import.meta.env.VITE_DEV_LOGIN === "1";
}
