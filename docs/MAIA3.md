# Optional Maia-3 integration

## Decision

Maia-3 remains an optional, local subprocess. It is free and open source under
AGPL-3.0, but installing it also installs PyTorch and the first run downloads a
model checkpoint. The base app therefore does not require it.

The initial supported model is the official `maia3-5m` CPU-friendly preset from
[`CSSLab/maia3`](https://github.com/CSSLab/maia3). Set `MAIA3_PATH` to that UCI
entry point to enable `POST /api/human-prediction`.

On Windows, an isolated optional environment can be installed with:

```powershell
.\scripts\install-maia3.ps1
```

The helper pins upstream revision
`1e13597c42d4858b7cfd7cfdae01e297263364b2`. It installs dependencies but does
not download a checkpoint unless `-DownloadModel` is supplied. The backend
automatically discovers the resulting entry point.

## Authority boundary

- Stockfish evaluates objective move quality and assigns post-move labels.
- Maia-3 ranks moves that humans at the configured Elo levels are likely to
  consider and predicts human-game outcomes.
- The LLM may explain both sources, but cannot convert Maia rank into objective
  chess quality or override Stockfish.

Maia's UCI `score cp` field is deliberately ignored. Upstream documents it as a
GUI-compatibility value derived from the model's WDL head, not a searched
centipawn evaluation.

## Honest output limits

The upstream UCI protocol exposes candidate order and WDL, but does not expose
the move-policy probability in its `info` lines. The API therefore returns
`rank` and WDL probabilities only. It must not fabricate a move probability from
rank or from the compatibility centipawn value.

## Runtime behavior

- disabled when `maia3-5m` is not installed;
- lazy process startup on the first prediction request;
- serialized access to the model process;
- independent `SelfElo` and `OppoElo` settings;
- deterministic candidate ranking (`Temperature=0`, `TopP=1.0`);
- clean shutdown with the FastAPI application.

Before distributing Maia code or weights with an installer, the packaging
milestone must review and satisfy the upstream AGPL-3.0 obligations.
