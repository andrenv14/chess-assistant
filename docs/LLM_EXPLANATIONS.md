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
- a compact grounding catalogue whose opaque IDs map to deterministic
  Stockfish, board and opening statements.

The system message treats every string inside the evidence JSON as untrusted
data. Prompts and complete FENs are never written to logs.

## Output contract

The provider receives the generated JSON Schema for `PositionExplanation` and
must return:

- one position summary;
- one or more valid grounding IDs for that summary;
- exactly one explanation for every Stockfish candidate;
- the same UCI moves in exactly the same order;
- one or more candidate-specific grounding IDs;
- a short headline, natural explanation, one to four plan steps, the opponent's
  response and an optional warning for each candidate;
- the exact UCI of the strongest configured opponent reply, or `null` when the
  engine returned no reply.

Candidate text and list lengths are bounded. The backend rejects missing,
invented or reordered moves even when the JSON itself is otherwise valid. It
also rejects nonexistent support IDs, a mismatched opponent reply and any
lower-ranked candidate that the prose promotes to "best". Grounding IDs stay
internal: the desktop shows a human-readable verification badge and the
authoritative score/PV, never the IDs.

The schema intentionally has no fields for engine score, best-move rank,
classification or human move probability. Therefore model output cannot replace
those authoritative values in the UI.

## OpenRouter transport

The provider uses the OpenAI-compatible Python SDK against OpenRouter's
OpenResponses endpoint. Structured Outputs receive the Pydantic model as
`text_format`; OpenRouter routing sets `require_parameters=true`, so a provider
that cannot honor the schema is rejected rather than silently ignoring it.
Requests set `store=false`, cap output tokens, use a bounded timeout and retry a
network failure at most once. The service then performs the additional
chess-specific UCI/order/grounding validation.

The default model is `google/gemini-3.8-flash`. Model and gateway remain
configuration values and can be changed without altering the chess contracts.
Logs contain model, gateway and token counts, but never prompts or responses.

`POST /api/explain` returns the evidence and its explanation together. The
desktop replaces its displayed candidate list with that exact evidence before
showing the prose, so a second time-limited engine run cannot attach text to a
different line.

Copy `backend/.env.example` to `backend/.env` and set `LLM_API_KEY`. No key,
prompt, full FEN or provider response is committed or logged.

## Real-provider smoke test

`backend/scripts/smoke_llm.py` runs a single paid request for a fixed Ruy Lopez
position. It starts native Stockfish, produces three candidate lines and two
responses per candidate, builds deterministic evidence and validates the model
output against the same production schema and candidate order.

Set `LLM_API_KEY`, `LLM_API_BASE_URL` and `LLM_MODEL` only in the current shell,
then run this command from `backend`:

```powershell
.venv\Scripts\python.exe scripts\smoke_llm.py
```

The credential is read only from the environment. The script prints the final
validated explanation; structured logs contain only a hashed position id,
durations, model/gateway names and token counts.
