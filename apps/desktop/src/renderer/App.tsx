import type {
  AnalyzeResponse,
  BrowserEvent,
  EngineRole,
  EngineSettings,
  EngineSettingsResponse,
  MoveClassificationResponse,
} from "@chess-assistant/contracts";
import { logEvent } from "@chess-assistant/contracts";
import { useEffect, useRef, useState } from "react";

import { analyzePosition, classifyMove, getSettings, updateSettings, WS_BASE } from "./api";
import { evaluationToWhitePercent, formatEvaluation } from "./presentation";

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
  const [lastMove, setLastMove] = useState<MoveClassificationResponse | null>(null);
  const [status, setStatus] = useState("Conectando ao backend…");
  const [busy, setBusy] = useState(false);
  const previousBrowserFen = useRef<string | null>(null);

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
    setBusy(true);
    setStatus("Analisando…");
    try {
      const result = await analyzePosition({
        fen,
        actor,
        include_evaluator: true,
        include_replies: true,
      });
      setAnalysis(result);
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
            <button className="button" disabled={busy} onClick={() => void runAnalysis()}>
              {busy ? "Calculando…" : "Analisar posição"}
            </button>
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
            {analysis?.opening && (
              <article className="move opening">
                <p className="eyebrow">ABERTURA · {analysis.opening.eco}</p>
                <h2>{analysis.opening.name}</h2>
                <p className="variation">Linha de referência: {analysis.opening.pgn}</p>
              </article>
            )}
            {analysis?.candidates.map((move, index) => (
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
            ))}
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
        </aside>
      </div>
    </main>
  );
}
