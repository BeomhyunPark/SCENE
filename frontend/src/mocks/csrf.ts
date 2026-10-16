const CSRF_HEADER = "X-XSRF-TOKEN";
const CSRF_COOKIE = "XSRF-TOKEN";

/** jsdom does not attach `document.cookie` to fetch, so the jar is read here too. */
export function csrfMatches(request: Request, cookies: Record<string, string>): boolean {
  const header = request.headers.get(CSRF_HEADER);
  const cookie = cookies[CSRF_COOKIE] || cookieFrom(request) || documentCookie(CSRF_COOKIE);
  return Boolean(header && cookie && header === cookie);
}

function cookieFrom(request: Request): string | undefined {
  const header = request.headers.get("cookie");
  if (!header) return undefined;
  return readCookie(header);
}

function documentCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  return readCookie(document.cookie, name);
}

function readCookie(source: string, name = CSRF_COOKIE): string | undefined {
  for (const part of source.split(";")) {
    const trimmed = part.trim();
    const separator = trimmed.indexOf("=");
    if (separator === -1 || trimmed.slice(0, separator) !== name) continue;
    const value = trimmed.slice(separator + 1);
    return value.length > 0 ? value : undefined;
  }
  return undefined;
}
