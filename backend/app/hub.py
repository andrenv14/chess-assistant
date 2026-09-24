import asyncio

from fastapi import WebSocket


class EventHub:
    def __init__(self) -> None:
        self._desktop_clients: set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def connect_desktop(self, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._desktop_clients.add(websocket)

    async def disconnect_desktop(self, websocket: WebSocket) -> None:
        async with self._lock:
            self._desktop_clients.discard(websocket)

    async def broadcast(self, message: dict[str, object]) -> None:
        async with self._lock:
            clients = list(self._desktop_clients)
        disconnected: list[WebSocket] = []
        for client in clients:
            try:
                await client.send_json(message)
            except Exception:  # The socket may disappear between receive loops.
                disconnected.append(client)
        if disconnected:
            async with self._lock:
                for client in disconnected:
                    self._desktop_clients.discard(client)
