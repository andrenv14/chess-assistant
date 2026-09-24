import { logEvent, type BrowserEvent } from "@chess-assistant/contracts";

const SOCKET_URL = "ws://127.0.0.1:8765/ws/extension";
let socket: WebSocket | null = null;
let reconnectTimer: number | null = null;

function connect(): WebSocket {
  if (socket && socket.readyState <= WebSocket.OPEN) return socket;

  socket = new WebSocket(SOCKET_URL);
  socket.onopen = () => {
    logEvent("info", "backend_socket_connected", { component: "extension" });
    void chrome.storage.local.set({ connected: true });
  };
  socket.onclose = () => {
    logEvent("warn", "backend_socket_disconnected", { component: "extension" });
    void chrome.storage.local.set({ connected: false });
    socket = null;
    if (reconnectTimer !== null) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connect, 2000) as unknown as number;
  };
  socket.onerror = () => {
    logEvent("error", "backend_socket_error", { component: "extension" });
    socket?.close();
  };
  return socket;
}

function send(event: BrowserEvent): void {
  const connection = connect();
  if (connection.readyState === WebSocket.OPEN) {
    connection.send(JSON.stringify(event));
    return;
  }
  connection.addEventListener("open", () => connection.send(JSON.stringify(event)), { once: true });
}

chrome.runtime.onMessage.addListener((message: BrowserEvent, _, reply) => {
  send(message);
  reply({ accepted: true });
  return false;
});

connect();
