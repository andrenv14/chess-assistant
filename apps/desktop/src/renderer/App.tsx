import type {
  AnalyzeResponse,
  BrowserEvent,
  CandidateEvidence,
  EngineRole,
  EngineSettings,
  EngineSettingsResponse,
  HumanPredictionResponse,
  MoveClassificationResponse,
  PositionExplanation,
} from "@chess-assistant/contracts";
import { logEvent } from "@chess-assistant/contracts";
import { useEffect, useRef, useState } from "react";

import {
  analyzeEvidence,
  classifyMove,
  explainPosition,
  getSettings,
  predictHumanMoves,
  updateSettings,
  WS_BASE,
} from "./api";
import {
  evaluationToWhitePercent,
  formatEvaluation,
  formatPlanHint,
  formatProbability,
} from "./presentation";

const INITIAL_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const ROLES: EngineRole[] = ["user", "opponent", "evaluator"];

function EvalBar({ cp, mate }: { cp: number | null; mate: number | null }) {
  const whitePercent = evaluationToWhitePercent(cp, mate);

  return (
    <div className="eval" aria-label={`Avaliação ${formatEvaluation(cp, mate)}`}>
      <div className="eval__black" style={{ height: `${100 - whitePercent}%` }} />
      <div className="eval__white" style={{ height: `${whitePercent}%` }} />
      <strong>{formatEvaluation(cp, mate)}</strong>
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

  return (
    <section className="profile">
      <div className="profile__title">
        <h3>{role}</h3>
        <label>
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })}
          />
          ativo
        </label>
      </div>
      <label>
        Elo limitado: <b>{draft.elo}</b>
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
        Skill: <b>{draft.skill_level}</b>
        <input
          type="range"
          min="0"
          max="20"
          value={draft.skill_level}
          onChange={(event) => setDraft({ ...draft, skill_level: Number(event.target.value) })}
        />
      </label>
      <label>
        <input
          type="checkbox"
          checked={draft.limit_strength}
          onChange={(event) => setDraft({ ...draft, limit_strength: event.target.checked })}
        />
        limitar força
      </label>
      <button className="button button--small" onClick={() => void onSave(role, draft)}>
        Aplicar agora
      </button>
    </section>
  );
}

