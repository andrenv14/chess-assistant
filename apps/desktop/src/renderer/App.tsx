import type {
  AnalyzeResponse,
  AnalysisHistorySummary,
  BrowserEvent,
  CandidateEvidence,
  EngineRole,
  EngineSettings,
  EngineSettingsResponse,
  HumanPredictionResponse,
  MoveClassificationResponse,
  PositionExplanation,
  PositionFeaturesResponse,
} from "@chess-assistant/contracts";
import { logEvent } from "@chess-assistant/contracts";
import { useEffect, useMemo, useRef, useState } from "react";

import { ChessBoard } from "./ChessBoard";
import {
  analyzeEvidence,
  classifyMove,
  clearAnalysisHistory,
  explainPosition,
  getAnalysisHistoryItem,
  getSettings,
  listAnalysisHistory,
  predictHumanMoves,
  updateSettings,
  WS_BASE,
} from "./api";
import {
  evaluationToWhitePercent,
  formatEvaluation,
  formatPlanHint,
  formatPositionThemes,
  formatProbability,
} from "./presentation";
import { buildVariationFrames, candidateGapLabel } from "./variation";

const INITIAL_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const ROLES: EngineRole[] = ["user", "opponent", "evaluator"];
const ROLE_COPY: Record<EngineRole, { label: string; description: string }> = {
  user: { label: "Seu assistente", description: "Sugere e compara seus melhores lances" },
  opponent: { label: "Defesas", description: "Calcula as respostas mais fortes do oponente" },
  evaluator: { label: "Avaliador", description: "Referência objetiva para a barra e os rótulos" },
};

function sourceLabel(source: BrowserEvent["source"]): string {
  if (source === "chesscom-analysis") return "Chess.com conectado";
  if (source === "chesscom-live") return "Chess.com ao vivo";
  if (source === "lichess-analysis") return "Lichess conectado";
  if (source === "lichess-live") return "Lichess ao vivo";
  return "Posição manual";
}

export function classificationEvidenceText(move: MoveClassificationResponse): string {
  const evidence = move.evidence;
  if (evidence.rule === "brilliant_sacrifice") {
    return "O Stockfish aprovou um sacrifício real de peça sem deixar a posição ruim.";
  }
  if (evidence.rule === "unique_best_move") {
    const alternative = evidence.second_best_move_san ?? "a segunda opção";
    const loss = evidence.second_best_expected_points_loss ?? 0;
    return `${move.san} foi a única escolha forte: ${alternative} perderia ` +
      `${(loss * 100).toFixed(1)} pontos percentuais de expectativa.`;
  }
  if (evidence.rule === "missed_forcing_opportunity") {
    return `Havia uma oportunidade forçante com ${move.best_move_san}, mas ela não foi aproveitada.`;
  }
  if (evidence.rule === "book") {
    return "A posição resultante consta no catálogo local de aberturas do Lichess.";
  }
  return evidence.played_is_engine_best
    ? "O lance coincide com a primeira escolha do avaliador Stockfish."
    : "O rótulo segue a perda de expectativa calculada pelo avaliador Stockfish.";
}

function EvalBar({ cp, mate }: { cp: number | null; mate: number | null }) {
  const whitePercent = evaluationToWhitePercent(cp, mate);

  return (
    <div className="eval" aria-label={`Avaliação ${formatEvaluation(cp, mate)}`}>
      <small className="eval__side eval__side--black">P</small>
      <div className="eval__black" style={{ height: `${100 - whitePercent}%` }} />
      <div className="eval__white" style={{ height: `${whitePercent}%` }} />
      <strong>{formatEvaluation(cp, mate)}</strong>
      <small className="eval__side eval__side--white">B</small>
    </div>
  );
}

