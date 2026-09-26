import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const DEFAULT_BACKEND_PORT = 8765;
const HEALTH_URL = `http://127.0.0.1:${DEFAULT_BACKEND_PORT}/health`;

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
  port?: number;
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

export interface BackendInvocation {
  command: string;
  args: string[];
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

/** Select the self-contained packaged backend when present, with Python as a dev fallback. */
export function resolveBackendInvocation(
  backendDirectory: string,
  pythonOverride?: string,
  fileExists: (path: string) => boolean = existsSync,
  port = DEFAULT_BACKEND_PORT,
): BackendInvocation {
  if (!pythonOverride) {
    const portableName = process.platform === "win32"
      ? "chess-assistant-backend.exe"
      : "chess-assistant-backend";
    const portableBackend = path.join(backendDirectory, portableName);
    if (fileExists(portableBackend)) {
      return { command: portableBackend, args: [] };
    }
  }

  return {
    command: resolvePythonPath(backendDirectory, pythonOverride),
    args: ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", String(port)],
  };
}

/** Start the local backend only when a verified instance is not already ready. */
export async function ensureBackend(options: BackendStartOptions): Promise<BackendController> {
  const healthUrl = options.healthUrl ?? HEALTH_URL;
  const checkReady = options.checkReady ?? (() => isBackendReady(healthUrl));
  if (await checkReady()) return externalBackendController();

  const invocation = resolveBackendInvocation(
    options.backendDirectory,
    options.pythonPath,
    existsSync,
    options.port,
  );
  const spawnProcess = options.spawnProcess ?? spawn;
  const child = spawnProcess(
    invocation.command,
    invocation.args,
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
