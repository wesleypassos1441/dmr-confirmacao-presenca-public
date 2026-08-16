import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export function writeRuntimeHealthMarker(path: string, status = "healthy") {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({
    pid: process.pid,
    status,
    checked_at: new Date().toISOString(),
  }), "utf8");
}
