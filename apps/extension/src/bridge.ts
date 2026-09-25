import type { BrowserEvent, LogLevel } from "@chess-assistant/contracts";

import { isFen } from "./fen";

const CONNECTING = 0;
const OPEN = 1;

type SocketFactory = (url: string) => WebSocket;
type ConnectionListener = (connected: boolean) => void;
type BridgeLogger = (level: LogLevel, event: string) => void;

export interface PositionBridgeOptions {
  url: string;
  reconnectDelayMs?: number;
  createSocket?: SocketFactory;
  onConnectionChange?: ConnectionListener;
  log?: BridgeLogger;
}

/** Keep the newest position queued until the backend acknowledges it. */
export class PositionBridge {
  private socket: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pending: BrowserEvent | null = null;
  private inFlightAt: string | null = null;
  private disposed = false;

  constructor(private readonly options: PositionBridgeOptions) {}

  start(): void {
    this.connect();
  }

  send(event: BrowserEvent): void {
    this.pending = event;
    this.inFlightAt = null;
    const connection = this.connect();
    this.flush(connection);
  }

  dispose(): void {
    this.disposed = true;
    if (this.reconnectTimer !== null) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.socket?.close();
    this.socket = null;
  }

  private connect(): WebSocket {
    if (this.socket && [CONNECTING, OPEN].includes(this.socket.readyState)) return this.socket;

    const createSocket = this.options.createSocket ?? ((url) => new WebSocket(url));
    const connection = createSocket(this.options.url);
    this.socket = connection;
    this.options.onConnectionChange?.(false);

    connection.onopen = () => {
      if (this.socket !== connection) return;
      this.options.log?.("info", "backend_socket_connected");
      this.options.onConnectionChange?.(true);
      this.flush(connection);
    };
    connection.onmessage = (message) => this.acceptAcknowledgement(message.data);
    connection.onclose = () => {
      if (this.socket !== connection) return;
      this.options.log?.("warn", "backend_socket_disconnected");
      this.options.onConnectionChange?.(false);
      this.socket = null;
      this.inFlightAt = null;
      this.scheduleReconnect();
    };
    connection.onerror = () => {
      this.options.log?.("error", "backend_socket_error");
      connection.close();
    };
    return connection;
  }

  private flush(connection: WebSocket): void {
    if (
      connection.readyState !== OPEN ||
      this.pending === null ||
      this.inFlightAt === this.pending.at
    ) {
      return;
    }
    connection.send(JSON.stringify(this.pending));
    this.inFlightAt = this.pending.at;
  }

  private acceptAcknowledgement(raw: unknown): void {
    if (typeof raw !== "string" || this.pending === null) return;
    try {
      const message = JSON.parse(raw) as { type?: unknown; at?: unknown };
      if (message.type === "ack" && message.at === this.pending.at) {
        this.pending = null;
        this.inFlightAt = null;
      }
    } catch {
      this.options.log?.("warn", "backend_socket_message_rejected");
    }
  }

  private scheduleReconnect(): void {
    if (this.disposed) return;
    if (this.reconnectTimer !== null) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.options.reconnectDelayMs ?? 2_000);
  }
}

export function isBrowserEvent(value: unknown): value is BrowserEvent {
  if (typeof value !== "object" || value === null) return false;
  const event = value as Partial<BrowserEvent>;
  return (
    event.type === "position" &&
    typeof event.fen === "string" &&
    isFen(event.fen) &&
    [
      "lichess-analysis",
      "lichess-live",
      "chesscom-analysis",
      "chesscom-live",
      "manual",
    ].includes(event.source ?? "") &&
    typeof event.at === "string" &&
    !Number.isNaN(Date.parse(event.at))
  );
}
