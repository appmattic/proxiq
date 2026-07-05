import type { Command } from "commander";

export function registerCache(program: Command): void {
  const cacheCmd = program
    .command("cache")
    .description("Manage the Proxiq cache");

  cacheCmd
    .command("clear")
    .description("Clear all cache entries")
    .option("--port <port>", "Proxy port", "3099")
    .action(async (opts: { port: string }) => {
      const port = Number.parseInt(opts.port, 10);
      try {
        const res = await fetch(`http://127.0.0.1:${port}/proxiq/cache/clear`, {
          method: "POST",
        });
        if (res.ok) {
          const data = (await res.json()) as { cleared: number };
          console.log(`Cleared ${data.cleared} cache entries.`);
        } else {
          console.error("Cache clear failed:", res.status);
        }
      } catch {
        console.error("Could not reach Proxiq. Is it running?");
        process.exit(1);
      }
    });

  cacheCmd
    .command("inspect")
    .description("Inspect a cache entry by hash")
    .requiredOption("--hash <sha>", "SHA-256 hash of the cache entry")
    .option("--port <port>", "Proxy port", "3099")
    .action(async (opts: { hash: string; port: string }) => {
      const port = Number.parseInt(opts.port, 10);
      try {
        const res = await fetch(
          `http://127.0.0.1:${port}/proxiq/cache/${opts.hash}`
        );
        if (res.ok) {
          const data = await res.json();
          console.log(JSON.stringify(data, null, 2));
        } else if (res.status === 404) {
          console.log("Cache entry not found.");
        } else {
          console.error("Error:", res.status);
        }
      } catch {
        console.error("Could not reach Proxiq. Is it running?");
        process.exit(1);
      }
    });
}
