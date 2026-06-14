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
      - Fixed two latent codegen bugs in the inserted-module path that made it
        emit code the language rejects: a two-token `output name wire`
        declaration (the grammar's `output` takes a single signal name) and
        positional module-call arguments (the VM binds params by name).
        Regression-tested in `tests/js_module_instance_test.js`.

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

- [x] Multi-output module instances. Reading one output of a multi-output
      instance needs dot access (`instance.output`) as an *operand*, which
      both the Python reference VM and the JS port previously rejected
      ("Unsupported expression type: DotAccess"). Added matching support to
      both (a `copy` from the flattened `<instance>.<output>` signal), kept in
      parity and covered by a new golden fixture
      (`examples/advanced/ex30_multi_output.txt` +
      `tests/ex30_multi_output_test.json`, run by both
      `tests/test_runner.py` and `tests/js_solver_test.js`). The editor gives
      each output port of a multi-output instance its own wire name and emits
      `inst = mod(args)` once, then `wire = inst.<outputDecl>` per used output
      (keeping `output <wire>` valid); single-output instances and library
      nodes keep the simpler VM auto-copy path.

Touch support stays as-is (isolated in its own handlers) but receives no
further investment.

## Phase 5 — Web editor with users

Goal: host the editor as a website (starting on GitHub Pages) where people can
save and revisit their work. Built **local-first**: everything below the
"server" line runs as a static page with no backend and no new dependencies,
and the storage is hidden behind a small interface so a server backend can slot
in later without touching the editor UI.

How NoiseCraft (the closest sibling project) does the multi-user part, for
reference: a plain-JS, no-build frontend talks to a **small Node.js + SQLite
server** over a tiny JSON API; accounts are username + hashed password with
session tokens; projects are stored server-side with permalinks and a public
browse/fork gallery. That requires an always-on server, so it is *not*
hostable on GitHub Pages — which is why the roadmap stays static as long as
possible and only crosses the server line when cross-device sync or a public
gallery is actually wanted.

### Static (GitHub Pages, no backend, no accounts)

- [ ] **Local project library (IndexedDB).** A per-browser "My Projects"
      store behind a small async interface — `list()`, `get(id)`, `put(p)`,
      `remove(id)` — with an IndexedDB implementation and an in-memory fallback
      (also the test double). Projects are `{ id, name, data, created,
      modified }` where `data` is the existing `serializeGraph()` output. UI:
      open / save / rename / duplicate / delete, plus debounced autosave of the
      currently open project. File import/export stays as the escape hatch.
      *(IndexedDB, not localStorage: graphs are structured and can grow past
      localStorage's ~5 MB string cap.)*
- [ ] **Shareable links.** Serialize + compress the graph into the URL hash
      (native `CompressionStream`, still zero-dependency) for read-only / forkable
      links; `?load=<url>` opens a `.mmgraph` hosted anywhere (e.g. a Gist).
      Fall back to file export for graphs too large for a URL.

### Server line (requires a backend; deferred)

- [ ] **Accounts + cloud save.** First real backend. The static frontend stays
      put and calls a JSON API over CORS; the same storage interface gains a
      remote implementation (its methods `fetch()` instead of hitting
      IndexedDB), so the editor is unchanged and existing local projects can be
      uploaded in one pass. Backend options, roughly in order of fit with this
      project's zero-dependency ethos: a small self-hosted Node + SQLite server
      (the NoiseCraft model; Node 22+ has built-in `node:sqlite` and
      `crypto.scrypt`, so near zero-dependency), a managed service like Supabase
      (fastest to multi-user, adds a vendor), or GitHub OAuth with files stored
      as Gists/commits (neat for a dev audience, but still needs a tiny
      serverless piece for the OAuth secret — not purely static).
- [ ] **Sharing & community.** Public publish, a browse/gallery page, fork
      from gallery, permalinks — a straightforward extension once the accounts
      DB exists.

## Phase 6 — UI/UX improvements

Prioritised list derived from a full audit of the editor in June 2026.
High-impact items that change daily workflow first, polish last.

### High impact (top 5 — in progress)

- [x] **Multi-node selection.** Rubber-band marquee (drag on empty canvas) and
      Shift-click toggle. All selected nodes move together when dragged; Del
      deletes all of them; Ctrl+A selects all. The action bar (params/flip/dup)
      only appears for single-node selections; the toolbar Delete button enables
      whenever ≥1 node is selected.
- [x] **Copy / paste.** Ctrl+C copies all selected nodes plus the connections
      between them into an in-memory clipboard; Ctrl+V pastes at +40 px offset
      with the new nodes pre-selected. Wire names are not preserved on paste
      (acceptable — they get auto-assigned by codegen). Cross-graph paste works
      because the clipboard is just a plain object.
- [x] **Zoom to fit (`F` key + toolbar button).** Computes the bounding box of
      all nodes and sets pan/zoom to centre them with 60 px padding. Caps at
      2× zoom so a single-node graph doesn't fill the screen. Also accessible
      as a toolbar button next to Run/Step/Reset.
- [x] **Palette search.** A filter `<input>` at the top of the node palette
      hides sections and items that don't match the query (text of the button or
      `data-type` / `data-library` attribute). Sections with no visible items
      are hidden entirely. Clearing the search restores all items.
- [x] **Real code editor (CodeMirror 5).** Replaces the plain dark textarea
      with a CodeMirror instance with a custom `modmath` syntax mode (keywords,
      built-ins, `$step`, comments, numbers), line numbers, and proper tab
      indentation. Loaded from CDN; degrades gracefully to a fallback textarea
      if the CDN is unavailable.

### Medium impact (next)

- [ ] **Empty-canvas onboarding hint.** Show a centered "Drag a node here to
      start" placeholder when the viewport has no nodes. Add an **Examples**
      drop-down in the toolbar that loads one of the bundled examples — critical
      for discoverability since the project is educational.
- [ ] **Grid + optional snap.** Background dot-grid on the canvas and a
      snap-to-grid toggle (default off). Keeps graphs tidy without manual
      alignment. Grid spacing 20 px world units.
- [ ] **Keyboard shortcut help overlay.** Press `?` to open an overlay listing
      all shortcuts (Esc, Ctrl+S/R/Z/Y, Ctrl+A/C/V, Del, Space-pan, F, scroll
      zoom, Ctrl+D duplicate). Currently these are invisible unless you hover
      toolbar buttons.

### Low / polish

- [ ] **Consistent dark theme.** Canvas and toolbar are light; code editor and
      output panel are dark. Offer a whole-app dark mode toggle (CSS custom
      properties, `prefers-color-scheme` default).
- [ ] **Toolbar overflow collapse.** On narrow screens the toolbar wraps
      (`flex-wrap`). Collapse the file ops group (New/Save/Load/Module/Projects)
      into a single "File ▾" menu button below ~900 px.
- [ ] **Node tooltips.** On hover, show a one-line description of what each
      node type does. Especially useful for the library/stdlib nodes where the
      name alone isn't self-explanatory (e.g. `pid`, `biquad`, `ewma`).
- [ ] **Wire value tooltip on hover.** Instead of rendering the value as SVG
      text on every wire, show it in a tooltip on connection hover to reduce
      visual clutter on dense graphs.
