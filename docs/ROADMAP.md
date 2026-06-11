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

- [x] Port tokenizer, parser, and VM to JavaScript
      (`web_interface/assets/solver/`), validated against the golden fixtures
      (`node tests/js_solver_test.js`, 36/36 passing).
- [x] Switch the frontend to in-browser execution: `api.js` is now a local
      client with the same interface; `server.py` is only needed as a static
      file server (any static server works).
- [x] Module imports resolve in-browser through a generated registry
      (`assets/solver/stdlib.js`); regenerate with `node tools/build_stdlib.js`
      after changing example modules.

## Phase 2 — Plots

- [x] Replace the fixed 200×120 plot-node canvas with a proper plot panel:
      the "Plots" tab shows one chart per plot node, with multiple traces
      (comma-separated Y signals), autoscaled axes with ticks and grid,
      wheel zoom / drag pan / double-click reset, live updates during runs
      (the run loop now yields to the browser each frame), and CSV/PNG
      export per chart.
- [x] Rendering: grew the hand-rolled canvas code into
      `web_interface/assets/plot.js` (PlotView/PlotPanel) — kept zero
      dependencies and no build step rather than adopting uPlot. The
      scaling/tick/history logic is unit-tested
      (`node tests/js_plot_test.js`).

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
