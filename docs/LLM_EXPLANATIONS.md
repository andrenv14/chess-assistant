# LLM explanation boundary

The language model is a renderer of chess evidence, not a chess authority. The
provider-neutral service is separated from the initial OpenAI transport, so a
different API can be added later without changing the chess evidence contract.

## Input

The prompt contains:

- the full Stockfish analysis and candidate order;
- principal variations and configured opponent replies;
- opening metadata when available;
- deterministic position features;
- candidate facts and language-neutral plan hints.

The system message treats every string inside the evidence JSON as untrusted
data. Prompts and complete FENs are never written to logs.

## Output contract

The provider receives the generated JSON Schema for `PositionExplanation` and
must return:

- one position summary;
- exactly one explanation for every Stockfish candidate;
- the same UCI moves in exactly the same order;
- a short headline, natural explanation, one to four plan steps, the opponent's
  response and an optional warning for each candidate.

Candidate text and list lengths are bounded. The backend rejects missing,
invented or reordered moves even when the JSON itself is otherwise valid.

The schema intentionally has no fields for engine score, best-move rank,
classification or human move probability. Therefore model output cannot replace
those authoritative values in the UI.

## OpenAI transport

The initial provider uses the official OpenAI Python SDK and Responses API
Structured Outputs with the Pydantic model as `text_format`. Requests set
`store=false`, use a bounded timeout and retry a network failure at most once.
The SDK handles the JSON Schema supplied to the model; the service then performs
the additional chess-specific UCI/order validation.

`POST /api/explain` returns the evidence and its explanation together. The
desktop replaces its displayed candidate list with that exact evidence before
showing the prose, so a second time-limited engine run cannot attach text to a
different line.

Configure `LLM_API_KEY` and `LLM_MODEL` in `backend/.env`. `LLM_API_BASE_URL` is
optional. No key, prompt, full FEN or provider response is committed or logged.
