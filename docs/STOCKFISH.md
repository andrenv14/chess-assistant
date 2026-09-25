# Native Stockfish runtime

## Supported setup

The Windows helper installs the stable Stockfish 19 universal x86-64 binary
from the official release repository. Universal builds select the best CPU
instruction set at runtime, so users do not need to choose AVX2, BMI2 or AVX-512.

Pinned artifact:

- release: `sf_19`;
- file: `stockfish-windows-x86-64-universal.zip`;
- SHA-256: `3C8BF1F9EA66A09350A40DF4F632288285AC206D99F33AB5842C408FC30B48A7`;
- source: `official-stockfish/Stockfish` on GitHub.

The checksum is verified before extraction. A mismatch deletes the downloaded
archive and stops installation.

## Discovery order

1. `STOCKFISH_PATH` supplied through the environment or `backend/.env`;
2. the location created by `scripts/install-stockfish.ps1`;
3. a `stockfish` or `stockfish.exe` executable on `PATH`.

The installer is idempotent and `backend/vendor` is ignored by Git. The binary
is therefore a local dependency, not a 100 MB repository artifact.

## Verification

Fast tests use deterministic fake UCI responses. Tests marked `integration`
start the real executable and verify:

- multiple candidate moves;
- opponent replies;
- legal UCI output;
- post-move classification;
- clean shutdown of all engine processes.

Run them by setting `STOCKFISH_PATH` and executing `pytest -m integration` from
`backend`. The `Native Stockfish regression corpus` GitHub Actions job performs
the same installation and native test run on every push and pull request, so a
classification threshold or engine-integration regression cannot silently pass
through the fast mocked suite.

## Distribution note

Stockfish is GPLv3. The current helper downloads the unmodified official package
directly and preserves its included license and source files. Before shipping a
single combined installer, the packaging milestone must explicitly verify all
GPL source-and-license distribution obligations.
