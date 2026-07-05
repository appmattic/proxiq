import { randomUUID } from "node:crypto";
import type { DB } from "../storage/sqlite.js";

export interface Turn {
  id: string;
  sessionId: string;
  role: string;
  content: string;
  createdAt: number;
}

export function createMemoryStore(db: DB) {
  const insert = db.prepare(
    "INSERT INTO memory_store (id, session_id, role, content, embedding, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  );
  const getBySession = db.prepare(
    "SELECT id, session_id, role, content, embedding, created_at FROM memory_store WHERE session_id = ? ORDER BY created_at DESC"
  );
  const purge = db.prepare(
    "DELETE FROM memory_store WHERE session_id IN (SELECT DISTINCT session_id FROM memory_store WHERE created_at < ?)"
  );

  return {
    addTurn(sessionId: string, role: string, content: string, embedding: number[] | null): void {
      const embBlob = embedding ? Buffer.from(new Float32Array(embedding).buffer) : null;
      insert.run(randomUUID(), sessionId, role, content, embBlob, Math.floor(Date.now() / 1000));
    },

    recall(sessionId: string, topK: number): Turn[] {
      const rows = getBySession.all(sessionId) as Array<{
        id: string;
        session_id: string;
        role: string;
        content: string;
        created_at: number;
      }>;
      return rows.slice(0, topK * 2).map((r) => ({
        id: r.id,
        sessionId: r.session_id,
        role: r.role,
        content: r.content,
        createdAt: r.created_at,
      }));
    },

    purgeOlderThan(cutoff: number): number {
      return purge.run(cutoff).changes;
    },
  };
}
