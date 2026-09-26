import type {
  AnalyzeResponse,
  CandidateEvidence,
  PositionFeaturesResponse,
  RepertoireKnowledge,
} from "@chess-assistant/contracts";
import { useMemo, useState } from "react";

import { ChessBoard } from "./ChessBoard";
import { developmentMetric, kingSafetyMetric, pawnHealthMetric } from "./knowledge";
import { formatEvaluation, formatPlanHint, formatPositionThemes } from "./presentation";

type KnowledgeTopic = "overview" | "tactics" | "strategy" | "endgame";
type SideFocus = "both" | "white" | "black";

interface KnowledgeViewProps {
  analysis: AnalyzeResponse | null;
  candidates: CandidateEvidence[];
  fen: string;
  onAnalyze: () => void;
  onFlip: () => void;
  orientation: "white" | "black";
  position: PositionFeaturesResponse | null;
  repertoire: RepertoireKnowledge | null;
}

function Meter({ label, score }: { label: string; score: number }) {
  return (
    <div className="knowledge-meter" aria-label={`${label}: ${score}%`}>
      <div><span>{label}</span><b>{score}%</b></div>
      <div className="knowledge-meter__track"><i style={{ width: `${score}%` }} /></div>
    </div>
  );
}

function FactList({ items, empty }: { items: string[]; empty: string }) {
  if (!items.length) return <p className="knowledge-card__empty">{empty}</p>;
  return <div className="knowledge-facts">{items.map((item) => <span key={item}>{item}</span>)}</div>;
}

function sideName(side: "white" | "black"): string {
  return side === "white" ? "Brancas" : "Pretas";
}

function squares(label: string, values: string[]): string | null {
  return values.length ? `${label}: ${values.join(", ")}` : null;
}

function RepertoireDeepDive({ repertoire }: { repertoire: RepertoireKnowledge }) {
  return (
    <article className="panel repertoire-deep-dive knowledge-card--wide">
      <header>
        <div><p className="eyebrow">REPERTÓRIO ESPECIALIZADO · {repertoire.eco_range}</p><h3>{repertoire.name}</h3></div>
        <span>{repertoire.side === "white" ? "Brancas" : "Pretas"}</span>
      </header>
      <p className="repertoire-deep-dive__summary">{repertoire.summary}</p>
      <div className="repertoire-deep-dive__grid">
        <section><h4>Seus planos</h4><ol>{repertoire.plans_for_us.map((item) => <li key={item}>{item}</li>)}</ol></section>
        <section><h4>Planos do adversário</h4><ol>{repertoire.opponent_plans.map((item) => <li key={item}>{item}</li>)}</ol></section>
        <section><h4>Temas táticos</h4><ul>{repertoire.tactical_themes.map((item) => <li key={item}>{item}</li>)}</ul></section>
        <section><h4>Armadilhas e cuidados</h4><ul>{repertoire.traps.map((item) => <li key={item}>{item}</li>)}</ul></section>
      </div>
      <footer><b>Linhas-modelo</b>{repertoire.sample_lines.map((line) => <code key={line}>{line}</code>)}</footer>
    </article>
  );
}

