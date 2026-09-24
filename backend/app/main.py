import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import TypeAdapter, ValidationError

from app.classification import InvalidPositionTransitionError
from app.config import settings
from app.engine import EngineUnavailableError, StockfishManager
from app.hub import EventHub
from app.logging_config import configure_logging, get_logger
from app.maia import MaiaManager, MaiaUnavailableError
from app.models import (
    AnalyzeRequest,
    AnalyzeResponse,
    BrowserEvent,
    ClassifyMoveRequest,
    EngineRole,
    EngineSettings,
    HumanPredictionRequest,
    HumanPredictionResponse,
    MoveClassificationResponse,
    OpeningInfo,
    SettingsResponse,
)
from app.openings import opening_book

configure_logging()
logger = get_logger(__name__)
manager = StockfishManager(settings.stockfish_path)
maia_manager = MaiaManager(settings.maia3_path)
hub = EventHub()
browser_event_adapter = TypeAdapter(BrowserEvent)


@asynccontextmanager
async def lifespan(_: FastAPI):
    yield
    await asyncio.gather(manager.close(), maia_manager.close())


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
        "opening_positions": opening_book.size,
        "maia3_available": maia_manager.available,
        "maia3_path": str(maia_manager.executable_path) if maia_manager.executable_path else None,
    }


@app.get("/api/settings", response_model=SettingsResponse)
async def get_settings() -> SettingsResponse:
    return SettingsResponse(
        stockfish_path=str(manager.stockfish_path) if manager.stockfish_path else None,
        maia3_available=maia_manager.available,
        maia3_path=(
            str(maia_manager.executable_path) if maia_manager.executable_path else None
        ),
        profiles=manager.profiles,
    )


@app.put("/api/settings/{role}", response_model=EngineSettings)
async def update_settings(role: EngineRole, profile: EngineSettings) -> EngineSettings:
    return manager.update_profile(role, profile)


@app.post("/api/analyze", response_model=AnalyzeResponse)
async def analyze(request: AnalyzeRequest) -> AnalyzeResponse:
    try:
        response = await manager.analyze(request)
        return response.model_copy(update={"opening": opening_book.lookup_fen(request.fen)})
    except EngineUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Stockfish analysis failed: {exc}") from exc


@app.post("/api/classify", response_model=MoveClassificationResponse)
async def classify_move(request: ClassifyMoveRequest) -> MoveClassificationResponse:
    try:
        opening = opening_book.lookup_fen(request.after_fen)
        response = await manager.classify_move(request, is_book=opening is not None)
        return response.model_copy(update={"opening": opening})
    except InvalidPositionTransitionError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except EngineUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("move_classification_failed")
        raise HTTPException(status_code=500, detail=f"Move classification failed: {exc}") from exc


@app.get("/api/opening", response_model=OpeningInfo | None)
async def identify_opening(fen: str) -> OpeningInfo | None:
    try:
        return opening_book.lookup_fen(fen)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="invalid FEN") from exc


@app.post("/api/human-prediction", response_model=HumanPredictionResponse)
async def human_prediction(request: HumanPredictionRequest) -> HumanPredictionResponse:
    try:
        return await maia_manager.predict(request)
    except MaiaUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("human_prediction_failed")
        raise HTTPException(status_code=500, detail=f"Maia-3 prediction failed: {exc}") from exc


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