function ProfileEditor({
  role,
  profile,
  onSave,
}: {
  role: EngineRole;
  profile: EngineSettings;
  onSave: (role: EngineRole, value: EngineSettings) => Promise<void>;
}) {
  const [draft, setDraft] = useState(profile);
  useEffect(() => setDraft(profile), [profile]);
  const copy = ROLE_COPY[role];

  return (
    <details className="profile">
      <summary className="profile__title">
        <span className="profile__identity">
          <span className={`engine-dot${draft.enabled ? " engine-dot--active" : ""}`} />
          <span>
            <b>{copy.label}</b>
            <small>{copy.description}</small>
          </span>
        </span>
        <span className="profile__summary-value">
          {draft.limit_strength ? `${draft.elo} Elo` : "Força total"}
        </span>
      </summary>
      <div className="profile__body">
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })}
          />
          <span>Motor ativo</span>
        </label>
      <label>
        <span className="field-caption">
          Força limitada <b>{draft.elo} Elo</b>
        </span>
        <input
          type="range"
          min="1320"
          max="3190"
          step="10"
          value={draft.elo}
          disabled={!draft.limit_strength}
          onChange={(event) => setDraft({ ...draft, elo: Number(event.target.value) })}
        />
      </label>
      <label>
        <span className="field-caption">
          Precisão do motor <b>{draft.skill_level}/20</b>
        </span>
        <input
          type="range"
          min="0"
          max="20"
          value={draft.skill_level}
          onChange={(event) => setDraft({ ...draft, skill_level: Number(event.target.value) })}
        />
      </label>
      <label className="toggle-row">
        <input
          type="checkbox"
          checked={draft.limit_strength}
          onChange={(event) => setDraft({ ...draft, limit_strength: event.target.checked })}
        />
        <span>Simular força humana</span>
      </label>
      <details className="profile__advanced">
        <summary>Ajustes avançados</summary>
        <div className="advanced-grid">
          <label>
            Tempo por lance (ms)
            <input
              type="number"
              min="50"
              max="60000"
              value={draft.move_time_ms ?? ""}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  move_time_ms: event.target.value ? Number(event.target.value) : null,
                })
              }
            />
          </label>
          <label>
            Profundidade fixa
            <input
              type="number"
              min="1"
              max="40"
              placeholder="automática"
              value={draft.depth ?? ""}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  depth: event.target.value ? Number(event.target.value) : null,
                })
              }
            />
          </label>
          <label>
            Linhas sugeridas
            <input
              type="number"
              min="1"
              max="5"
              value={draft.multipv}
              onChange={(event) => setDraft({ ...draft, multipv: Number(event.target.value) })}
            />
          </label>
        </div>
      </details>
      <button className="button button--small" onClick={() => void onSave(role, draft)}>
        Salvar e aplicar
      </button>
      </div>
    </details>
  );
}

