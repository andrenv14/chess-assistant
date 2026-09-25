import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const HEALTH_URL = "http://127.0.0.1:8765/health";

export interface BackendController {
  owned: boolean;
  stop: () => Promise<void>;
}

type SpawnProcess = (
  command: string,
  args: string[],
  options: Parameters<typeof spawn>[2],
) => ChildProcess;

interface BackendStartOptions {
  backendDirectory: string;
  pythonPath?: string;
  healthUrl?: string;
  timeoutMs?: number;
  pollIntervalMs?: number;
  checkReady?: () => Promise<boolean>;
  spawnProcess?: SpawnProcess;
  wait?: (milliseconds: number) => Promise<void>;
}

interface BackendHealth {
  status?: unknown;
  service?: unknown;
}

/** Verify that the loopback service is this application, not merely an HTTP server. */
export async function isBackendReady(
  healthUrl = HEALTH_URL,
  fetchImplementation: typeof fetch = fetch,
): Promise<boolean> {
  try {
    const response = await fetchImplementation(healthUrl, {
      signal: AbortSignal.timeout(1_000),
    });
    if (!response.ok) return false;
    const payload = (await response.json()) as BackendHealth;
    return payload.status === "ok" && payload.service === "chess-assistant-backend";
  } catch {
    return false;
  }
}

export function resolvePythonPath(backendDirectory: string, override?: string): string {
  if (override) return override;
  const virtualEnvironmentPython =
    process.platform === "win32"
      ? path.join(backendDirectory, ".venv", "Scripts", "python.exe")
      : path.join(backendDirectory, ".venv", "bin", "python");
  return existsSync(virtualEnvironmentPython) ? virtualEnvironmentPython : "python";
}

/** Start the local backend only when a verified instance is not already ready. */
export async function ensureBackend(options: BackendStartOptions): Promise<BackendController> {
  const healthUrl = options.healthUrl ?? HEALTH_URL;
  const checkReady = options.checkReady ?? (() => isBackendReady(healthUrl));
  if (await checkReady()) return externalBackendController();

  const command = resolvePythonPath(options.backendDirectory, options.pythonPath);
  const spawnProcess = options.spawnProcess ?? spawn;
  const child = spawnProcess(
    command,
    ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8765"],
    {
      cwd: options.backendDirectory,
      env: process.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );

  pipeBackendLogs(child);
  let exitDescription: string | null = null;
  let startFailure: string | null = null;
  child.once("exit", (code, signal) => {
    exitDescription = signal ? `signal ${signal}` : `code ${code ?? "unknown"}`;
  });
  child.once("error", (error) => {
    startFailure = error.message;
  });

  const timeoutMs = options.timeoutMs ?? 15_000;
  const pollIntervalMs = options.pollIntervalMs ?? 150;
  const wait =
    options.wait ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (await checkReady()) return ownedBackendController(child);
    if (startFailure) {
      throw new Error(`Não foi possível executar o Python do backend (${startFailure}).`);
    }
    if (exitDescription) {
      throw new Error(`O backend local encerrou antes de iniciar (${exitDescription}).`);
    }
    await wait(pollIntervalMs);
  }

  child.kill();
  throw new Error(`O backend local não respondeu em ${Math.ceil(timeoutMs / 1_000)} segundos.`);
}

function externalBackendController(): BackendController {
  return { owned: false, stop: async () => undefined };
}

function ownedBackendController(child: ChildProcess): BackendController {
  return {
    owned: true,
    stop: async () => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      const exited = new Promise<boolean>((resolve) => child.once("exit", () => resolve(true)));
      child.kill();
      const stopped = await Promise.race([
        exited,
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 2_000)),
      ]);
      if (!stopped && child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
      }
    },
  };
}

function pipeBackendLogs(child: ChildProcess): void {
  child.stdout?.on("data", (chunk: Buffer) => process.stdout.write(chunk));
  child.stderr?.on("data", (chunk: Buffer) => process.stderr.write(chunk));
}
