import type { BrowserEvent } from "@chess-assistant/contracts";

const status = document.querySelector<HTMLDivElement>("#status")!;
const fen = document.querySelector<HTMLTextAreaElement>("#fen")!;
const send = document.querySelector<HTMLButtonElement>("#send")!;

void chrome.storage.local.get("connected").then(({ connected }) => {
  status.textContent = connected ? "app local conectado" : "app local desconectado";
});

send.addEventListener("click", () => {
  const message: BrowserEvent = {
    type: "position",
    fen: fen.value.trim(),
    source: "manual",
    at: new Date().toISOString(),
  };
  void chrome.runtime.sendMessage(message).then(() => {
    status.textContent = "posição enviada";
  });
});
