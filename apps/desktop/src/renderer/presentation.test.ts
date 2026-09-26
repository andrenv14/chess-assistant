import { describe, expect, it } from "vitest";
import type { PositionFeaturesResponse } from "@chess-assistant/contracts";

import {
  evaluationPerspective,
  evaluationToWhitePercent,
  formatCandidateIdea,
  formatCentipawns,
  formatEvaluation,
  formatPlanHint,
  formatPositionThemes,
  formatProbability,
} from "./presentation";

const POSITION_FEATURES: PositionFeaturesResponse = {
  fen: "8/8/8/8/8/8/P7/K6k w - - 0 1",
  phase: "endgame",
  side_to_move: "white",
  material: {
    white: { pawns: 1, knights: 0, bishops: 0, rooks: 0, queens: 0, value_cp: 100 },
    black: { pawns: 0, knights: 0, bishops: 0, rooks: 0, queens: 0, value_cp: 0 },
    balance_cp: 100,
  },
  white_pawns: {
    doubled_files: [],
    isolated_squares: [],
    passed_squares: ["a2"],
    pawn_island_count: 1,
    connected_squares: [],
    connected_passed_squares: [],
    backward_squares: [],
  },
  black_pawns: {
    doubled_files: [],
    isolated_squares: [],
    passed_squares: [],
    pawn_island_count: 1,
    connected_squares: [],
    connected_passed_squares: [],
    backward_squares: [],
  },
  white_king: {
    king_square: "a1",
    castled_position: false,
    pawn_shield_count: 0,
    files_without_friendly_pawn: ["a", "b"],
    attacked_zone_squares: [],
    enemy_attackers: [],
  },
  black_king: {
    king_square: "h1",
    castled_position: false,
    pawn_shield_count: 0,
    files_without_friendly_pawn: ["g", "h"],
    attacked_zone_squares: [],
    enemy_attackers: [],
  },
  strategic: {
    files: { open_files: [], white_semi_open_files: [], black_semi_open_files: [] },
    white_bishop_pair: false,
    black_bishop_pair: false,
    white_weak_squares: [],
    black_weak_squares: [],
    white_potential_outposts: [],
    black_potential_outposts: [],
    white_occupied_outposts: [],
    black_occupied_outposts: [],
    white_space_count: 0,
    black_space_count: 0,
    space_balance: 0,
    white_rooks_on_open_files: [],
    black_rooks_on_open_files: [],
    white_rooks_on_semi_open_files: [],
    black_rooks_on_semi_open_files: [],
    white_seventh_rank_rooks: [],
    black_seventh_rank_rooks: [],
    white_bad_bishops: [],
    black_bad_bishops: [],
    white_pawn_majority_wings: [],
    black_pawn_majority_wings: [],
    white_pawn_color_complex: "balanced",
    black_pawn_color_complex: "balanced",
  },
  endgame: {
    active: true,
    king_and_pawn_endgame: true,
    pure_rook_endgame: false,
    opposite_colored_bishop_endgame: false,
    same_colored_bishop_endgame: false,
    direct_opposition_holder: null,
    queen_endgame: false,
    minor_piece_endgame: false,
    rook_and_minor_endgame: false,
    wrong_bishop_rook_pawn_side: null,
  },
  tactics: {
    side_to_move_in_check: false,
    legal_move_count: 3,
    capture_count: 0,
    checking_moves: [],
    mate_in_one_moves: [],
    white_pinned: [],
    black_pinned: [],
    white_undefended_attacked: [],
    black_undefended_attacked: [],
    white_overloaded: [],
    black_overloaded: [],
  },
};

describe("formatEvaluation", () => {
  it("formats centipawns from White's perspective", () => {
    expect(formatEvaluation(125, null)).toBe("+1.25");
    expect(formatEvaluation(-40, null)).toBe("-0.40");
  });

  it("preserves the mate direction", () => {
    expect(formatEvaluation(null, 3)).toBe("M3");
    expect(formatEvaluation(null, -2)).toBe("-M2");
  });
});

describe("centipawn perspective", () => {
  it("keeps Stockfish's standard white point of view explicit", () => {
    expect(formatCentipawns(73, null)).toBe("+73 cp");
    expect(evaluationPerspective(73, null)).toBe("Brancas melhores");
    expect(formatCentipawns(-41, null)).toBe("−41 cp");
    expect(evaluationPerspective(-41, null)).toBe("Pretas melhores");
  });
});

describe("formatCandidateIdea", () => {
  it("joins a verified plan with the principal reply", () => {
    expect(formatCandidateIdea({
      rank: 1,
      uci: "e2e4",
      san: "e4",
      facts: { occupies_center: true } as never,
      plan_hints: ["contest_center"],
      principal_variation_san: ["e4", "e5"],
      opponent_replies: [{
        uci: "e7e5",
        san: "e5",
        score_cp: 20,
        mate: null,
        pv_uci: ["e7e5"],
        pv_san: ["e5"],
      }],
    })).toBe("Ideia: disputar o centro. Resposta principal: e5.");
  });
});

