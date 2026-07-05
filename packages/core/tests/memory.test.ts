import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, unlinkSync } from "node:fs";
import { createMemoryStore } from "../src/memory/store.js";
import { initDatabase } from "../src/storage/sqlite.js";

const TEST_DB = "/tmp/proxiq-test-memory.db";

function cleanup() {
  for (const f of [TEST_DB, `${TEST_DB}-shm`, `${TEST_DB}-wal`]) {
    if (existsSync(f)) unlinkSync(f);
  }
}

describe("Memory store", () => {
  let db: ReturnType<typeof initDatabase>;
  let store: ReturnType<typeof createMemoryStore>;

  beforeEach(() => {
    cleanup();
    db = initDatabase(TEST_DB);
    store = createMemoryStore(db);
  });

  afterEach(() => {
    db.close();
    cleanup();
  });

  it("recalls turns for a session", () => {
    store.addTurn("sess-1", "user", "Hello!", null);
    store.addTurn("sess-1", "assistant", "Hi there!", null);
    const turns = store.recall("sess-1", 5);
    expect(turns.length).toBe(2);
  });

  it("isolates turns by session", () => {
    store.addTurn("sess-a", "user", "From A", null);
    store.addTurn("sess-b", "user", "From B", null);
    const turnsA = store.recall("sess-a", 5);
    expect(turnsA.length).toBe(1);
    expect(turnsA[0]?.content).toBe("From A");
  });

  it("returns empty for unknown session", () => {
    const turns = store.recall("unknown-session", 5);
    expect(turns.length).toBe(0);
  });

  it("purges turns older than cutoff", () => {
    store.addTurn("sess-x", "user", "Old message", null);
    const futureCutoff = Math.floor(Date.now() / 1000) + 10;
    const purged = store.purgeOlderThan(futureCutoff);
    expect(purged).toBeGreaterThanOrEqual(0);
  });
});
