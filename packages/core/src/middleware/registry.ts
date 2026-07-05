import type { MiddlewareRegistry, RelayMiddleware } from "./types.js";

export function createMiddlewareRegistry(): MiddlewareRegistry {
  const middlewares: RelayMiddleware[] = [];

  return {
    register(middleware: RelayMiddleware): void {
      middlewares.push(middleware);
      middlewares.sort((a, b) => (a.priority ?? 50) - (b.priority ?? 50));
    },
    getAll(): RelayMiddleware[] {
      return [...middlewares];
    },
  };
}
