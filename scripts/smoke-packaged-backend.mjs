import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const backendExecutable = path.join(
  repositoryRoot,
  "backend",
  "dist",
  "chess-assistant-backend",
  "chess-assistant-backend.exe",
);
const temporaryData = path.join(
  repositoryRoot,
  "backend",
  `.test-packaged-smoke-${process.pid}`,
);
const healthUrl = "http://127.0.0.1:8765/health";

await assertPortIsFree();

const {
  LLM_API_KEY: _ignoredApiKey,
  STOCKFISH_PATH: _ignoredStockfishOverride,
  CHESS_ASSISTANT_PYTHON: _ignoredPythonOverride,
  ...safeEnvironment
} = process.env;
const child = spawn(backendExecutable, [], {
  cwd: path.dirname(backendExecutable),
  env: {
    ...safeEnvironment,
    CHESS_ASSISTANT_DATA_DIR: temporaryData,
  },
  shell: false,
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});

let recentOutput = "";
let startFailure = null;
child.once("error", (error) => {
  startFailure = error;
});
for (const stream of [child.stdout, child.stderr]) {
  stream.on("data", (chunk) => {
    recentOutput = `${recentOutput}${chunk}`.slice(-8_000);
  });
}

try {
  const health = await waitForHealth();
  assert(health.service === "chess-assistant-backend", "unexpected backend identity");
  assert(health.stockfish_available === true, "packaged Stockfish is unavailable");
  assert(health.opening_positions === 3815, "opening catalogue was not packaged");

  const response = await fetch("http://127.0.0.1:8765/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      role: "user",
    }),
  });
  assert(response.ok, `analysis failed with HTTP ${response.status}`);
  const analysis = await response.json();
  assert(Array.isArray(analysis.candidates), "analysis candidates are missing");
  assert(analysis.candidates.length === 3, "packaged backend did not return MultiPV 3");

  console.log(
    `Packaged backend OK: ${health.opening_positions} openings, ` +
      `${analysis.candidates.length} candidates, first move ${analysis.candidates[0].san}.`,
  );
} catch (error) {
  if (recentOutput) process.stderr.write(recentOutput);
  throw error;
} finally {
  child.kill();
  await waitForExit(child, 5_000);
  await rm(temporaryData, { recursive: true, force: true });
}

async function assertPortIsFree() {
  try {
    await fetch(healthUrl, { signal: AbortSignal.timeout(500) });
  } catch {
    return;
  }
  throw new Error("port 8765 is already in use; stop the local backend before this smoke test");
}

async function waitForHealth() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (startFailure) {
      throw new Error(`could not start packaged backend: ${startFailure.message}`);
    }
    if (child.exitCode !== null) {
      throw new Error(`packaged backend exited early with code ${child.exitCode}`);
    }
    try {
      const response = await fetch(healthUrl, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) return response.json();
    } catch {
      // Expected while the embedded Python runtime initializes.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("packaged backend did not become healthy within 20 seconds");
}

async function waitForExit(processHandle, timeoutMs) {
  if (processHandle.exitCode !== null) return;
  await Promise.race([
    new Promise((resolve) => processHandle.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
  if (processHandle.exitCode === null) child.kill("SIGKILL");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
