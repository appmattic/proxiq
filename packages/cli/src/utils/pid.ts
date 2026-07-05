import { writeFileSync, readFileSync, unlinkSync, existsSync } from "node:fs";

const PID_FILE = "proxiq.pid";

export function writePidFile(): void {
  writeFileSync(PID_FILE, String(process.pid), "utf-8");
}

export function readPidFile(): number | null {
  if (!existsSync(PID_FILE)) return null;
  const raw = readFileSync(PID_FILE, "utf-8").trim();
  const pid = parseInt(raw, 10);
  return isNaN(pid) ? null : pid;
}

export function removePidFile(): void {
  if (existsSync(PID_FILE)) unlinkSync(PID_FILE);
}
