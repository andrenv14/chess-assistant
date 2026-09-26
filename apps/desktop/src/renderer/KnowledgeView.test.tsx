// @vitest-environment jsdom

import type { AnalyzeResponse, PositionFeaturesResponse, RepertoireKnowledge } from "@chess-assistant/contracts";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { KnowledgeView } from "./KnowledgeView";

const FEN = "8/8/8/8/8/8/P7/K6k w - - 0 1";
const EMPTY_PAWNS = {
  doubled_files: [], isolated_squares: [], passed_squares: [], pawn_island_count: 0,
  connected_squares: [], connected_passed_squares: [], backward_squares: [],
};
const POSITION: PositionFeaturesResponse = {
  fen: FEN,
  phase: "endgame",
  side_to_move: "white",
  material: {
    white: { pawns: 1, knights: 0, bishops: 0, rooks: 0, queens: 0, value_cp: 100 },
    black: { pawns: 0, knights: 0, bishops: 0, rooks: 0, queens: 0, value_cp: 0 },
    balance_cp: 100,
  },
  white_pawns: { ...EMPTY_PAWNS, passed_squares: ["a2"], pawn_island_count: 1 },
  black_pawns: EMPTY_PAWNS,
  white_king: { king_square: "a1", castled_position: false, pawn_shield_count: 0, files_without_friendly_pawn: ["a"], attacked_zone_squares: [], enemy_attackers: [] },
  black_king: { king_square: "h1", castled_position: false, pawn_shield_count: 0, files_without_friendly_pawn: ["h"], attacked_zone_squares: [], enemy_attackers: [] },
  strategic: {
    files: { open_files: [], white_semi_open_files: [], black_semi_open_files: [] },
    white_bishop_pair: false, black_bishop_pair: false,
    white_weak_squares: [], black_weak_squares: [],
    white_potential_outposts: [], black_potential_outposts: [],
    white_occupied_outposts: [], black_occupied_outposts: [],
    white_space_count: 0, black_space_count: 0, space_balance: 0,
    white_rooks_on_open_files: [], black_rooks_on_open_files: [],
    white_rooks_on_semi_open_files: [], black_rooks_on_semi_open_files: [],
    white_seventh_rank_rooks: [], black_seventh_rank_rooks: [],
    white_bad_bishops: [], black_bad_bishops: [],
    white_pawn_majority_wings: [], black_pawn_majority_wings: [],
    white_pawn_color_complex: "balanced", black_pawn_color_complex: "balanced",
  },
  endgame: {
    active: true, king_and_pawn_endgame: true, pure_rook_endgame: false,
    opposite_colored_bishop_endgame: false, same_colored_bishop_endgame: false,
    direct_opposition_holder: null, queen_endgame: false, minor_piece_endgame: false,
    rook_and_minor_endgame: false, wrong_bishop_rook_pawn_side: null,
  },
  tactics: {
    side_to_move_in_check: false, legal_move_count: 3, capture_count: 0,
    checking_moves: [], mate_in_one_moves: [], white_pinned: [], black_pinned: [],
    white_undefended_attacked: [], black_undefended_attacked: [],
    white_overloaded: [], black_overloaded: [],
  },
};
const ANALYSIS: AnalyzeResponse = {
  fen: FEN,
  actor: "user",
  advisor_role: "user",
  reply_role: "opponent",
  evaluation_cp: 100,
  evaluation_mate: null,
  candidates: [],
  opening: null,
};
const REPERTOIRE: RepertoireKnowledge = {
  id: "london",
  name: "Sistema London",
  side: "white",
  eco_range: "D00-D02",
  summary: "Estrutura sólida com desenvolvimento natural.",
  plans_for_us: ["Ne5 e ataque na ala do rei"],
  opponent_plans: ["...c5 e ...Qb6"],
  tactical_themes: ["Bxh7+"],
  traps: ["Cuidar de ...Qxb2"],
  sample_lines: ["1.d4 d5 2.Nf3 Nf6 3.Bf4"],
};

let root: Root | null = null;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.querySelector("#root")!);
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
});

describe("KnowledgeView", () => {
  it("keeps the specialized repertoire in the Strategy topic", async () => {
    await act(async () => root?.render(
      <KnowledgeView
        analysis={ANALYSIS}
        candidates={[]}
        fen={FEN}
        onAnalyze={() => undefined}
        onFlip={() => undefined}
        orientation="white"
        position={POSITION}
        repertoire={REPERTOIRE}
      />,
    ));

    expect(document.querySelector(".repertoire-deep-dive")).toBeNull();
    const strategy = Array.from(document.querySelectorAll<HTMLButtonElement>(".knowledge-nav button"))
      .find((button) => button.textContent?.includes("Estratégia"));
    await act(async () => strategy?.click());

    expect(document.querySelector(".repertoire-deep-dive")?.textContent).toContain("Sistema London");
    expect(document.querySelector(".repertoire-deep-dive")?.textContent).toContain("Seus planos");
  });
});
