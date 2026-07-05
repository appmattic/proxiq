export interface RelayRequest {
  id: string;
  sessionId: string;
  provider: string;
  model: string;
  body: Record<string, unknown>;
  /** Request headers (x-proxiq-* already stripped) */
  headers: Record<string, string>;
  /** Session ID — from x-proxiq-session-id header or auto-generated */
  metadata: Record<string, unknown>;
  /** Authenticated user label ("anonymous" if auth not required and no token provided). */
  userLabel: string;
  /** Per-user upstream key override resolved from auth token (undefined = use global key). */
  upstreamKeyOverride?: string;
}

export interface RelayResponse {
  id: string;
  requestId: string;
  provider: string;
  model: string;
  content: unknown;
  inputTokens: number;
  outputTokens: number;
  fromCache: boolean;
  cacheSource?: "exact" | "semantic";
  compressed: boolean;
  durationMs: number;
  // Routing metadata
  originalModel: string;
  routedModel: string;
  routingMethod: string;
  routingTier: string;
  costUsd: number;
  savedUsd: number;
}

export interface RelayMiddleware {
  name: string;
  /** Lower number = runs first. Built-ins use 10–20. Phase 2 plugins should use 50–90. */
  priority?: number;
  onRequest?(req: RelayRequest): Promise<RelayRequest | RelayResponse>;
  onResponse?(res: RelayResponse, req: RelayRequest): Promise<RelayResponse>;
  onError?(err: Error, req: RelayRequest): Promise<void>;
}

export interface MiddlewareRegistry {
  register(middleware: RelayMiddleware): void;
  getAll(): RelayMiddleware[];
}
