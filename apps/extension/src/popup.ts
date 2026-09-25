import type { BrowserEvent } from "@chess-assistant/contracts";

import { isFen } from "./fen";

const status = document.querySelector<HTMLDivElement>("#status")!;
const fen = document.querySelector<HTMLTextAreaElement>("#fen")!;
const send = document.querySelector<HTMLButtonElement>("#send")!;

void chrome.storage.local.get("connected").then(({ connected }) => {
  status.textContent = connected ? "app local conectado" : "app local desconectado";
});

send.addEventListener("click", () => {
  const value = fen.value.trim();
  if (!isFen(value)) {
    status.textContent = "FEN inválida";
    return;
  }
  const message: BrowserEvent = {
    type: "position",
    fen: value,
    source: "manual",
    at: new Date().toISOString(),
  };
  void chrome.runtime
    .sendMessage(message)
    .then((response: { accepted?: boolean } | undefined) => {
      status.textContent = response?.accepted ? "posição enfileirada" : "posição rejeitada";
    })
    .catch(() => {
      status.textContent = "falha ao enviar posição";
    });
});
