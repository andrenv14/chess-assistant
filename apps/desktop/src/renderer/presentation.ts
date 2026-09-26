export function formatEvaluation(cp: number | null, mate: number | null): string {
  if (mate !== null) return `${mate < 0 ? "-" : ""}M${Math.abs(mate)}`;
  if (cp === null) return "—";
  return `${cp >= 0 ? "+" : ""}${(cp / 100).toFixed(2)}`;
}

export function formatCentipawns(cp: number | null, mate: number | null): string {
  if (mate !== null) return mate > 0 ? "mate para as brancas" : "mate para as pretas";
  if (cp === null) return "avaliação indisponível";
  const sign = cp > 0 ? "+" : cp < 0 ? "−" : "";
  return `${sign}${Math.abs(cp)} cp`;
}

export function evaluationPerspective(cp: number | null, mate: number | null): string {
  if (mate !== null) return mate > 0 ? "Brancas vencem" : "Pretas vencem";
  if (cp === null) return "Sem avaliação";
  if (Math.abs(cp) < 20) return "Equilíbrio";
  return cp > 0 ? "Brancas melhores" : "Pretas melhores";
}

export function evaluationToWhitePercent(cp: number | null, mate: number | null): number {
  if (mate !== null) return mate > 0 ? 100 : 0;
  if (cp === null) return 50;
  return Math.max(3, Math.min(97, 50 + 50 * (2 / (1 + Math.exp(-cp / 220)) - 1)));
}

export function formatProbability(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}
import type {
  CandidateEvidence,
  MoveFacts,
  PlanHint,
  PositionFeaturesResponse,
} from "@chess-assistant/contracts";

const PLAN_LABELS: Record<PlanHint, string> = {
  deliver_checkmate: "finalizar com xeque-mate",
  force_check_response: "exigir uma resposta ao xeque",
  fork_pieces: "atacar duas peças ao mesmo tempo",
  pin_piece: "cravar uma peça contra o rei",
  relative_pin_piece: "cravar uma peça contra outra de maior valor",
  discovered_attack: "abrir um ataque descoberto",
  attract_piece: "atrair uma peça para uma casa taticamente vulnerável",
  deflect_defender: "desviar um defensor da sua função",
  attack_loose_piece: "atacar uma peça sem defesa",
  capture_or_exchange_material: "capturar ou trocar material",
  secure_king: "colocar o rei em segurança",
  develop_and_coordinate: "desenvolver e coordenar as peças",
  contest_center: "disputar o centro",
  advance_passed_pawn: "avançar o peão passado",
  create_passed_pawn: "criar um peão passado",
  promote_pawn: "promover o peão",
  improve_king_safety: "reforçar a segurança do rei",
  occupy_outpost: "instalar uma peça em um outpost estável",
  create_outpost: "criar uma casa forte para uma peça",
  exploit_open_file: "ativar a torre em uma coluna aberta ou semiaberta",
  activate_rook_on_seventh: "invadir a sétima fileira com a torre",
  pawn_break: "executar uma ruptura de peões",
  gain_space: "ganhar espaço e restringir as peças adversárias",
  improve_piece_activity: "melhorar a atividade de uma peça mal colocada",
  centralize_king: "centralizar o rei no final",
  remove_defender: "remover um defensor importante",
  interfere_attack: "interromper uma linha de ataque",
  connect_rooks: "conectar as torres",
};

function formatSquares(squares: string[]): string {
  if (squares.length < 2) return squares[0] ?? "";
  return `${squares.slice(0, -1).join(", ")} e ${squares.at(-1)}`;
}

