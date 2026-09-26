# Desktop experience

The desktop is designed as an analysis cockpit, not as a second chess website.
It keeps the current board, objective evaluation and candidate plans visible at
the same time while progressively disclosing engine configuration.

## Main flow

1. The extension sends a position from a supported analysis page, or the user
   pastes a FEN.
2. Live browser positions are analyzed automatically by default. The switch in
   the command bar can disable this without changing any engine setting.
3. The first Stockfish candidate is selected and drawn as an arrow on the local
   board. Hovering or focusing another candidate previews its arrow; selecting
   it expands its principal variation, verified ideas and opponent defenses.
4. The optional API explanation is a separate action. Deterministic Stockfish
   output is useful even when the provider is unavailable or has no credit.
5. Completed evidence is stored locally and can be restored from history.

The shortcuts `Ctrl+Enter` and `Ctrl+E` run analysis and request an explanation,
respectively. All primary actions remain available as visible buttons.

## Visual hierarchy

- The board and eval bar form one synchronized object.
- Candidate rank, SAN, engine score and principal variation are readable before
  expansion; secondary defenses and prose appear only for the selected move.
- Source and runtime status use text in addition to color.
- Engine profiles show a human-readable purpose and current strength while
  time, fixed depth and line count remain under an advanced disclosure.
- Loading uses an explicit status message, spinner and skeleton cards rather
  than replacing previous information with a blank surface.

## Accessibility and responsive behavior

- Interactive elements use native buttons, inputs, summaries and status roles.
- The board has one concise accessible description instead of exposing 64
  decorative squares to screen readers.
- Keyboard focus has a high-contrast outline; selected moves do not rely on
  color alone.
- `prefers-reduced-motion` removes nonessential animation.
- At 1,120 px the engine controls move below the analysis; at 780 px the app
  becomes a single-column flow; at 460 px dense move details use the full width.

## Visual QA

Before a portfolio release, verify at least these states in the production
renderer:

- empty/manual position;
- analysis loading and completion;
- selected and non-selected candidates;
- invalid FEN;
- LLM configured and unavailable;
- live Chess.com and Lichess source badges;
- widths around 1,280 px, 760 px and 390 px;
- Windows display scaling at 100% and 150%.

The app icon source is `apps/desktop/build/icon.svg`. Electron Builder converts
that vector source into the required Windows installer and executable sizes.
The portfolio GIF is regenerated from the five 100% captures with
`backend\.venv\Scripts\python.exe scripts\build-portfolio-demo.py`; Pillow is
part of the backend's `dev` dependency group.
