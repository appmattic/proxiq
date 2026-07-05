import type { Command } from "commander";
import { readPidFile } from "../utils/pid.js";

export function registerStatus(program: Command): void {
  program
    .command("status")
    .description("Show Proxiq gateway status")
    .option("--port <port>", "Port to check", "3099")
    .action(async (opts: { port: string }) => {
      const pid = readPidFile();
      const port = Number.parseInt(opts.port, 10);

      if (!pid) {
        console.log("Status: stopped (no PID file)");
        return;
      }

      try {
        const res = await fetch(`http://127.0.0.1:${port}/proxiq/health`);
        if (res.ok) {
          const data = (await res.json()) as {
            status: string;
            version: string;
          };
          console.log(`Status:  running (PID ${pid})`);
          console.log(`Version: ${data.version}`);
          console.log(`Health:  ${data.status}`);
          console.log(`URL:     http://127.0.0.1:${port}`);
        } else {
          console.log(
            `Status:  running (PID ${pid}) but health check failed (HTTP ${res.status})`
          );
        }
      } catch {
        console.log(
          `Status:  PID ${pid} exists but proxy not responding on port ${port}`
        );
      }
    });
}
