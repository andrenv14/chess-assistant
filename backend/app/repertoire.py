"""Focused opening repertoire knowledge for the first portfolio release.

Opening names and move recognition continue to come from the bundled CC0
Lichess chess-openings catalogue. This module adds a deliberately small,
reviewable layer of human chess ideas for the three systems selected by the
user. It is local, deterministic and fast enough to enrich every analysis.
"""

import chess

from app.models import RepertoireKnowledge

REPERTOIRES: dict[str, RepertoireKnowledge] = {
    "london": RepertoireKnowledge(
        id="london",
        name="Sistema London",
        side="white",
        eco_range="A45–A48 / D00–D02",
        summary=(
            "Estrutura sólida com d4, Bf4, Nf3, e3 e c3; a ordem dos lances deve "
            "mudar conforme a pressão preta sobre d4, b2 e o bispo de f4."
        ),
        plans_for_us=[
            "Completar Nf3, e3, c3 e Nbd2 sem bloquear o bispo de f1.",
            "Instalar Ne5 e apoiar o posto com Ndf3 ou f4 quando a posição permitir.",
            "Preparar e4; contra um centro estável, usar Qb3 para pressionar b7.",
            "Recuar o bispo por g3 ou e3 antes de permitir ...Nh5 com ganho de tempo.",
        ],
        opponent_plans=[
            "Atacar o centro com ...c5 e ...Qb6, mirando simultaneamente d4 e b2.",
            "Trocar o bispo de casas escuras com ...Bd6 ou persegui-lo com ...Nh5.",
            "Preparar ...e5 para questionar d4 e liberar o bispo de c8.",
        ],
        tactical_themes=[
            "Bxh7+ só funciona quando o rei fica sem casas e a dama chega a h5; não é automático.",
            "Ne5 pode criar ataques em c6, f7 e g6, especialmente com a dama em h5 ou b3.",
            "Qb3 pressiona b7, mas a resposta ...Qb6 pode transformar b2 no alvo mais urgente.",
        ],
        traps=[
            "Poisoned Pawn: após ...Qb6 e Nc3, capturar b2 pode prender a dama, "
            "mas a linha deve ser calculada.",
            "Evite Bxb8 automático: entregar o bispo do London por uma torre "
            "pode perder o controle de e5.",
        ],
        sample_lines=[
            "1.d4 d5 2.Nf3 Nf6 3.Bf4 e6 4.e3 Bd6 5.Bg3 O-O 6.Nbd2",
            "1.d4 Nf6 2.Nf3 g6 3.Bf4 Bg7 4.e3 d6 5.Be2 O-O 6.O-O",
            "1.d4 d5 2.Bf4 c5 3.e3 Nc6 4.Nf3 Nf6 5.Nbd2",
        ],
    ),
    "sicilian_e6": RepertoireKnowledge(
        id="sicilian_e6",
        name="Siciliana com ...e6 — Kan e Taimanov",
        side="black",
        eco_range="B40–B49",
        summary=(
            "Repertório flexível contra 1.e4: ...c5 ataca d4 e ...e6 mantém abertas "
            "as escolhas entre ...a6 (Kan) e ...Nc6 (Taimanov)."
        ),
        plans_for_us=[
            "Na Kan, jogar ...a6, ...Qc7 e ...b5 somente quando a expansão não abandonar e6.",
            "Na Taimanov, desenvolver ...Nc6 e ...Qc7, buscando ...Nf6 e a "
            "ruptura libertadora ...d5.",
            "Contra o Maróczy com c4, pressionar c4/e4 e preparar ...b6, ...Bb7 ou ...d5.",
            "Escolher ...d6 ou ...d5 pela posição; ...d5 em boas condições "
            "iguala o centro de imediato.",
        ],
        opponent_plans=[
            "Montar o Maróczy com c4 para reduzir ...d5 e limitar o cavalo de b8.",
            "Desenvolver Nc3, Be3, Qd2 e rocar grande para atacar na ala do rei.",
            "Usar Bd3 e f4 para ganhar espaço antes que as pretas concluam o desenvolvimento.",
        ],
        tactical_themes=[
            "A coluna c semiaberta é o principal eixo para ...Qc7, ...Rc8 e pressão em c2/c3.",
            "A ruptura ...d5 pode vir com tempo sobre o cavalo de d4 ou abrir a dama em c7.",
            "...Nxd4 é tático quando o cavalo de c3 está cravado ou a recaptura "
            "expõe a dama branca.",
        ],
        traps=[
            "Na ala da dama, ...b5 cedo demais permite e5 ou Bxb5; confirme o "
            "centro antes de expandir.",
            "Na Taimanov, Qg4 pode atacar g7 e e6 ao mesmo tempo; ...Nf6 nem "
            "sempre resolve as duas ameaças.",
        ],
        sample_lines=[
            "1.e4 c5 2.Nf3 e6 3.d4 cxd4 4.Nxd4 a6 5.Bd3 Nf6 6.O-O Qc7",
            "1.e4 c5 2.Nf3 e6 3.d4 cxd4 4.Nxd4 Nc6 5.Nc3 Qc7 6.Be3 a6",
            "1.e4 c5 2.Nf3 e6 3.d4 cxd4 4.Nxd4 a6 5.c4 Nf6 6.Nc3 Bb4",
        ],
    ),
    "kings_indian": RepertoireKnowledge(
        id="kings_indian",
        name="Defesa Índia do Rei",
        side="black",
        eco_range="E60–E99",
        summary=(
            "As pretas permitem espaço central e atacam a cadeia com ...e5 ou ...c5. "
            "Roque rápido, coordenação e o momento das rupturas valem mais que imitar lances."
        ),
        plans_for_us=[
            "Completar ...Nf6, ...g6, ...Bg7, ...d6 e ...O-O antes de iniciar a corrida de alas.",
            "Contra d5 fechado, preparar ...f5, ...f4 e ataque ao rei; o cavalo "
            "costuma ir a h5 ou e8.",
            "Contra o Fianchetto, pressionar o centro com ...c5 ou ...e5 e usar "
            "...Nc6/a6 conforme d5.",
            "Atacar a base da cadeia branca: ...c6 contra d5 ou ...f5 contra e4.",
        ],
        opponent_plans=[
            "Ganhar espaço com e4 e d5, depois avançar b4/c5 na ala da dama.",
            "Trocar o bispo de g7 com Be3/Qd2 e Bh6 para enfraquecer as casas escuras.",
            "Abrir o centro cedo quando as pretas atrasam o roque ou a ruptura ...f5.",
        ],
        tactical_themes=[
            "O bispo de g7 fica poderoso quando a diagonal até b2 abre após "
            "...Nxe4 ou rupturas centrais.",
            "...Nxe4 pode funcionar por descobertas na diagonal g7–b2, mas "
            "exige verificar Nc6 e Bxc3.",
            "Em centros fechados, ...f4 cria temas de ...g3, sacrifícios em h3 "
            "e entrada da dama em h4.",
        ],
        traps=[
            "Não jogue ...f5 antes do roque sem calcular e5: a diagonal da dama "
            "branca pode alcançar h5.",
            "No ataque de quatro peões, aceitar todo o centro sem ...c5 ou ...e5 "
            "deixa as peças sem casas.",
        ],
        sample_lines=[
            "1.d4 Nf6 2.c4 g6 3.Nc3 Bg7 4.e4 d6 5.Nf3 O-O 6.Be2 e5 7.O-O Nc6",
            "1.d4 Nf6 2.c4 g6 3.Nc3 Bg7 4.e4 d6 5.f3 O-O 6.Be3 e5",
            "1.d4 Nf6 2.c4 g6 3.Nf3 Bg7 4.g3 O-O 5.Bg2 d6 6.O-O",
        ],
    ),
}


