import type {
  AnalysisEvidenceResponse,
  AnalyzeRequest,
  AnalyzeResponse,
  ClassifyMoveRequest,
  EngineRole,
  EngineSettings,
  EngineSettingsResponse,
  ExplainedAnalysisResponse,
  HumanPredictionRequest,
  HumanPredictionResponse,
  MoveClassificationResponse,
} from "@chess-assistant/contracts";

export const API_BASE = "http://127.0.0.1:8765";
export const WS_BASE = "ws://127.0.0.1:8765";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, init);
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(payload?.detail ?? `Request failed (${response.status})`);
  }
  return (await response.json()) as T;
}

export function getSettings(): Promise<EngineSettingsResponse> {
  return request("/api/settings");
}

export function updateSettings(
  role: EngineRole,
  settings: EngineSettings,
): Promise<EngineSettings> {
  return request(`/api/settings/${role}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
}

export function analyzePosition(payload: AnalyzeRequest): Promise<AnalyzeResponse> {
  return request("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function analyzeEvidence(payload: AnalyzeRequest): Promise<AnalysisEvidenceResponse> {
  return request("/api/evidence", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function explainPosition(payload: AnalyzeRequest): Promise<ExplainedAnalysisResponse> {
  return request("/api/explain", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function classifyMove(
  payload: ClassifyMoveRequest,
): Promise<MoveClassificationResponse> {
  return request("/api/classify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function predictHumanMoves(
  payload: HumanPredictionRequest,
): Promise<HumanPredictionResponse> {
  return request("/api/human-prediction", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