describe("evaluationToWhitePercent", () => {
  it("uses the middle for an unavailable or equal evaluation", () => {
    expect(evaluationToWhitePercent(null, null)).toBe(50);
    expect(evaluationToWhitePercent(0, null)).toBe(50);
  });

  it("caps decisive evaluations so both colors remain visible", () => {
    expect(evaluationToWhitePercent(100_000, null)).toBe(97);
    expect(evaluationToWhitePercent(-100_000, null)).toBe(3);
  });
});

describe("formatProbability", () => {
  it("formats a model probability without fake precision", () => {
    expect(formatProbability(0.456)).toBe("46%");
    expect(formatProbability(null)).toBe("—");
  });
});

describe("formatPlanHint", () => {
  it("turns evidence tags into concise Portuguese labels", () => {
    expect(formatPlanHint("secure_king")).toBe("colocar o rei em segurança");
    expect(formatPlanHint("advance_passed_pawn")).toBe("avançar o peão passado");
    expect(formatPlanHint("fork_pieces")).toBe("atacar duas peças ao mesmo tempo");
    expect(formatPlanHint("deliver_checkmate")).toBe("finalizar com xeque-mate");
  });

  it("includes deterministic target squares for tactical motifs", () => {
    const facts = {
      is_capture: false,
      captured_piece: null,
      gives_check: true,
      gives_checkmate: false,
      fork_targets: ["d7", "f7"],
      newly_pinned_targets: ["c6"],
      newly_relative_pinned_targets: ["d5"],
      discovered_attack_targets: ["a8"],
      attraction_targets: ["h8"],
      deflection_targets: ["d7"],
      newly_attacked_undefended_targets: ["d6"],
      is_castling: false,
      promotion_piece: null,
      develops_minor_piece: false,
      occupies_center: false,
      moves_passed_pawn: false,
      creates_passed_pawn: false,
      improves_pawn_shield: false,
      occupies_outpost: false,
      creates_outpost: false,
      rook_to_open_file: false,
      rook_to_seventh_rank: false,
      pawn_break: false,
      space_gain: 0,
      mobility_gain: 0,
      centralizes_king: false,
      removed_defender_targets: ["f6"],
      interfered_attack_targets: ["a1"],
      connects_rooks: false,
    };

    expect(formatPlanHint("fork_pieces", facts)).toBe("garfo em d7 e f7");
    expect(formatPlanHint("pin_piece", facts)).toBe("cravar c6 contra o rei");
    expect(formatPlanHint("relative_pin_piece", facts)).toBe("cravar relativamente d5");
    expect(formatPlanHint("discovered_attack", facts)).toBe(
      "abrir ataque descoberto contra a8",
    );
    expect(formatPlanHint("attract_piece", facts)).toBe(
      "atrair uma peça para h8 na variante calculada",
    );
    expect(formatPlanHint("deflect_defender", facts)).toBe(
      "desviar o defensor de d7 na variante calculada",
    );
    expect(formatPlanHint("attack_loose_piece", facts)).toBe("atacar d6 sem defesa");
    expect(formatPlanHint("remove_defender", facts)).toBe("remover o defensor de f6");
    expect(formatPlanHint("interfere_attack", facts)).toBe("interromper o ataque contra a1");
  });
});

describe("formatPositionThemes", () => {
  it("turns strategic and endgame evidence into factual Portuguese labels", () => {
    const position: PositionFeaturesResponse = {
      ...POSITION_FEATURES,
      white_pawns: {
        ...POSITION_FEATURES.white_pawns,
        pawn_island_count: 2,
        connected_passed_squares: ["d5", "e5"],
      },
      white_king: {
        ...POSITION_FEATURES.white_king,
        enemy_attackers: ["c5", "h4"],
      },
      strategic: {
        ...POSITION_FEATURES.strategic,
        files: {
          open_files: ["b"],
          white_semi_open_files: ["d"],
          black_semi_open_files: ["a"],
        },
        white_bishop_pair: false,
        black_bishop_pair: true,
      },
      endgame: {
        ...POSITION_FEATURES.endgame,
        king_and_pawn_endgame: false,
        pure_rook_endgame: true,
        direct_opposition_holder: "white",
      },
    };

    expect(formatPositionThemes(position)).toEqual([
      "Colunas abertas: b",
      "Semiabertas para as brancas: d",
      "Semiabertas para as pretas: a",
      "As pretas têm o par de bispos",
      "Brancas: 2 ilhas de peões",
      "Passados conectados brancos: d5 e e5",
      "Final puro de torres",
      "Oposição direta: brancas",
      "Pressão sobre o rei branco: 2 atacantes",
    ]);
  });
});
