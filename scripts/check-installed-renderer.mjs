const port = Number(process.argv[2] ?? "9242");

async function waitFor(predicate, label, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await predicate();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

const target = await waitFor(async () => {
  try {
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    return targets.find(({ type, url }) => type === "page" && url.startsWith("file:"));
  } catch {
    return null;
  }
}, "installed renderer target");

const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});
const bodyText = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("Renderer evaluation timed out")), 5_000);
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (message.id !== 1) return;
    clearTimeout(timer);
    resolve(message.result?.result?.value ?? "");
  });
  socket.send(JSON.stringify({
    id: 1,
    method: "Runtime.evaluate",
    params: { expression: "document.body.innerText", returnByValue: true },
  }));
});
socket.close();

if (!bodyText.includes("Chess Assistant") || !bodyText.includes("Analisar agora")) {
  throw new Error("Installed renderer did not mount the expected React interface.");
}
console.log("Installed renderer OK: React interface mounted from file:// assets.");