def match_repertoire(fen: str) -> RepertoireKnowledge | None:
    """Recognise a selected repertoire from resilient piece/pawn signatures."""
    board = chess.Board(fen)
    if board.fullmove_number > 24:
        return None

    if board.piece_at(chess.D4) == chess.Piece(chess.PAWN, chess.WHITE) and board.piece_at(
        chess.F4
    ) == chess.Piece(chess.BISHOP, chess.WHITE):
        return REPERTOIRES["london"]

    if (
        board.piece_at(chess.E4) == chess.Piece(chess.PAWN, chess.WHITE)
        and board.piece_at(chess.C5) == chess.Piece(chess.PAWN, chess.BLACK)
        and board.piece_at(chess.E6) == chess.Piece(chess.PAWN, chess.BLACK)
    ):
        return REPERTOIRES["sicilian_e6"]

    if (
        # The same compact setup is also our repertoire against English/Réti
        # move orders. Excluding a white pawn on e4 prevents labelling a Pirc
        # setup as King's Indian when the intended 1.e4 repertoire was missed.
        board.piece_at(chess.E4) != chess.Piece(chess.PAWN, chess.WHITE)
        and board.piece_at(chess.F6) == chess.Piece(chess.KNIGHT, chess.BLACK)
        and board.piece_at(chess.G6) == chess.Piece(chess.PAWN, chess.BLACK)
        and board.piece_at(chess.G7) == chess.Piece(chess.BISHOP, chess.BLACK)
    ):
        return REPERTOIRES["kings_indian"]

    return None