export function formatPositionThemes(position: PositionFeaturesResponse): string[] {
  const themes: string[] = [];
  const files = position.strategic.files;
  if (files.open_files.length) {
    themes.push(`Colunas abertas: ${formatSquares(files.open_files)}`);
  }
  if (files.white_semi_open_files.length) {
    themes.push(`Semiabertas para as brancas: ${formatSquares(files.white_semi_open_files)}`);
  }
  if (files.black_semi_open_files.length) {
    themes.push(`Semiabertas para as pretas: ${formatSquares(files.black_semi_open_files)}`);
  }
  if (position.strategic.white_bishop_pair !== position.strategic.black_bishop_pair) {
    themes.push(
      position.strategic.white_bishop_pair
        ? "As brancas têm o par de bispos"
        : "As pretas têm o par de bispos",
    );
  }
  if (position.strategic.white_occupied_outposts.length) {
    themes.push(`Outposts brancos: ${formatSquares(position.strategic.white_occupied_outposts)}`);
  }
  if (position.strategic.black_occupied_outposts.length) {
    themes.push(`Outposts pretos: ${formatSquares(position.strategic.black_occupied_outposts)}`);
  }
  if (Math.abs(position.strategic.space_balance) >= 3) {
    themes.push(
      position.strategic.space_balance > 0
        ? "As brancas têm mais espaço útil"
        : "As pretas têm mais espaço útil",
    );
  }
  if (position.strategic.white_bad_bishops.length) {
    themes.push(`Bispo branco restringido: ${formatSquares(position.strategic.white_bad_bishops)}`);
  }
  if (position.strategic.black_bad_bishops.length) {
    themes.push(`Bispo preto restringido: ${formatSquares(position.strategic.black_bad_bishops)}`);
  }
  if (position.strategic.white_rooks_on_open_files.length) {
    themes.push(`Torres brancas em colunas abertas: ${formatSquares(position.strategic.white_rooks_on_open_files)}`);
  }
  if (position.strategic.black_rooks_on_open_files.length) {
    themes.push(`Torres pretas em colunas abertas: ${formatSquares(position.strategic.black_rooks_on_open_files)}`);
  }
  if (position.strategic.white_pawn_majority_wings.length) {
    const wings = position.strategic.white_pawn_majority_wings.map((wing) =>
      wing === "queenside" ? "ala da dama" : "ala do rei");
    themes.push(`Maioria branca na ${wings.join(" e na ")}`);
  }
  if (position.strategic.black_pawn_majority_wings.length) {
    const wings = position.strategic.black_pawn_majority_wings.map((wing) =>
      wing === "queenside" ? "ala da dama" : "ala do rei");
    themes.push(`Maioria preta na ${wings.join(" e na ")}`);
  }
  if (position.white_pawns.pawn_island_count > 1) {
    themes.push(`Brancas: ${position.white_pawns.pawn_island_count} ilhas de peões`);
  }
  if (position.black_pawns.pawn_island_count > 1) {
    themes.push(`Pretas: ${position.black_pawns.pawn_island_count} ilhas de peões`);
  }
  if (position.white_pawns.connected_passed_squares.length) {
    themes.push(
      `Passados conectados brancos: ${formatSquares(position.white_pawns.connected_passed_squares)}`,
    );
  }
  if (position.black_pawns.connected_passed_squares.length) {
    themes.push(
      `Passados conectados pretos: ${formatSquares(position.black_pawns.connected_passed_squares)}`,
    );
  }
  if (position.white_pawns.backward_squares.length) {
    themes.push(`Peões atrasados brancos: ${formatSquares(position.white_pawns.backward_squares)}`);
  }
  if (position.black_pawns.backward_squares.length) {
    themes.push(`Peões atrasados pretos: ${formatSquares(position.black_pawns.backward_squares)}`);
  }
  if (position.strategic.white_pawn_color_complex !== "balanced") {
    themes.push(`Peões brancos em casas ${position.strategic.white_pawn_color_complex === "light" ? "claras" : "escuras"}`);
  }
  if (position.strategic.black_pawn_color_complex !== "balanced") {
    themes.push(`Peões pretos em casas ${position.strategic.black_pawn_color_complex === "light" ? "claras" : "escuras"}`);
  }

  if (position.endgame.king_and_pawn_endgame) themes.push("Final de reis e peões");
  if (position.endgame.pure_rook_endgame) themes.push("Final puro de torres");
  if (position.endgame.opposite_colored_bishop_endgame) {
    themes.push("Final de bispos de cores opostas");
  }
  if (position.endgame.same_colored_bishop_endgame) {
    themes.push("Final de bispos da mesma cor");
  }
  if (position.endgame.direct_opposition_holder) {
    themes.push(
      `Oposição direta: ${position.endgame.direct_opposition_holder === "white" ? "brancas" : "pretas"}`,
    );
  }
  if (position.endgame.queen_endgame) themes.push("Final puro de damas");
  if (position.endgame.minor_piece_endgame) themes.push("Final de peças menores");
  if (position.endgame.rook_and_minor_endgame) themes.push("Final de torres e peças menores");
  if (position.endgame.wrong_bishop_rook_pawn_side) {
    themes.push(`Bispo errado e peão de torre: ${position.endgame.wrong_bishop_rook_pawn_side === "white" ? "brancas" : "pretas"}`);
  }
  if (position.tactics.white_overloaded.length) {
    themes.push(`Peças brancas sobrecarregadas: ${formatSquares(position.tactics.white_overloaded)}`);
  }
  if (position.tactics.black_overloaded.length) {
    themes.push(`Peças pretas sobrecarregadas: ${formatSquares(position.tactics.black_overloaded)}`);
  }

  if (position.white_king.enemy_attackers.length >= 2) {
    themes.push(`Pressão sobre o rei branco: ${position.white_king.enemy_attackers.length} atacantes`);
  }
  if (position.black_king.enemy_attackers.length >= 2) {
    themes.push(`Pressão sobre o rei preto: ${position.black_king.enemy_attackers.length} atacantes`);
  }
  return themes;
}

