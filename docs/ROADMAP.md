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

- [x] Single horizontal toolbar with icons, tooltips, and keyboard shortcuts:
      Del (delete selection), Ctrl+S (save), Ctrl+R (run/stop),
      Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y (undo/redo), Space-drag pan, and
      mouse-wheel zoom centered on the cursor (the desktop previously had no
      mouse zoom at all).
- [x] Node palette sidebar (click to add at center, or drag onto the canvas)
      replacing the "Add Node" popup.
- [x] Undo/redo: snapshot stack of the serialized graph, checkpointed before
      each mutation (`assets/editor/history.js`, unit-tested in
      `tests/js_history_test.js`). Restores preserve node ids so parameter
      bindings and module references survive — file loads now share the same
      restore path, fixing bindings being silently remapped on load.
- [x] Split the `NodeEditor` class into modules: kept one class but moved the
      methods into `assets/editor/{graph,interaction,codegen,plotting,
      persistence,history,palette}.js`, applied to the prototype via a tiny
      mixin helper — no build step, `this` semantics unchanged.
      `tests/js_editor_test.js` verifies every `this.method()` call site
      resolves after the split. Fixed along the way: a duplicate
      `deleteSelected` definition that shadowed the working one and called a
      nonexistent method, and a global Backspace handler that broke typing in
      the code editor.
- [x] On-node action bar: selecting a node shows a small floating toolbar
      above it with params / flip / duplicate / delete (duplicate is new;
      the others mirror the main toolbar, which keeps working).
- [x] Wire routing (`assets/editor/routing.js`): wires now leave and enter
      horizontally on the side a port faces (flip-aware) as orthogonal
      paths with rounded corners. The router scores candidate routes by
      node-box crossings, then bends, then length — so feedback wires go
      around the nodes instead of sweeping back through them, and wires
      detour around nodes sitting on the direct path. Pure geometry,
      unit-tested in `tests/js_routing_test.js`.

## Phase 4 — Module instances & node library

- [x] Better module-instance UX:
      - `input`/`output` nodes carry a configurable Port Name (edited via the
        ⚙ action). The name becomes the wire name for connections out of an
        input node, and is surfaced as the module instance's port labels.
      - Module-instance nodes render port-name labels beside each port
        (flip-aware), grow to fit >2 ports, and show param overrides (or an
        "N params" summary) in the subtitle.
      - The ⚙ panel on a module instance lists the module's `param` nodes as
        editable number fields; overrides are stored in
        `parameters.paramOverrides` and applied in
        `generateModuleDefinitionCode` (falls back to scanning
        `moduleDefinition` for files saved before `paramSpecs` existed).

- [x] Richer node library — surfaces the existing stdlib modules as a palette
      "library" rather than adding new VM primitives (the VM's only primitives
      are `add/sub/mul/div`, the comparisons, `mem`, and `const`; every signal
      source, filter, integrator/differentiator, PID, and min already exists as
      a composable module in `assets/solver/stdlib.js`).
      - `assets/editor/library.js` (`NodeLibrary`, pure/unit-tested in
        `tests/js_library_test.js`) holds a curated registry of single-output
        building blocks and an `introspect()` that parses a module's source and
        pulls out its input/output ports and parameter defaults via the AST.
      - The palette generates a button per registry entry (grouped Sources /
        Math / Filters / Control); dropping one creates a `module_instance`
        node flagged `isLibrary`, reusing the named-port labels and
        param-editing panel from the module-instance UX work above.
      - Codegen emits `import <name>` at the top plus a named-argument call
        `wire = name(inputName=wire, param=override, ...)` — named args are
        required by the VM, and only overridden params are passed (others use
        the module's own defaults). Verified end-to-end through the solver.
      - "Scope" is already covered by plot nodes; an explicit "mux" can ship
        later as a small stdlib module (the `min`/select pattern).

- [ ] Optional Tauri/Electron wrapper once the page is static. Largest scope,
      adds a build/tooling layer to a project that has stayed zero-dependency;
      defer until the in-browser editor feels complete.

Touch support stays as-is (isolated in its own handlers) but receives no
further investment.
