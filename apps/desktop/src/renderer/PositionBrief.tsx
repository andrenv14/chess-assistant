import type {
  CandidateEvidence,
  PositionFeaturesResponse,
  RepertoireKnowledge,
} from "@chess-assistant/contracts";

import { formatPlanHint, formatPositionThemes } from "./presentation";

interface PositionBriefProps {
  candidates: CandidateEvidence[];
  onOpen: () => void;
  position: PositionFeaturesResponse | null;
  repertoire: RepertoireKnowledge | null;
}

function phaseLabel(phase: PositionFeaturesResponse["phase"]): string {
  if (phase === "opening") return "Abertura";
  if (phase === "middlegame") return "Meio-jogo";
  return "Final";
}

export function PositionBrief({ candidates, onOpen, position, repertoire }: PositionBriefProps) {
  if (!position) {
    return (
      <aside className="panel position-brief position-brief--empty">
        <span aria-hidden="true">◇</span>
        <div><p className="eyebrow">CONHECIMENTO</p><h2>Leitura da posição</h2></div>
        <p>Os temas, planos e alertas aparecem junto com os lances — sem esperar outra análise.</p>
      </aside>
    );
  }

  const themes = formatPositionThemes(position).slice(0, 5);
  const plans = candidates
    .flatMap((candidate) => candidate.plan_hints.map((hint) => (
      `${candidate.san}: ${formatPlanHint(hint, candidate.facts)}`
    )))
    .filter((value, index, values) => values.indexOf(value) === index)
    .slice(0, 4);

  return (
    <aside className="panel position-brief">
      <header className="position-brief__heading">
        <div><p className="eyebrow">CONHECIMENTO</p><h2>O que importa agora</h2></div>
        <button className="text-button" onClick={onOpen}>Abrir detalhes</button>
      </header>

      <div className="position-brief__stats">
        <div><small>Fase</small><b>{phaseLabel(position.phase)}</b></div>
        <div><small>Xeques</small><b>{position.tactics.checking_moves.length}</b></div>
        <div><small>Capturas</small><b>{position.tactics.capture_count}</b></div>
      </div>

      {repertoire && (
        <article className="repertoire-card">
          <span>{repertoire.side === "white" ? "♙" : "♟"}</span>
          <div>
            <small>REPERTÓRIO · {repertoire.eco_range}</small>
            <h3>{repertoire.name}</h3>
            <p>{repertoire.summary}</p>
          </div>
        </article>
      )}

      <section className="position-brief__section">
        <h3>Planos ligados aos candidatos</h3>
        {plans.length ? (
          <ul>{plans.map((plan) => <li key={plan}>{plan}</li>)}</ul>
        ) : <p>Nenhum plano determinístico adicional foi detectado.</p>}
      </section>

      {repertoire && (
        <section className="position-brief__section position-brief__section--warning">
          <h3>Ideia temática</h3>
          <p>{repertoire.plans_for_us[0]}</p>
          <small>Atenção: {repertoire.opponent_plans[0]}</small>
        </section>
      )}

      {themes.length > 0 && (
        <section className="position-brief__section">
          <h3>Sinais do tabuleiro</h3>
          <div className="position-brief__tags">
            {themes.map((theme) => <span key={theme}>{theme}</span>)}
          </div>
        </section>
      )}
    </aside>
  );
}
