# Roadmap

Status as of June 2026. Focus has shifted from mobile (the project was originally
developed on Android) to desktop.

## Architecture decision: JavaScript solver

The solver (tokenizer/parser/VM) will be ported to JavaScript so simulations run
in-browser. Rationale:

- The current web interface does one HTTP round-trip per simulation step
  (`/api/step`), which throttles execution and makes live plotting impractical.
- The VM is small (~700 lines) and simple; a faithful port is a modest job.
- With in-browser execution the web interface becomes a static page — no server
  process, hostable anywhere.

**Python remains the reference implementation** (CLI, test harness, language
spec). The 35 example programs serve as golden tests: their Python VM outputs
are saved as JSON fixtures and the JS solver must reproduce them exactly.

## Phase 0 — Stabilize

- [x] Fix hardcoded Android paths (`/storage/emulated/0/dev/...`) in
      `tests/test_runner.py`; fix division-by-zero in its summary.
- [x] Get the test suite running and green on desktop (36/36; required fixing
      an off-by-one in `VirtualMachine.get_results` that dropped the step that
      triggered a HALT condition).
- [x] Golden-output fixtures: already exist as the 36 JSON test cases in
      `tests/` (expected outputs per example) — these are the contract the JS
      solver must satisfy in Phase 1.
- [x] Fix module search paths in `modular_math/vm.py` (done June 2026).

Note: `tests/debug_scripts/` and `tools/` still contain Android paths; they are
one-off dev scripts and can be fixed if/when needed.

## Phase 1 — JS solver

- [ ] Port tokenizer, parser, and VM to a plain ES module
      (`web_interface/assets/solver/`), validated against the golden fixtures.
- [ ] Switch the frontend to in-browser execution; demote `server.py` to
      optional static file serving.

## Phase 2 — Plots

- [ ] Replace the fixed 200×120 plot-node canvas with a proper plot panel:
      multiple traces, axes with autoscaling, zoom/pan, live updates during
      runs, CSV/PNG export.
- [ ] Rendering: grow the hand-rolled canvas code or adopt uPlot (~45 KB,
      fast time-series, no build step required).

## Phase 3 — Desktop UI

- [ ] Rework the stacked mobile toolbar into a single horizontal desktop
      toolbar with icons and keyboard shortcuts (Del, Ctrl+S save, Ctrl+R run,
      Space-drag pan).
- [ ] Node palette sidebar instead of the "Add Node" popup.
- [ ] Undo/redo (currently missing entirely).
- [ ] Split the 3,200-line `NodeEditor` class in `app.js` into modules:
      graph model, canvas/interaction, codegen, plotting, persistence.

## Phase 4 — Later

- [ ] Richer node library (signal sources, scopes, mux).
- [ ] Better module-instance UX.
- [ ] Optional Tauri/Electron wrapper once the page is static.

Touch support stays as-is (isolated in its own handlers) but receives no
further investment.
