import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { unlinkSync, existsSync } from "node:fs";
import { initDatabase } from "../src/storage/sqlite.js";
import { createCache, normalizeRequest } from "../src/cache/index.js";
import { DEFAULT_CONFIG } from "../src/config/defaults.js";
import { bootstrapLogger } from "../src/utils/logger.js";

const TEST_DB = "/tmp/proxiq-test-cache.db";

function cleanup() {
  for (const f of [TEST_DB, `${TEST_DB}-shm`, `${TEST_DB}-wal`]) {
    if (existsSync(f)) unlinkSync(f);
  }
}

describe("Exact cache", () => {
  let db: ReturnType<typeof initDatabase>;
  let cache: ReturnType<typeof createCache>;

  beforeEach(() => {
    cleanup();
    db = initDatabase(TEST_DB);
    const config = { ...DEFAULT_CONFIG, cache: { ...DEFAULT_CONFIG.cache, storagePath: TEST_DB } };
    cache = createCache(config, db, null, bootstrapLogger());
  });

  afterEach(() => {
    db.close();
    cleanup();
  });

  it("returns null on cache miss", async () => {
    const req = normalizeRequest({ model: "claude-3-5-haiku-20241022", messages: [{ role: "user", content: "hi" }] }, "anthropic");
    const result = await cache.get(req);
    expect(result).toBeNull();
  });

  it("returns cached response after set", async () => {
    const req = normalizeRequest({ model: "claude-3-5-haiku-20241022", messages: [{ role: "user", content: "hello world" }] }, "anthropic");
    const response = { id: "abc", content: [{ text: "Hello!" }] };
    await cache.set(req, response, 10, 5);
    const result = await cache.get(req);
    expect(result).not.toBeNull();
    expect(result?.source).toBe("exact");
    expect(result?.inputTokens).toBe(10);
    expect(result?.outputTokens).toBe(5);
  });

  it("hash is consistent for same input", () => {
    const req1 = normalizeRequest({ model: "claude-3-5-haiku-20241022", messages: [{ role: "user", content: "test" }] }, "anthropic");
    const req2 = normalizeRequest({ model: "claude-3-5-haiku-20241022", messages: [{ role: "user", content: "test" }] }, "anthropic");
    expect(req1.hash).toBe(req2.hash);
  });

  it("hash differs for different messages", () => {
    const req1 = normalizeRequest({ model: "claude-3-5-haiku-20241022", messages: [{ role: "user", content: "foo" }] }, "anthropic");
    const req2 = normalizeRequest({ model: "claude-3-5-haiku-20241022", messages: [{ role: "user", content: "bar" }] }, "anthropic");
    expect(req1.hash).not.toBe(req2.hash);
  });
});
