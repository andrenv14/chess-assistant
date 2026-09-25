import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import TypeAdapter, ValidationError

from app.classification import InvalidPositionTransitionError
from app.config import settings
from app.engine import EngineUnavailableError, StockfishManager
from app.evidence import build_analysis_evidence
from app.explanations import (
    ExplanationProviderError,
    ExplanationService,
    ExplanationValidationError,
    OpenAIExplanationProvider,
)
from app.features import extract_position_features
from app.hub import EventHub
from app.logging_config import configure_logging, get_logger
from app.maia import MaiaManager, MaiaUnavailableError
from app.models import (
    AnalysisEvidenceResponse,
    AnalysisHistorySummary,
    AnalyzeRequest,
    AnalyzeResponse,
    BrowserEvent,
    ClassifyMoveRequest,
    EngineRole,
    EngineSettings,
    ExplainedAnalysisResponse,
    HistoryClearResponse,
    HumanPredictionRequest,
    HumanPredictionResponse,
    MoveClassificationResponse,
    OpeningInfo,
    PositionFeaturesRequest,
    PositionFeaturesResponse,
    SettingsResponse,
)
from app.openings import opening_book
from app.storage import LocalStore, StorageError

configure_logging()
logger = get_logger(__name__)
manager = StockfishManager(settings.stockfish_path)
maia_manager = MaiaManager(settings.maia3_path)
explanation_service = (
    ExplanationService(
        OpenAIExplanationProvider(
            api_key=settings.llm_api_key,
            model=settings.llm_model,
            base_url=settings.llm_api_base_url,
            max_output_tokens=settings.llm_max_output_tokens,
        )
    )
    if settings.llm_api_key and settings.llm_model
    else None
)
hub = EventHub()
browser_event_adapter = TypeAdapter(BrowserEvent)
store = LocalStore(
    settings.chess_assistant_data_dir / "chess-assistant.sqlite3",
    history_limit=settings.history_limit,
)


@asynccontextmanager
async def lifespan(_: FastAPI):
    try:
        store.initialize()
        for role, profile in store.load_profiles().items():
            manager.update_profile(role, profile)
        logger.info(
            "local_storage_ready",
            extra={"event_data": {"history_limit": store.history_limit}},
        )
    except StorageError:
        logger.exception("local_storage_initialization_failed")
    yield
    await asyncio.gather(manager.close(), maia_manager.close())


app = FastAPI(title="Chess Assistant API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    # "null" is the Origin used by the packaged Electron file:// renderer.
    allow_origins=["null", "http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
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
        "llm_configured": explanation_service is not None,
        "llm_model": settings.llm_model,
        "storage_available": store.available,
        "history_count": _history_count(),
    }


@app.get("/api/settings", response_model=SettingsResponse)
async def get_settings() -> SettingsResponse:
    return SettingsResponse(
        stockfish_path=str(manager.stockfish_path) if manager.stockfish_path else None,
        maia3_available=maia_manager.available,
        maia3_path=(
            str(maia_manager.executable_path) if maia_manager.executable_path else None
        ),
        llm_configured=explanation_service is not None,
        llm_model=settings.llm_model,
        profiles=manager.profiles,
    )


@app.put("/api/settings/{role}", response_model=EngineSettings)
async def update_settings(role: EngineRole, profile: EngineSettings) -> EngineSettings:
    updated = manager.update_profile(role, profile)
    try:
        store.save_profile(role, updated)
    except StorageError:
        logger.exception(
            "engine_profile_persistence_failed",
            extra={"event_data": {"role": role}},
        )
    return updated


@app.post("/api/analyze", response_model=AnalyzeResponse)
async def analyze(request: AnalyzeRequest) -> AnalyzeResponse:
    try:
        response = await manager.analyze(request)
        return response.model_copy(update={"opening": opening_book.lookup_fen(request.fen)})
    except EngineUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Stockfish analysis failed: {exc}") from exc


@app.post("/api/evidence", response_model=AnalysisEvidenceResponse)
async def analyze_evidence(request: AnalyzeRequest) -> AnalysisEvidenceResponse:
    try:
        response = await manager.analyze(request)
        response = response.model_copy(update={"opening": opening_book.lookup_fen(request.fen)})
        evidence = build_analysis_evidence(response)
        _save_history(evidence)
        return evidence
    except EngineUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("analysis_evidence_failed")
        raise HTTPException(status_code=500, detail=f"Evidence analysis failed: {exc}") from exc


@app.post("/api/explain", response_model=ExplainedAnalysisResponse)
async def explain_position(request: AnalyzeRequest) -> ExplainedAnalysisResponse:
    if explanation_service is None:
        raise HTTPException(
            status_code=503,
            detail="LLM is not configured. Set LLM_API_KEY and LLM_MODEL.",
        )
    try:
        analysis = await manager.analyze(request)
        analysis = analysis.model_copy(update={"opening": opening_book.lookup_fen(request.fen)})
        evidence = build_analysis_evidence(analysis)
        _save_history(evidence)
        explanation = await explanation_service.explain(evidence)
        return ExplainedAnalysisResponse(evidence=evidence, explanation=explanation)
    except EngineUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except (ExplanationProviderError, ExplanationValidationError) as exc:
        logger.warning(
            "explanation_rejected",
            extra={"event_data": {"reason": type(exc).__name__}},
        )
        raise HTTPException(
            status_code=502,
            detail="LLM explanation was unavailable or invalid",
        ) from exc
    except Exception as exc:
        logger.exception("explanation_failed")
        raise HTTPException(status_code=500, detail="Explanation generation failed") from exc


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


@app.post("/api/features", response_model=PositionFeaturesResponse)
async def position_features(request: PositionFeaturesRequest) -> PositionFeaturesResponse:
    return extract_position_features(request.fen)


@app.get("/api/history", response_model=list[AnalysisHistorySummary])
async def analysis_history(
    limit: int = Query(default=20, ge=1, le=100),
) -> list[AnalysisHistorySummary]:
    try:
        return store.list_history(limit=limit)
    except StorageError as exc:
        raise HTTPException(status_code=503, detail="Local history is unavailable") from exc


@app.get("/api/history/{history_id}", response_model=AnalysisEvidenceResponse)
async def analysis_history_item(history_id: int) -> AnalysisEvidenceResponse:
    try:
        evidence = store.get_history(history_id)
    except StorageError as exc:
        raise HTTPException(status_code=503, detail="Local history is unavailable") from exc
    if evidence is None:
        raise HTTPException(status_code=404, detail="History item not found")
    return evidence


@app.delete("/api/history", response_model=HistoryClearResponse)
async def clear_analysis_history() -> HistoryClearResponse:
    try:
        return HistoryClearResponse(deleted=store.clear_history())
    except StorageError as exc:
        raise HTTPException(status_code=503, detail="Local history is unavailable") from exc


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


def _save_history(evidence: AnalysisEvidenceResponse) -> None:
    try:
        store.save_analysis(evidence)
    except StorageError:
        logger.exception("analysis_history_persistence_failed")


def _history_count() -> int | None:
    try:
        return store.history_count()
    except StorageError:
        return None