export function App() {
  const [fen, setFen] = useState(INITIAL_FEN);
  const [actor, setActor] = useState<"user" | "opponent">("user");
  const [orientation, setOrientation] = useState<"white" | "black">("white");
  const [source, setSource] = useState<BrowserEvent["source"]>("manual");
  const [autoAnalyze, setAutoAnalyze] = useState(true);
  const [selectedCandidate, setSelectedCandidate] = useState(0);
  const [previewPly, setPreviewPly] = useState<number | null>(null);
  const [hoveredMove, setHoveredMove] = useState<string | null>(null);
  const [settings, setSettings] = useState<EngineSettingsResponse | null>(null);
  const [analysis, setAnalysis] = useState<AnalyzeResponse | null>(null);
  const [candidateEvidence, setCandidateEvidence] = useState<CandidateEvidence[]>([]);
  const [positionFeatures, setPositionFeatures] = useState<PositionFeaturesResponse | null>(null);
  const [history, setHistory] = useState<AnalysisHistorySummary[]>([]);
  const [humanView, setHumanView] = useState<HumanPredictionResponse | null>(null);
  const [lastMove, setLastMove] = useState<MoveClassificationResponse | null>(null);
  const [explanation, setExplanation] = useState<PositionExplanation | null>(null);
  const [status, setStatus] = useState("Conectando ao backend…");
  const [busy, setBusy] = useState(false);
  const [explaining, setExplaining] = useState(false);
  const previousBrowserFen = useRef<string | null>(null);
  const actorRef = useRef(actor);
  const autoAnalyzeRef = useRef(autoAnalyze);
  const settingsRef = useRef<EngineSettingsResponse | null>(null);
  const analysisRequestId = useRef(0);
  const explanationRequestId = useRef(0);
  const positionThemes =
    positionFeatures && positionFeatures.fen === fen
      ? formatPositionThemes(positionFeatures)
      : [];
  const displayedCandidate = analysis?.candidates[selectedCandidate] ?? analysis?.candidates[0];
  const variationFrames = useMemo(
    () => buildVariationFrames(fen, displayedCandidate?.pv_uci ?? []),
    [displayedCandidate, fen],
  );
  const previewFrame = previewPly === null ? null : variationFrames[previewPly] ?? null;
  const boardFen = previewFrame?.fen ?? fen;
  const boardMove = previewFrame?.uci ?? hoveredMove ?? displayedCandidate?.uci ?? lastMove?.uci ?? null;
  const fenParts = fen.trim().split(/\s+/);
  const sideToMove = fenParts[1] === "b" ? "Pretas" : "Brancas";
  const fullMove = fenParts[5] ?? "1";
  const enabledEngineCount = settings
    ? Object.values(settings.profiles).filter((profile) => profile.enabled).length
    : 0;

  useEffect(() => {
    actorRef.current = actor;
  }, [actor]);

  useEffect(() => {
    autoAnalyzeRef.current = autoAnalyze;
  }, [autoAnalyze]);

  function clearAnalysisResults() {
    analysisRequestId.current += 1;
    explanationRequestId.current += 1;
    setAnalysis(null);
    setCandidateEvidence([]);
    setPositionFeatures(null);
    setHumanView(null);
    setExplanation(null);
    setSelectedCandidate(0);
    setPreviewPly(null);
    setHoveredMove(null);
    setBusy(false);
    setExplaining(false);
  }

  function changeFen(nextFen: string) {
    setFen(nextFen);
    setSource("manual");
    clearAnalysisResults();
  }

  function changeActor(nextActor: "user" | "opponent") {
    setActor(nextActor);
    clearAnalysisResults();
  }

  useEffect(() => {
    void getSettings()
      .then((value) => {
        settingsRef.current = value;
        setSettings(value);
        setStatus(value.stockfish_path ? "Pronto" : "Defina STOCKFISH_PATH no backend");
      })
      .catch(() => {
        logEvent("error", "settings_load_failed", { component: "desktop" });
        setStatus("Backend desconectado");
      });

    void listAnalysisHistory()
      .then(setHistory)
      .catch(() => {
        logEvent("warn", "history_load_failed", { component: "desktop" });
      });

    const socket = new WebSocket(`${WS_BASE}/ws/desktop`);
    socket.onopen = () => {
      logEvent("info", "backend_socket_connected", { component: "desktop" });
      socket.send("desktop-ready");
    };
    socket.onclose = () =>
      logEvent("warn", "backend_socket_disconnected", { component: "desktop" });
    socket.onmessage = (message) => {
      const event = JSON.parse(message.data as string) as BrowserEvent;
      if (event.type !== "position") return;

      const beforeFen = previousBrowserFen.current;
      previousBrowserFen.current = event.fen;
      changeFen(event.fen);

      if (event.source !== "manual") setSource(event.source);

      if (beforeFen && beforeFen !== event.fen && event.source !== "manual") {
        void classifyMove({ before_fen: beforeFen, after_fen: event.fen })
          .then(setLastMove)
          .catch(() => {
            logEvent("warn", "move_classification_skipped", { component: "desktop" });
            setLastMove(null);
          });
      }
      if (autoAnalyzeRef.current && event.source !== "manual") {
        void runAnalysis(event.fen, actorRef.current);
      }
    };
    return () => socket.close();
  }, []);

  async function runAnalysis(
    targetFen: string = fen,
    targetActor: "user" | "opponent" = actor,
  ) {
    const requestId = ++analysisRequestId.current;
    explanationRequestId.current += 1;
    setBusy(true);
    setExplaining(false);
    setStatus("Analisando…");
    setHumanView(null);
    setCandidateEvidence([]);
    setPositionFeatures(null);
    setExplanation(null);
    try {
      const activeSettings = settingsRef.current ?? settings;
      const selfRole = targetActor === "user" ? "user" : "opponent";
      const opponentRole = targetActor === "user" ? "opponent" : "user";
      if (activeSettings?.maia3_available) {
        void predictHumanMoves({
          fen: targetFen,
          self_elo: activeSettings.profiles[selfRole].elo,
          opponent_elo: activeSettings.profiles[opponentRole].elo,
          multipv: Math.min(5, activeSettings.profiles[selfRole].multipv),
        })
          .then((humanResult) => {
            if (analysisRequestId.current === requestId) setHumanView(humanResult);
          })
          .catch(() => {
            logEvent("warn", "human_prediction_skipped", { component: "desktop" });
          });
      }

      const bundle = await analyzeEvidence({
        fen: targetFen,
        actor: targetActor,
        include_evaluator: true,
        include_replies: true,
      });
      if (analysisRequestId.current !== requestId) return;
      const result = bundle.analysis;
      setAnalysis(result);
      setCandidateEvidence(bundle.candidates);
      setPositionFeatures(bundle.position);
      void refreshHistory();
      logEvent("info", "analysis_completed", {
        component: "desktop",
        candidateCount: result.candidates.length,
      });
      setStatus("Análise concluída");
    } catch (error) {
      if (analysisRequestId.current !== requestId) return;
      logEvent("error", "analysis_failed", { component: "desktop" });
      setStatus(error instanceof Error ? error.message : "Falha na análise");
    } finally {
      if (analysisRequestId.current === requestId) setBusy(false);
    }
  }

  async function runExplanation() {
    if (!analysis || analysis.fen !== fen || analysis.actor !== actor) return;
    const requestId = ++explanationRequestId.current;
    setExplaining(true);
    setStatus("Gerando explicação…");
    try {
      const result = await explainPosition({
        fen: analysis.fen,
        actor: analysis.actor,
        include_evaluator: true,
        include_replies: true,
      });
      if (requestId !== explanationRequestId.current) return;
      setAnalysis(result.evidence.analysis);
      setCandidateEvidence(result.evidence.candidates);
      setPositionFeatures(result.evidence.position);
      setExplanation(result.explanation);
      void refreshHistory();
      setStatus("Explicação concluída");
    } catch (error) {
      if (requestId !== explanationRequestId.current) return;
      logEvent("error", "explanation_failed", { component: "desktop" });
      setStatus(error instanceof Error ? error.message : "Falha na explicação");
    } finally {
      if (requestId === explanationRequestId.current) setExplaining(false);
    }
  }

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (!event.ctrlKey) return;
      if (event.key === "Enter" && !busy) {
        event.preventDefault();
        void runAnalysis();
      }
      if (
        event.key.toLowerCase() === "e" &&
        analysis?.fen === fen &&
        analysis.actor === actor &&
        settings?.llm_configured &&
        !explaining
      ) {
        event.preventDefault();
        void runExplanation();
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [actor, analysis, busy, explaining, fen, settings?.llm_configured]);

  useEffect(() => {
    const navigateVariation = (event: KeyboardEvent) => {
      const element = event.target;
      if (
        element instanceof Element
        && element.matches("input, textarea, select, [contenteditable='true']")
      ) return;
      if (event.key === "Escape" && previewPly !== null) {
        event.preventDefault();
        setPreviewPly(null);
        return;
      }
      if (!variationFrames.length || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      event.preventDefault();
      setPreviewPly((current) => {
        if (event.key === "ArrowRight") {
          return current === null ? 0 : Math.min(current + 1, variationFrames.length - 1);
        }
        if (current === null || current === 0) return null;
        return current - 1;
      });
    };
    window.addEventListener("keydown", navigateVariation);
    return () => window.removeEventListener("keydown", navigateVariation);
  }, [previewPly, variationFrames.length]);

  async function saveProfile(role: EngineRole, value: EngineSettings) {
    const saved = await updateSettings(role, value);
    setSettings((current) => {
      if (!current) return current;
      const next = { ...current, profiles: { ...current.profiles, [role]: saved } };
      settingsRef.current = next;
      return next;
    });
    setStatus(`Força de ${role} salva e aplicada sem reiniciar`);
  }

  async function refreshHistory() {
    try {
      setHistory(await listAnalysisHistory());
    } catch {
      logEvent("warn", "history_refresh_failed", { component: "desktop" });
    }
  }

  async function restoreHistory(item: AnalysisHistorySummary) {
    clearAnalysisResults();
    const requestId = analysisRequestId.current;
    setFen(item.fen);
    setActor(item.actor);
    setBusy(true);
    setStatus("Restaurando análise…");
    try {
      const bundle = await getAnalysisHistoryItem(item.id);
      if (analysisRequestId.current !== requestId) return;
      setAnalysis(bundle.analysis);
      setCandidateEvidence(bundle.candidates);
      setPositionFeatures(bundle.position);
      setStatus("Análise restaurada do histórico local");
    } catch (error) {
      if (analysisRequestId.current !== requestId) return;
      logEvent("error", "history_restore_failed", { component: "desktop" });
      setStatus(error instanceof Error ? error.message : "Falha ao restaurar histórico");
    } finally {
      if (analysisRequestId.current === requestId) setBusy(false);
    }
  }

  async function clearHistory() {
    if (!window.confirm("Apagar todo o histórico local de análises?")) return;
    try {
      const result = await clearAnalysisHistory();
      setHistory([]);
      setStatus(`${result.deleted} análises removidas do histórico local`);
    } catch (error) {
      logEvent("error", "history_clear_failed", { component: "desktop" });
      setStatus(error instanceof Error ? error.message : "Falha ao limpar histórico");
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true">♘</span>
          <div>
            <p className="eyebrow">ASSISTENTE LOCAL DE ANÁLISE</p>
            <h1>Chess Assistant</h1>
          </div>
        </div>
        <div className="topbar__status">
          <span className={`source-pill source-pill--${source === "manual" ? "manual" : "live"}`}>
            <span className="source-pill__dot" />
            {sourceLabel(source)}
          </span>
          <span className="status" role="status" aria-live="polite">
            {busy || explaining ? <span className="spinner" aria-hidden="true" /> : null}
            {status}
          </span>
        </div>
      </header>

      <section className="panel command-bar" aria-label="Controles de análise">
        <div className="segmented" aria-label="Quem joga">
          <button
            className={actor === "user" ? "segmented__active" : ""}
            onClick={() => changeActor("user")}
          >
            Meu lance
          </button>
          <button
            className={actor === "opponent" ? "segmented__active" : ""}
            onClick={() => changeActor("opponent")}
          >
            Lance do oponente
          </button>
        </div>
        <label className="auto-toggle">
          <input
            type="checkbox"
            checked={autoAnalyze}
            onChange={(event) => setAutoAnalyze(event.target.checked)}
          />
          <span>Analisar automaticamente ao receber uma posição</span>
        </label>
        <div className="control-buttons">
          <button className="button" disabled={busy} onClick={() => void runAnalysis()}>
            <span aria-hidden="true">▶</span>
            {busy ? "Calculando…" : "Analisar agora"}
            <kbd>Ctrl ↵</kbd>
          </button>
          <button
            className="button button--secondary"
            disabled={
              !analysis ||
              analysis.fen !== fen ||
              analysis.actor !== actor ||
              !settings?.llm_configured ||
              explaining
            }
            onClick={() => void runExplanation()}
            title={settings?.llm_configured ? "Gerar explicação em linguagem natural" : "Configure a API para habilitar"}
          >
            <span aria-hidden="true">✦</span>
            {explaining ? "Explicando…" : "Explicar com IA"}
            <kbd>Ctrl E</kbd>
          </button>
        </div>
      </section>

      <div className="workspace">
        <section className="panel board-panel">
          <div className="panel-heading board-panel__heading">
            <div>
              <p className="eyebrow">POSIÇÃO ATUAL</p>
              <h2>{analysis?.opening?.name ?? `${sideToMove} jogam`}</h2>
            </div>
            <button
              className="icon-button"
              onClick={() => setOrientation((current) => current === "white" ? "black" : "white")}
              aria-label="Girar tabuleiro"
              title="Girar tabuleiro"
            >
              ↻
            </button>
          </div>
          <div className="board-stage">
            <EvalBar cp={analysis?.evaluation_cp ?? null} mate={analysis?.evaluation_mate ?? null} />
            <ChessBoard fen={boardFen} orientation={orientation} moveUci={boardMove} />
          </div>
          <div className="board-meta">
            <span><b>{sideToMove}</b> jogam</span>
            <span>Lance {fullMove}</span>
            {previewFrame ? (
              <span className="board-meta__candidate board-meta__candidate--preview">
                Variante <b>{previewFrame.ply}/{variationFrames.length}</b> · {previewFrame.san}
              </span>
            ) : displayedCandidate && (
              <span className="board-meta__candidate">
                Prévia: <b>{displayedCandidate.san}</b>
              </span>
            )}
          </div>
          <details className="fen-editor">
            <summary>Editar ou colar uma FEN</summary>
            <div className="field">
              <label htmlFor="fen">Posição FEN</label>
              <textarea id="fen" value={fen} onChange={(event) => changeFen(event.target.value)} />
              <button className="text-button" onClick={() => changeFen(INITIAL_FEN)}>
                Voltar à posição inicial
              </button>
            </div>
          </details>
        </section>

        <section className="panel panel--analysis">
          <div className="panel-heading analysis-heading">
            <div>
              <p className="eyebrow">ANÁLISE DO STOCKFISH</p>
              <h2>{analysis ? "Melhores planos" : "Pronto para analisar"}</h2>
            </div>
            {analysis && (
              <span className="evaluation-badge">
                {formatEvaluation(analysis.evaluation_cp, analysis.evaluation_mate)}
              </span>
            )}
          </div>

          {lastMove && (
            <article className={`classification classification--${lastMove.classification}`}>
              <span className="classification__symbol">{lastMove.symbol}</span>
              <div>
                <p className="eyebrow">ÚLTIMO LANCE</p>
                <h2>{lastMove.san} <span>· {lastMove.label}</span></h2>
                <p>
                  Perda de expectativa: {(lastMove.expected_points_loss * 100).toFixed(1)} p.p. ·
                  Melhor: <b>{lastMove.best_move_san}</b>
                </p>
                <p>{classificationEvidenceText(lastMove)}</p>
              </div>
            </article>
          )}

          <div className="moves">
            {busy && !analysis && (
              <div className="analysis-skeleton" aria-label="Análise em andamento">
                <span /><span /><span />
              </div>
            )}
            {explanation && (
              <article className="insight-card explanation-summary">
                <span className="insight-card__icon" aria-hidden="true">✦</span>
                <div>
                  <div className="explanation-summary__heading">
                    <p className="eyebrow">LEITURA DA POSIÇÃO</p>
                    <span className="trust-badge">
                      <i /> {explanation.position_support_ids.length} sinais verificados
                    </span>
                  </div>
                  <p>{explanation.position_summary}</p>
                </div>
              </article>
            )}
            {positionThemes.length > 0 && (
              <article className="position-themes">
                <p className="eyebrow">TEMAS DA POSIÇÃO</p>
                <div className="position-themes__list">
                  {positionThemes.map((theme) => <small key={theme}>{theme}</small>)}
                </div>
              </article>
            )}
            {analysis?.opening && (
              <article className="opening-card">
                <span className="opening-card__eco">{analysis.opening.eco}</span>
                <div>
                  <p className="eyebrow">ABERTURA</p>
                  <h3>{analysis.opening.name}</h3>
                  <p>{analysis.opening.pgn}</p>
                </div>
              </article>
            )}
            {humanView && (
              <article className="human-prediction">
                <p className="eyebrow">PERSPECTIVA HUMANA · MAIA-3</p>
                <h3>Lances comuns para {humanView.self_elo} Elo</h3>
                <div className="human-prediction__moves">
                  {humanView.candidates.map((candidate) => (
                    <div key={candidate.uci}>
                      <span className="rank">{candidate.rank}</span>
                      <b>{candidate.san}</b>
                      <small>
                        V {formatProbability(candidate.win_probability)} · E {formatProbability(candidate.draw_probability)} · D {formatProbability(candidate.loss_probability)}
                      </small>
                    </div>
                  ))}
                </div>
                <p className="model-note">Preferência humana; a avaliação objetiva continua sendo do Stockfish.</p>
              </article>
            )}
            {analysis?.candidates.map((move, index) => {
              const evidence = candidateEvidence[index];
              const prose = explanation?.candidates.find((item) => item.uci === move.uci);
              const selected = index === selectedCandidate;
              const gap = candidateGapLabel(
                analysis.candidates[0]?.score_cp ?? null,
                move.score_cp,
                fenParts[1] === "b" ? "black" : "white",
              );
              return (
                <article
                  className={`move${selected ? " move--selected" : ""}`}
                  key={move.uci}
                  onMouseEnter={() => setHoveredMove(move.uci)}
                  onMouseLeave={() => setHoveredMove(null)}
                >
                  <button
                    className="move__summary"
                    onClick={() => {
                      setSelectedCandidate(index);
                      setPreviewPly(null);
                    }}
                    onFocus={() => setHoveredMove(move.uci)}
                    onBlur={() => setHoveredMove(null)}
                    aria-expanded={selected}
                  >
                    <span className="rank">{index + 1}</span>
                    <span className="move__name">
                      <strong>{move.san}</strong>
                      <code>{move.uci}{index > 0 && gap ? ` · ${gap}` : ""}</code>
                    </span>
                    <span className="move__score">{formatEvaluation(move.score_cp, move.mate)}</span>
                    <span className="move__chevron" aria-hidden="true">›</span>
                  </button>
                  {!selected && (
                    <p className="variation"><span>Linha</span>{move.pv_san.join(" ")}</p>
                  )}
                  {evidence && evidence.plan_hints.length > 0 && (
                    <div className="plan-hints">
                      {evidence.plan_hints.map((hint) => (
                        <small key={hint}>{formatPlanHint(hint, evidence.facts)}</small>
                      ))}
                    </div>
                  )}
                  {selected && variationFrames.length > 0 && (
                    <div className="variation-explorer">
                      <div className="variation-explorer__heading">
                        <div>
                          <p className="eyebrow">VARIANTE CALCULADA</p>
                          <strong>Explore a linha no tabuleiro</strong>
                        </div>
                        <span>{previewFrame ? `${previewFrame.ply}/${variationFrames.length}` : "início"}</span>
                      </div>
                      <div className="variation-explorer__moves" aria-label="Lances da variante">
                        {variationFrames.map((frame, ply) => (
                          <button
                            className={previewPly === ply ? "variation-explorer__active" : ""}
                            key={`${frame.uci}-${ply}`}
                            onClick={() => setPreviewPly(ply)}
                            title={`Mostrar a posição após ${frame.san}`}
                          >
                            <small>{Math.floor(ply / 2) + 1}{ply % 2 ? "…" : "."}</small>
                            {move.pv_san[ply] ?? frame.san}
                          </button>
                        ))}
                      </div>
                      <div className="variation-explorer__controls">
                        <button onClick={() => setPreviewPly(null)} disabled={previewPly === null}>
                          Posição inicial
                        </button>
                        <span>Use ← → para navegar</span>
                        <div>
                          <button
                            aria-label="Lance anterior"
                            onClick={() => setPreviewPly((current) => current === null || current === 0 ? null : current - 1)}
                            disabled={previewPly === null}
                          >←</button>
                          <button
                            aria-label="Próximo lance"
                            onClick={() => setPreviewPly((current) => current === null ? 0 : Math.min(current + 1, variationFrames.length - 1))}
                            disabled={previewPly === variationFrames.length - 1}
                          >→</button>
                        </div>
                      </div>
                    </div>
                  )}
                  {selected && prose && (
                    <div className="explanation explanation--grounded">
                      <div className="explanation__heading">
                        <div>
                          <p className="eyebrow">EXPLICAÇÃO ANCORADA</p>
                          <strong>{prose.headline}</strong>
                        </div>
                        <span className="trust-badge"><i /> Stockfish verificado</span>
                      </div>
                      <p className="explanation__lead">{prose.explanation}</p>
                      <div className="explanation__grid">
                        <section>
                          <span className="explanation__icon">01</span>
                          <div>
                            <b>Plano prático</b>
                            <ol>{prose.plan_steps.map((step) => <li key={step}>{step}</li>)}</ol>
                          </div>
                        </section>
                        <section>
                          <span className="explanation__icon">↳</span>
                          <div>
                            <b>Resposta crítica</b>
                            <p>{prose.opponent_response}</p>
                          </div>
                        </section>
                        {prose.watch_for && (
                          <section className="explanation__warning">
                            <span className="explanation__icon">!</span>
                            <div><b>Fique atento</b><p>{prose.watch_for}</p></div>
                          </section>
                        )}
                      </div>
                      <footer>
                        Baseado em {prose.support_ids.length} sinais objetivos · PV com {move.pv_uci.length} meios-lances
                      </footer>
                    </div>
                  )}
                  {selected && move.replies.length > 0 && (
                    <div className="replies">
                      <span>Melhores defesas do oponente</span>
                      {move.replies.map((reply) => (
                        <div key={reply.uci}>
                          <b>{reply.san}</b><small>{reply.pv_san.join(" ")}</small>
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              );
            })}
            {!analysis && !busy && (
              <div className="empty-state">
                <span className="empty-state__piece" aria-hidden="true">♞</span>
                <h3>Sua análise aparece aqui</h3>
                <p>Receba uma posição do Chess.com ou Lichess, ou cole uma FEN no tabuleiro.</p>
                <div className="empty-state__steps">
                  <span><b>1</b> Posição</span>
                  <span><b>2</b> Stockfish</span>
                  <span><b>3</b> Planos e defesas</span>
                </div>
              </div>
            )}
          </div>
        </section>

        <aside className="panel settings">
          <div className="settings__heading">
            <div>
              <p className="eyebrow">CENTRAL DE CONTROLE</p>
              <h2>Motores</h2>
            </div>
            <span className="settings__count">
              {settings ? `${enabledEngineCount}/3 ativos` : "—"}
            </span>
          </div>
          <div className="service-status">
            <span className={settings?.stockfish_path ? "service-status__ok" : ""}>
              <i /> Stockfish
            </span>
            <span className={settings?.llm_configured ? "service-status__ok" : ""}>
              <i /> IA {settings?.llm_configured ? "pronta" : "opcional"}
            </span>
          </div>
          {settings && ROLES.map((role) => (
            <ProfileEditor
              key={role}
              role={role}
              profile={settings.profiles[role]}
              onSave={saveProfile}
            />
          ))}
          <section className="history">
            <div className="history__heading">
              <div>
                <p className="eyebrow">HISTÓRICO LOCAL</p>
                <h3>Posições recentes</h3>
              </div>
              {history.length > 0 && (
                <button className="history__clear" onClick={() => void clearHistory()}>Limpar</button>
              )}
            </div>
            {history.length === 0 ? (
              <p className="history__empty">As posições analisadas aparecerão aqui.</p>
            ) : (
              <div className="history__items">
                {history.map((item) => (
                  <button className="history__item" key={item.id} onClick={() => void restoreHistory(item)}>
                    <span>{item.opening_name ?? (item.candidate_san.slice(0, 3).join(" · ") || "Posição")}</span>
                    <small>{new Date(item.created_at).toLocaleString("pt-BR")} · {formatEvaluation(item.evaluation_cp, item.evaluation_mate)}</small>
                  </button>
                ))}
              </div>
            )}
          </section>
        </aside>
      </div>
    </main>
  );
}