export function App() {
  const [fen, setFen] = useState(INITIAL_FEN);
  const [actor, setActor] = useState<"user" | "opponent">("user");
  const [settings, setSettings] = useState<EngineSettingsResponse | null>(null);
  const [analysis, setAnalysis] = useState<AnalyzeResponse | null>(null);
  const [candidateEvidence, setCandidateEvidence] = useState<CandidateEvidence[]>([]);
  const [humanView, setHumanView] = useState<HumanPredictionResponse | null>(null);
  const [lastMove, setLastMove] = useState<MoveClassificationResponse | null>(null);
  const [explanation, setExplanation] = useState<PositionExplanation | null>(null);
  const [status, setStatus] = useState("Conectando ao backend…");
  const [busy, setBusy] = useState(false);
  const [explaining, setExplaining] = useState(false);
  const previousBrowserFen = useRef<string | null>(null);
  const analysisRequestId = useRef(0);
  const explanationRequestId = useRef(0);

  useEffect(() => {
    void getSettings()
      .then((value) => {
        setSettings(value);
        setStatus(value.stockfish_path ? "Pronto" : "Defina STOCKFISH_PATH no backend");
      })
      .catch(() => {
        logEvent("error", "settings_load_failed", { component: "desktop" });
        setStatus("Backend desconectado");
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
      setFen(event.fen);

      if (beforeFen && beforeFen !== event.fen && event.source !== "manual") {
        void classifyMove({ before_fen: beforeFen, after_fen: event.fen })
          .then(setLastMove)
          .catch(() => {
            logEvent("warn", "move_classification_skipped", { component: "desktop" });
            setLastMove(null);
          });
      }
    };
    return () => socket.close();
  }, []);

  async function runAnalysis() {
    const requestId = ++analysisRequestId.current;
    explanationRequestId.current += 1;
    setBusy(true);
    setExplaining(false);
    setStatus("Analisando…");
    setHumanView(null);
    setCandidateEvidence([]);
    setExplanation(null);
    try {
      const selfRole = actor === "user" ? "user" : "opponent";
      const opponentRole = actor === "user" ? "opponent" : "user";
      if (settings?.maia3_available) {
        void predictHumanMoves({
          fen,
          self_elo: settings.profiles[selfRole].elo,
          opponent_elo: settings.profiles[opponentRole].elo,
          multipv: Math.min(5, settings.profiles[selfRole].multipv),
        })
          .then((humanResult) => {
            if (analysisRequestId.current === requestId) setHumanView(humanResult);
          })
          .catch(() => {
            logEvent("warn", "human_prediction_skipped", { component: "desktop" });
          });
      }

      const bundle = await analyzeEvidence({
        fen,
        actor,
        include_evaluator: true,
        include_replies: true,
      });
      if (analysisRequestId.current !== requestId) return;
      const result = bundle.analysis;
      setAnalysis(result);
      setCandidateEvidence(bundle.candidates);
      logEvent("info", "analysis_completed", {
        component: "desktop",
        candidateCount: result.candidates.length,
      });
      setStatus("Análise concluída");
    } catch (error) {
      logEvent("error", "analysis_failed", { component: "desktop" });
      setStatus(error instanceof Error ? error.message : "Falha na análise");
    } finally {
      setBusy(false);
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
      setExplanation(result.explanation);
      setStatus("Explicação concluída");
    } catch (error) {
      if (requestId !== explanationRequestId.current) return;
      logEvent("error", "explanation_failed", { component: "desktop" });
      setStatus(error instanceof Error ? error.message : "Falha na explicação");
    } finally {
      if (requestId === explanationRequestId.current) setExplaining(false);
    }
  }

  async function saveProfile(role: EngineRole, value: EngineSettings) {
    const saved = await updateSettings(role, value);
    setSettings((current) =>
      current
        ? { ...current, profiles: { ...current.profiles, [role]: saved } }
        : current,
    );
    setStatus(`Força de ${role} atualizada sem reiniciar`);
  }

  return (
    <main>
      <header className="topbar">
        <div>
          <p className="eyebrow">ANÁLISE LOCAL</p>
          <h1>Chess Assistant</h1>
        </div>
        <span className="status">{status}</span>
      </header>

      <div className="workspace">
        <EvalBar cp={analysis?.evaluation_cp ?? null} mate={analysis?.evaluation_mate ?? null} />

        <section className="panel panel--analysis">
          <div className="field">
            <label htmlFor="fen">Posição (FEN)</label>
            <textarea id="fen" value={fen} onChange={(event) => setFen(event.target.value)} />
          </div>
          <div className="controls">
            <label>
              Quem joga
              <select value={actor} onChange={(event) => setActor(event.target.value as typeof actor)}>
                <option value="user">Você</option>
                <option value="opponent">Oponente</option>
              </select>
            </label>
            <div className="control-buttons">
              <button className="button" disabled={busy} onClick={() => void runAnalysis()}>
                {busy ? "Calculando…" : "Analisar posição"}
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
              >
                {explaining ? "Explicando…" : "Explicar com IA"}
              </button>
            </div>
          </div>

          {lastMove && (
            <article className={`classification classification--${lastMove.classification}`}>
              <span className="classification__symbol">{lastMove.symbol}</span>
              <div>
                <p className="eyebrow">ÚLTIMO LANCE</p>
                <h2>
                  {lastMove.san} — {lastMove.label}
                </h2>
                <p>
                  Perda de expectativa: {(lastMove.expected_points_loss * 100).toFixed(1)} pontos
                  percentuais. Melhor lance: <b>{lastMove.best_move_san}</b>.
                </p>
                {lastMove.opening && (
                  <p>
                    Posição de livro: <b>{lastMove.opening.name}</b> ({lastMove.opening.eco}).
                  </p>
                )}
              </div>
            </article>
          )}

          <div className="moves">
            {explanation && (
              <article className="move explanation-summary">
                <p className="eyebrow">LEITURA DA POSIÇÃO</p>
                <p>{explanation.position_summary}</p>
              </article>
            )}
            {analysis?.opening && (
              <article className="move opening">
                <p className="eyebrow">ABERTURA · {analysis.opening.eco}</p>
                <h2>{analysis.opening.name}</h2>
                <p className="variation">Linha de referência: {analysis.opening.pgn}</p>
              </article>
            )}
            {humanView && (
              <article className="move human-prediction">
                <p className="eyebrow">PERSPECTIVA HUMANA · MAIA-3</p>
                <h2>Lances comuns para {humanView.self_elo} Elo</h2>
                <div className="human-prediction__moves">
                  {humanView.candidates.map((candidate) => (
                    <div key={candidate.uci}>
                      <span className="rank">{candidate.rank}</span>
                      <b>{candidate.san}</b>
                      <small>
                        V {formatProbability(candidate.win_probability)} · E{" "}
                        {formatProbability(candidate.draw_probability)} · D{" "}
                        {formatProbability(candidate.loss_probability)}
                      </small>
                    </div>
                  ))}
                </div>
                <p className="model-note">Ranking humano; a avaliação objetiva continua sendo do Stockfish.</p>
              </article>
            )}
            {analysis?.candidates.map((move, index) => {
              const evidence = candidateEvidence[index];
              const prose = explanation?.candidates[index];
              return (
                <article className="move" key={move.uci}>
                  <div className="move__heading">
                    <span className="rank">{index + 1}</span>
                    <div>
                      <h2>{move.san}</h2>
                      <code>{move.uci}</code>
                    </div>
                    <strong>{formatEvaluation(move.score_cp, move.mate)}</strong>
                  </div>
                  <p className="variation">{move.pv_san.join(" ")}</p>
                  {evidence && evidence.plan_hints.length > 0 && (
                    <div className="plan-hints">
                      <span>Ideias verificadas</span>
                      {evidence.plan_hints.map((hint) => (
                        <small key={hint}>{formatPlanHint(hint)}</small>
                      ))}
                    </div>
                  )}
                  {prose?.uci === move.uci && (
                    <div className="explanation">
                      <strong>{prose.headline}</strong>
                      <p>{prose.explanation}</p>
                      <ol>
                        {prose.plan_steps.map((step) => (
                          <li key={step}>{step}</li>
                        ))}
                      </ol>
                      <p>
                        <b>Resposta:</b> {prose.opponent_response}
                      </p>
                      {prose.watch_for && (
                        <p>
                          <b>Atenção:</b> {prose.watch_for}
                        </p>
                      )}
                    </div>
                  )}
                  {move.replies.length > 0 && (
                    <div className="replies">
                      <span>Respostas do oponente</span>
                      {move.replies.map((reply) => (
                        <div key={reply.uci}>
                          <b>{reply.san}</b> <small>{reply.pv_san.join(" ")}</small>
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              );
            })}
            {!analysis && <p className="empty">Insira uma posição e rode a primeira análise.</p>}
          </div>
        </section>

        <aside className="panel settings">
          <div className="settings__heading">
            <p className="eyebrow">MOTORES</p>
            <h2>Força em tempo real</h2>
          </div>
          {settings &&
            ROLES.map((role) => (
              <ProfileEditor
                key={role}
                role={role}
                profile={settings.profiles[role]}
                onSave={saveProfile}
              />
            ))}
          <p className="note">
            “user” sugere seus lances, “opponent” calcula as defesas e “evaluator” mantém uma
            referência objetiva.
          </p>
          <p className="note">
            Maia-3 humano: {settings?.maia3_available ? "disponível" : "não instalado (opcional)"}.
          </p>
          <p className="note">
            Explicações por API:{" "}
            {settings?.llm_configured ? settings.llm_model : "não configuradas"}.
          </p>
        </aside>
      </div>
    </main>
  );
}
