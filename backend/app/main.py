from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import TypeAdapter, ValidationError

from app.config import settings
from app.engine import EngineUnavailableError, StockfishManager
from app.hub import EventHub
from app.models import (
    AnalyzeRequest,
    AnalyzeResponse,
    BrowserEvent,
    EngineRole,
    EngineSettings,
    SettingsResponse,
)

manager = StockfishManager(settings.stockfish_path)
hub = EventHub()
browser_event_adapter = TypeAdapter(BrowserEvent)


@asynccontextmanager
async def lifespan(_: FastAPI):
    yield
    await manager.close()


app = FastAPI(title="Chess Assistant API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    # "null" is the Origin used by the packaged Electron file:// renderer.
    allow_origins=["null", "http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT"],
    allow_headers=["Content-Type"],
)


@app.get("/health")
async def health() -> dict[str, object]:
    return {
        "status": "ok",
        "stockfish_available": manager.available,
        "stockfish_path": str(manager.stockfish_path) if manager.stockfish_path else None,
    }


@app.get("/api/settings", response_model=SettingsResponse)
async def get_settings() -> SettingsResponse:
    return SettingsResponse(
        stockfish_path=str(manager.stockfish_path) if manager.stockfish_path else None,
        profiles=manager.profiles,
    )


@app.put("/api/settings/{role}", response_model=EngineSettings)
async def update_settings(role: EngineRole, profile: EngineSettings) -> EngineSettings:
    return manager.update_profile(role, profile)


@app.post("/api/analyze", response_model=AnalyzeResponse)
async def analyze(request: AnalyzeRequest) -> AnalyzeResponse:
    try:
        return await manager.analyze(request)
    except EngineUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Stockfish analysis failed: {exc}") from exc


@app.websocket("/ws/extension")
async def extension_socket(websocket: WebSocket) -> None:
    await websocket.accept()
    try:
        while True:
            raw = await websocket.receive_json()
            try:
                event = browser_event_adapter.validate_python(raw)
            except ValidationError as exc:
                await websocket.send_json({"type": "error", "detail": str(exc)})
                continue
            await hub.broadcast(event.model_dump(mode="json"))
            await websocket.send_json({"type": "ack", "at": event.at})
    except WebSocketDisconnect:
        return


@app.websocket("/ws/desktop")
async def desktop_socket(websocket: WebSocket) -> None:
    await hub.connect_desktop(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        await hub.disconnect_desktop(websocket)
