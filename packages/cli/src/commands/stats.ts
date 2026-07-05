import type { Command } from "commander";

export function registerStats(program: Command): void {
  program
    .command("stats")
    .description("Show request statistics")
    .option("--port <port>", "Proxy port", "3099")
    .option("--json", "Output as JSON")
    .action(async (opts: { port: string; json?: boolean }) => {
      const port = Number.parseInt(opts.port, 10);
      try {
        const res = await fetch(`http://127.0.0.1:${port}/proxiq/metrics`);
        if (!res.ok) {
          console.error(
            "Could not reach Proxiq. Is it running? Try: proxiq start"
          );
          process.exit(1);
        }

        const stats = (await res.json()) as {
          totalRequests: number;
          cacheHits: number;
          cacheMisses: number;
          hitRate: number;
          totalInputTokens: number;
          totalOutputTokens: number;
          avgDurationMs: number;
        };

        if (opts.json) {
          console.log(JSON.stringify(stats, null, 2));
          return;
        }

        const hitPct = (stats.hitRate * 100).toFixed(1);
        console.log("\nProxiq Statistics");
        console.log("─────────────────────────────────────");
        console.log(`Total requests    ${stats.totalRequests}`);
        console.log(`Cache hits        ${stats.cacheHits} (${hitPct}%)`);
        console.log(`Cache misses      ${stats.cacheMisses}`);
        console.log(
          `Input tokens      ${stats.totalInputTokens.toLocaleString()}`
        );
        console.log(
          `Output tokens     ${stats.totalOutputTokens.toLocaleString()}`
        );
        console.log(`Avg latency       ${stats.avgDurationMs}ms`);
        console.log("─────────────────────────────────────\n");
      } catch {
        console.error(
          "Could not reach Proxiq. Is it running? Try: proxiq start"
        );
        process.exit(1);
      }
    });
}
