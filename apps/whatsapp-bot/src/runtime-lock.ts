import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

type RuntimeLockOptions = {
  pid?: number;
  isProcessRunning?: (pid: number) => boolean;
};

export function acquireRuntimeLock(lockPath: string, options: RuntimeLockOptions = {}) {
  const pid = options.pid ?? process.pid;
  const isProcessRunning = options.isProcessRunning ?? processIsRunning;
  mkdirSync(path.dirname(lockPath), { recursive: true });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const descriptor = openSync(lockPath, "wx");
      writeFileSync(descriptor, String(pid), "utf8");
      closeSync(descriptor);
      return () => releaseRuntimeLock(lockPath, pid);
    } catch (error) {
      if (!isAlreadyExistsError(error)) throw error;

      const existingPid = readLockPid(lockPath);
      if (existingPid && isProcessRunning(existingPid)) {
        throw new Error(`Bot WhatsApp ja esta em execucao no processo ${existingPid}.`);
      }

      unlinkSync(lockPath);
    }
  }

  throw new Error("Nao foi possivel reservar a execucao exclusiva do bot.");
}

export function markBrowserProfileClean(preferencesPath: string) {
  if (!existsSync(preferencesPath)) return;

  try {
    const preferences = JSON.parse(readFileSync(preferencesPath, "utf8"));
    preferences.profile = preferences.profile ?? {};
    preferences.profile.exit_type = "Normal";
    preferences.profile.exited_cleanly = true;
    writeFileSync(preferencesPath, JSON.stringify(preferences), "utf8");
  } catch {
    // Um arquivo incompleto sera reconstruido pelo navegador na inicializacao.
  }
}

function releaseRuntimeLock(lockPath: string, pid: number) {
  try {
    if (readLockPid(lockPath) === pid) unlinkSync(lockPath);
  } catch {
    // O lock pode ter sido removido durante o encerramento do processo.
  }
}

function readLockPid(lockPath: string) {
  try {
    const pid = Number(readFileSync(lockPath, "utf8").trim());
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function processIsRunning(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

function isAlreadyExistsError(error: unknown) {
  return (error as NodeJS.ErrnoException)?.code === "EEXIST";
}
