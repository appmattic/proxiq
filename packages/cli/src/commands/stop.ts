import type { Command } from "commander";
import { readPidFile, removePidFile } from "../utils/pid.js";

export function registerStop(program: Command): void {
  program
    .command("stop")
    .description("Stop the running Proxiq gateway")
    .action(() => {
      const pid = readPidFile();
      if (!pid) {
        console.log("Proxiq is not running (no PID file found).");
        process.exit(0);
      }
      try {
        process.kill(pid, "SIGTERM");
        removePidFile();
        console.log(`Proxiq (PID ${pid}) stopped.`);
      } catch {
        console.error(`Failed to stop Proxiq (PID ${pid}). Process may have already exited.`);
        removePidFile();
      }
    });
}