export function KnowledgeView({
  analysis,
  candidates,
  fen,
  onAnalyze,
  onFlip,
  orientation,
  position,
  repertoire,
}: KnowledgeViewProps) {
  const [topic, setTopic] = useState<KnowledgeTopic>("overview");
  const [sideFocus, setSideFocus] = useState<SideFocus>("both");
  const themes = useMemo(() => position ? formatPositionThemes(position) : [], [position]);

  if (!position || !analysis || position.fen !== fen || analysis.fen !== fen) {
    return (
      <section className="panel knowledge-empty">
        <span aria-hidden="true">♜</span>
        <p className="eyebrow">CENTRO DE CONHECIMENTO</p>
        <h2>Analise a posição para abrir o diagnóstico completo</h2>
        <p>Desenvolvimento, segurança, estrutura, tática, estratégia e finais aparecerão aqui com dados do tabuleiro e do Stockfish.</p>
        <button className="button" onClick={onAnalyze}>Analisar esta posição</button>
      </section>
    );
  }

  const whiteDevelopment = developmentMetric(fen, "w", position.white_king.castled_position);
  const blackDevelopment = developmentMetric(fen, "b", position.black_king.castled_position);
  const whiteSafety = kingSafetyMetric(position.white_king);
  const blackSafety = kingSafetyMetric(position.black_king);
  const whitePawns = pawnHealthMetric(position.white_pawns);
  const blackPawns = pawnHealthMetric(position.black_pawns);
  const showWhite = sideFocus !== "black";
  const showBlack = sideFocus !== "white";
  const bestMove = analysis.candidates[0];

  const strategicFacts = [
    squares("Colunas abertas", position.strategic.files.open_files),
    squares("Semiabertas brancas", position.strategic.files.white_semi_open_files),
    squares("Semiabertas pretas", position.strategic.files.black_semi_open_files),
    squares("Casas fracas brancas", position.strategic.white_weak_squares),
    squares("Casas fracas pretas", position.strategic.black_weak_squares),
    squares("Outposts brancos", position.strategic.white_occupied_outposts),
    squares("Outposts pretos", position.strategic.black_occupied_outposts),
  ].filter((item): item is string => item !== null);

  return (
    <section className="knowledge-page">
      <header className="panel knowledge-hero">
        <div>
          <p className="eyebrow">CENTRO DE CONHECIMENTO</p>
          <h2>{analysis.opening?.name ?? `Diagnóstico de ${position.phase === "opening" ? "abertura" : position.phase === "middlegame" ? "meio-jogo" : "final"}`}</h2>
          <p>Leitura determinística do tabuleiro, conectada às linhas que o Stockfish realmente calculou.</p>
        </div>
        <div className="knowledge-hero__score">
          <small>Avaliação</small>
          <strong>{formatEvaluation(analysis.evaluation_cp, analysis.evaluation_mate)}</strong>
          <span>{bestMove ? `Principal: ${bestMove.san}` : "Posição terminal"}</span>
        </div>
      </header>

      <nav className="panel knowledge-nav" aria-label="Tópicos de conhecimento">
        {([
          ["overview", "Visão geral", "◎"],
          ["tactics", "Tática", "⚡"],
          ["strategy", "Estratégia", "◇"],
          ["endgame", "Final", "♔"],
        ] as const).map(([value, label, icon]) => (
          <button
            className={topic === value ? "knowledge-nav__active" : ""}
            key={value}
            onClick={() => setTopic(value)}
          >
            <span>{icon}</span><b>{label}</b>
          </button>
        ))}
      </nav>

      <div className="knowledge-layout">
        <aside className="panel knowledge-board">
          <div className="panel-heading">
            <div><p className="eyebrow">MAPA DA POSIÇÃO</p><h3>{sideName(position.side_to_move)} jogam</h3></div>
            <button className="icon-button" onClick={onFlip} aria-label="Girar tabuleiro">↻</button>
          </div>
          <ChessBoard fen={fen} orientation={orientation} moveUci={bestMove?.uci ?? null} />
          <div className="knowledge-board__footer">
            <span>{position.tactics.legal_move_count} lances legais</span>
            <span>{position.tactics.capture_count} capturas</span>
            <span>{position.phase === "opening" ? "Abertura" : position.phase === "middlegame" ? "Meio-jogo" : "Final"}</span>
          </div>
        </aside>

        <div className="knowledge-content">
          {topic === "overview" && (
            <>
              <div className="knowledge-toolbar">
                <div><p className="eyebrow">DIAGNÓSTICO COMPARADO</p><h3>Desenvolvimento, rei e estrutura</h3></div>
                <div className="segmented segmented--compact">
                  <button className={sideFocus === "both" ? "segmented__active" : ""} onClick={() => setSideFocus("both")}>Ambos</button>
                  <button className={sideFocus === "white" ? "segmented__active" : ""} onClick={() => setSideFocus("white")}>Brancas</button>
                  <button className={sideFocus === "black" ? "segmented__active" : ""} onClick={() => setSideFocus("black")}>Pretas</button>
                </div>
              </div>
              <div className="knowledge-side-grid">
                {showWhite && (
                  <article className="panel knowledge-side-card knowledge-side-card--white">
                    <header><span>♙</span><div><p className="eyebrow">BRANCAS</p><h3>Estado das peças</h3></div></header>
                    <Meter label={`Desenvolvimento · ${whiteDevelopment.label}`} score={whiteDevelopment.score} />
                    <Meter label={`Segurança do rei · ${whiteSafety.label}`} score={whiteSafety.score} />
                    <Meter label={`Estrutura · ${whitePawns.label}`} score={whitePawns.score} />
                    <dl>
                      <div><dt>Peças menores ativadas</dt><dd>{whiteDevelopment.developedMinors}/4</dd></div>
                      <div><dt>Escudo do rei</dt><dd>{position.white_king.pawn_shield_count}/3</dd></div>
                      <div><dt>Ilhas de peões</dt><dd>{position.white_pawns.pawn_island_count}</dd></div>
                    </dl>
                  </article>
                )}
                {showBlack && (
                  <article className="panel knowledge-side-card knowledge-side-card--black">
                    <header><span>♟</span><div><p className="eyebrow">PRETAS</p><h3>Estado das peças</h3></div></header>
                    <Meter label={`Desenvolvimento · ${blackDevelopment.label}`} score={blackDevelopment.score} />
                    <Meter label={`Segurança do rei · ${blackSafety.label}`} score={blackSafety.score} />
                    <Meter label={`Estrutura · ${blackPawns.label}`} score={blackPawns.score} />
                    <dl>
                      <div><dt>Peças menores ativadas</dt><dd>{blackDevelopment.developedMinors}/4</dd></div>
                      <div><dt>Escudo do rei</dt><dd>{position.black_king.pawn_shield_count}/3</dd></div>
                      <div><dt>Ilhas de peões</dt><dd>{position.black_pawns.pawn_island_count}</dd></div>
                    </dl>
                  </article>
                )}
              </div>
              <article className="panel knowledge-card knowledge-card--wide">
                <div><p className="eyebrow">LEITURA RÁPIDA</p><h3>O que define esta posição</h3></div>
                <FactList items={themes} empty="Nenhum desequilíbrio estrutural marcante foi detectado." />
              </article>
            </>
          )}

          {topic === "tactics" && (
            <>
              <div className="knowledge-stat-grid">
                <article className="panel knowledge-stat"><span>+</span><b>{position.tactics.checking_moves.length}</b><small>xeques disponíveis</small></article>
                <article className="panel knowledge-stat"><span>#</span><b>{position.tactics.mate_in_one_moves.length}</b><small>mates em um</small></article>
                <article className="panel knowledge-stat"><span>×</span><b>{position.tactics.capture_count}</b><small>capturas legais</small></article>
                <article className="panel knowledge-stat"><span>!</span><b>{position.tactics.white_undefended_attacked.length + position.tactics.black_undefended_attacked.length}</b><small>peças soltas sob ataque</small></article>
                <article className="panel knowledge-stat"><span>⇄</span><b>{position.tactics.white_overloaded.length + position.tactics.black_overloaded.length}</b><small>peças sobrecarregadas</small></article>
              </div>
              <article className="panel knowledge-card">
                <p className="eyebrow">LANCES FORÇANTES</p><h3>Xeques e mates verificados</h3>
                <FactList
                  items={[
                    ...position.tactics.mate_in_one_moves.map((move) => `Mate: ${move}`),
                    ...position.tactics.checking_moves.map((move) => `Xeque: ${move}`),
                  ]}
                  empty="Não há xeque imediato nem mate em um nesta posição."
                />
              </article>
              <article className="panel knowledge-card knowledge-card--wide">
                <p className="eyebrow">TEMAS NOS MELHORES LANCES</p><h3>O que cada candidato tenta explorar</h3>
                <div className="knowledge-candidates">
                  {analysis.candidates.map((move, index) => {
                    const evidence = candidates[index];
                    return (
                      <div key={move.uci}>
                        <span className="rank">{index + 1}</span>
                        <strong>{move.san}</strong>
                        <small>{formatEvaluation(move.score_cp, move.mate)}</small>
                        <div>{evidence?.plan_hints.map((hint) => <em key={hint}>{formatPlanHint(hint, evidence.facts)}</em>)}</div>
                      </div>
                    );
                  })}
                </div>
              </article>
            </>
          )}

          {topic === "strategy" && (
            <>
              <article className="panel knowledge-card knowledge-card--wide">
                <p className="eyebrow">MAPA ESTRATÉGICO</p><h3>Casas, colunas e pontos de entrada</h3>
                <FactList items={strategicFacts} empty="A posição ainda não apresenta alvos estratégicos fortes." />
              </article>
              <div className="knowledge-side-grid">
                <article className="panel knowledge-card">
                  <p className="eyebrow">ESPAÇO E PEÇAS</p><h3>Balanço de atividade</h3>
                  <Meter label="Espaço das brancas" score={Math.max(0, Math.min(100, 50 + position.strategic.space_balance * 5))} />
                  <Meter label="Espaço das pretas" score={Math.max(0, Math.min(100, 50 - position.strategic.space_balance * 5))} />
                  <FactList items={[
                    position.strategic.white_bishop_pair ? "Brancas conservam o par de bispos" : "",
                    position.strategic.black_bishop_pair ? "Pretas conservam o par de bispos" : "",
                    squares("Bispos brancos restringidos", position.strategic.white_bad_bishops) ?? "",
                    squares("Bispos pretos restringidos", position.strategic.black_bad_bishops) ?? "",
                    squares("Peões brancos atrasados", position.white_pawns.backward_squares) ?? "",
                    squares("Peões pretos atrasados", position.black_pawns.backward_squares) ?? "",
                    position.strategic.white_pawn_color_complex !== "balanced" ? `Peões brancos em casas ${position.strategic.white_pawn_color_complex === "light" ? "claras" : "escuras"}` : "",
                    position.strategic.black_pawn_color_complex !== "balanced" ? `Peões pretos em casas ${position.strategic.black_pawn_color_complex === "light" ? "claras" : "escuras"}` : "",
                  ].filter(Boolean)} empty="Sem desequilíbrio claro de peças menores." />
                </article>
                <article className="panel knowledge-card">
                  <p className="eyebrow">PLANOS DO STOCKFISH</p><h3>Ideias ligadas às variantes</h3>
                  <FactList
                    items={candidates.flatMap((candidate) => candidate.plan_hints.map((hint) => `${candidate.san}: ${formatPlanHint(hint, candidate.facts)}`))}
                    empty="A linha calculada não produziu um plano determinístico adicional."
                  />
                </article>
              </div>
              {repertoire && <RepertoireDeepDive repertoire={repertoire} />}
            </>
          )}

          {topic === "endgame" && (
            <>
              <article className="panel knowledge-card knowledge-card--wide knowledge-endgame">
                <span aria-hidden="true">♔</span>
                <div><p className="eyebrow">DIAGNÓSTICO DE FINAL</p><h3>{position.endgame.active ? "Princípios de final ativos" : "A posição ainda não é um final"}</h3>
                  <p>{position.endgame.active ? "A atividade dos reis, peões passados e tipo de material já devem orientar a escolha." : "Use esta área para acompanhar a transição; ela será ativada quando o material atingir critérios estritos de final."}</p>
                </div>
              </article>
              <div className="knowledge-stat-grid">
                <article className="panel knowledge-stat"><span>♙</span><b>{position.white_pawns.passed_squares.length}</b><small>passados brancos</small></article>
                <article className="panel knowledge-stat"><span>♟</span><b>{position.black_pawns.passed_squares.length}</b><small>passados pretos</small></article>
                <article className="panel knowledge-stat"><span>↔</span><b>{position.endgame.direct_opposition_holder ? sideName(position.endgame.direct_opposition_holder) : "—"}</b><small>oposição direta</small></article>
              </div>
              <article className="panel knowledge-card knowledge-card--wide">
                <p className="eyebrow">TIPO DE FINAL</p><h3>Características reconhecidas</h3>
                <FactList items={[
                  position.endgame.king_and_pawn_endgame ? "Final de reis e peões" : "",
                  position.endgame.pure_rook_endgame ? "Final puro de torres" : "",
                  position.endgame.opposite_colored_bishop_endgame ? "Bispos de cores opostas" : "",
                  position.endgame.same_colored_bishop_endgame ? "Bispos da mesma cor" : "",
                  position.endgame.queen_endgame ? "Final puro de damas" : "",
                  position.endgame.minor_piece_endgame ? "Final de peças menores" : "",
                  position.endgame.rook_and_minor_endgame ? "Final de torres e peças menores" : "",
                  position.endgame.wrong_bishop_rook_pawn_side ? `Bispo errado e peão de torre: ${sideName(position.endgame.wrong_bishop_rook_pawn_side)}` : "",
                ].filter(Boolean)} empty="Nenhuma categoria teórica estrita foi identificada." />
              </article>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