export function formatPlanHint(hint: PlanHint, facts?: MoveFacts): string {
  if (hint === "fork_pieces" && facts?.fork_targets.length) {
    return `garfo em ${formatSquares(facts.fork_targets)}`;
  }
  if (hint === "pin_piece" && facts?.newly_pinned_targets.length) {
    return `cravar ${formatSquares(facts.newly_pinned_targets)} contra o rei`;
  }
  if (hint === "relative_pin_piece" && facts?.newly_relative_pinned_targets.length) {
    return `cravar relativamente ${formatSquares(facts.newly_relative_pinned_targets)}`;
  }
  if (hint === "discovered_attack" && facts?.discovered_attack_targets.length) {
    return `abrir ataque descoberto contra ${formatSquares(facts.discovered_attack_targets)}`;
  }
  if (hint === "attract_piece" && facts?.attraction_targets.length) {
    return `atrair uma peça para ${formatSquares(facts.attraction_targets)} na variante calculada`;
  }
  if (hint === "deflect_defender" && facts?.deflection_targets.length) {
    return `desviar o defensor de ${formatSquares(facts.deflection_targets)} na variante calculada`;
  }
  if (hint === "attack_loose_piece" && facts?.newly_attacked_undefended_targets.length) {
    return `atacar ${formatSquares(facts.newly_attacked_undefended_targets)} sem defesa`;
  }
  if (hint === "remove_defender" && facts?.removed_defender_targets.length) {
    return `remover o defensor de ${formatSquares(facts.removed_defender_targets)}`;
  }
  if (hint === "interfere_attack" && facts?.interfered_attack_targets.length) {
    return `interromper o ataque contra ${formatSquares(facts.interfered_attack_targets)}`;
  }
  return PLAN_LABELS[hint];
}

export function formatCandidateIdea(candidate: CandidateEvidence): string {
  const ideas = candidate.plan_hints
    .slice(0, 2)
    .map((hint) => formatPlanHint(hint, candidate.facts));
  const reply = candidate.opponent_replies[0];
  if (ideas.length && reply) {
    return `Ideia: ${ideas.join(" e ")}. Resposta principal: ${reply.san}.`;
  }
  if (ideas.length) return `Ideia: ${ideas.join(" e ")}.`;
  if (reply) return `A linha principal espera ${reply.san} como resposta.`;
  return "A prioridade é melhorar a posição sem conceder uma resposta forçante.";
}
