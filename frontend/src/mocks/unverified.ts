import type { HttpHandler } from "msw";

export type UnverifiedEntry = {
  method: string;
  path: string;
  note: string;
};

const registry: UnverifiedEntry[] = [];

type Resolver = (info: {
  request: Request;
  requestId: string;
  finalize: (callback: () => void) => void;
}) => Promise<Response | undefined | void> | Response | undefined | void;

type MutableHandler = HttpHandler & { resolver: Resolver };

export function unverifiedRegistry(): readonly UnverifiedEntry[] {
  return registry;
}

export function clearUnverifiedRegistry(): void {
  registry.length = 0;
}

export function unverified(handler: HttpHandler, note: string): HttpHandler {
  const info = handler.info;
  registry.push({
    method: String(info.method),
    path: typeof info.path === "string" ? info.path : info.header,
    note,
  });
  const target = handler as MutableHandler;
  const original = target.resolver;
  target.resolver = async (resolverInfo) => {
    const result = await original(resolverInfo);
    if (result instanceof Response) {
      result.headers.set("x-scene-mock", "unverified");
    }
    return result;
  };
  return handler;
}
