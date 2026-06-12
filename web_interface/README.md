# Modular Math Language - Web Interface

A visual, web-based editor for the Modular Math Language with drag-and-drop node creation. Programs compile and run entirely in the browser using the JavaScript solver (`assets/solver/`) — the page is fully static and works from any static file server.

## Features

### Visual Node Editor
- **Node palette sidebar** - click to add a node, or drag it onto the canvas to place it
- **Node types**: arithmetic (add, sub, mul, div), memory (mem), constants (const), comparisons (gt, lt, eq), I/O (input, output), parameters (param), plots (plot)
- **Visual connections** between nodes with real-time value display
- **Node parameters** - configurable values for memory initial states and constants
- **Undo/redo** for all graph edits (add/move/delete/connect/rename/parameters)
- **Desktop navigation** - hold Space and drag (or middle-button drag) to pan, mouse wheel to zoom around the cursor
- **Keyboard shortcuts** - Del (delete selection), Ctrl+S (save), Ctrl+R (run/stop), Ctrl+Z / Ctrl+Shift+Z (undo/redo)
- **Touch support** - tablets and mobile devices keep pinch-to-zoom and pan

### Code Editor
- **Syntax-aware text editor** for direct code editing
- **Real-time synchronization** between visual and text representations
- **Sample programs** included for learning

### Plots
- **Plot panel** (Plots tab) with one chart per `plot` node in the graph
- **Multiple traces** per chart - set the plot node's "Y Signals" to a comma-separated list
- **Arbitrary X axis** - plot against the step counter or any signal (phase portraits)
- **Autoscaling axes** with tick labels and grid
- **Zoom and pan** - mouse wheel zooms around the cursor, drag pans, double-click (or the Fit button) resets to autoscale
- **Live updates** while the simulation runs
- **CSV and PNG export** per chart

### Execution Environment
- **In-browser execution** using the JavaScript port of the VM - no server round-trips
- **Step-by-step execution** with visual feedback
- **Real-time signal values** displayed on connections
- **Execution output** panel with columnar variable values

## Quick Start

Serve the directory with any static file server, for example:

```bash
cd web_interface
python server.py --port 8080     # also provides the legacy REST API
# or simply:
python -m http.server 8080
```

**Then open your browser to:**
```
http://localhost:8080
```

## File Structure

```
web_interface/
├── index.html          # Main web interface
├── assets/
│   ├── style.css       # Visual styling and responsive design
│   ├── app.js          # NodeEditor core (UI wiring, selection, execution)
│   ├── editor/         # NodeEditor modules (mixins on the same class)
│   │   ├── graph.js        # node/connection model operations
│   │   ├── interaction.js  # mouse/touch input, drag, pan/zoom, menus
│   │   ├── codegen.js      # validation + code generation
│   │   ├── plotting.js     # plot panel sync
│   │   ├── persistence.js  # serialization, save/load, module instances
│   │   ├── history.js      # undo/redo stack
│   │   └── palette.js      # node palette sidebar
│   ├── api.js          # Local execution client (wraps the JS solver)
│   ├── plot.js         # Plot panel (Plots tab)
│   └── solver/         # JavaScript port of tokenizer, parser, and VM
├── server.py           # Optional Python server (static files + legacy API)
├── start.sh            # Convenient startup script
└── README.md           # This file
```

## Usage Guide

### Creating Nodes
- **Visual Editor**: Click a type in the palette sidebar (adds at the center of the view) or drag it onto the canvas
- **Available Types**:
  - `add`, `sub`, `mul`, `div` - Arithmetic operations (2 inputs, 1 output)
  - `mem` - Memory/delay element (1 input, 1 output, configurable initial value)
  - `const` - Constant value (0 inputs, 1 output, configurable value)
  - `gt`, `lt`, `eq` - Comparison operations (2 inputs, 1 output)
  - `input`, `output` - Module I/O connections
  - `param` - Named parameter with default value
  - `plot` - Records signals and shows them as a chart in the Plots tab

### Connecting Nodes
- **Drag from output port** (right side) **to input port** (left side)
- **Color coding**: Green for positive values, red for negative, blue for zero
- **Value display**: Real-time signal values shown on connections during execution

### Node Parameters
- **Select a node** by clicking on it
- **Click "Params"** button for configurable nodes (mem, const, plot, param)
- **Memory nodes**: Set initial value
- **Constant nodes**: Set constant output value
- **Plot nodes**: Set X signal (default `step`), Y signals (comma-separated wire names), and history size

### Plotting
1. Add a `plot` node and open its parameters
2. Set **Y Signals** to one or more wire names from the graph, e.g. `current_value` or `pos, vel`
3. Run the simulation and switch to the **Plots** tab (you can also switch first and watch the traces draw live)
4. Use the mouse wheel to zoom, drag to pan, double-click or **Fit** to reset, **CSV**/**PNG** to export

### Execution
1. **Compile** (optional): Validate code syntax
2. **Step**: Execute one simulation step
3. **Run**: Start automatic execution (toggles to Stop)
4. **Reset**: Clear execution state and return to step 0

### Code Editor
- **Switch tabs** between Visual Editor and Code Editor
- **Edit directly** in the text area
- **Sample code** provided shows counter example
- **Real-time sync** with visual representation

## Architecture

- **Visual node editor** built with HTML DOM nodes and SVG connections
- **Plot panel** (`assets/plot.js`) rendering charts on canvas - hand-rolled, no dependencies
- **Local execution client** (`assets/api.js`) with the same interface as the old HTTP client, backed by the JS solver
- **JS solver** (`assets/solver/`) - a faithful port of the Python tokenizer, parser, and VM, validated against the golden fixtures (`node tests/js_solver_test.js`)

The Python implementation remains the reference (CLI, test harness, language spec). `server.py` still exposes the original REST API (`/api/compile`, `/api/step`, ...) for tooling that wants server-side execution, but the web interface no longer uses it.

## Browser Compatibility

- **Chrome/Chromium** 80+ (recommended)
- **Firefox** 75+
- **Safari** 13+
- **Edge** 80+

Touch features require modern mobile browsers with pointer events support.

## Development

### Adding New Node Types
1. Update `getNodeInputs()` and `getNodeOutputs()` in `assets/editor/graph.js`
2. Add node class in `getNodeClass()` for styling
3. Add a palette entry in `index.html`
4. Update code generation in `assets/editor/codegen.js` (`generateCodeFromGraph()`) if the node produces wires

### Testing
- `node tests/js_solver_test.js` - golden-fixture tests for the JS solver
- `node tests/js_plot_test.js` - unit tests for the plot panel's scaling/tick/history logic
- `node tests/js_history_test.js` - unit tests for the undo/redo stack
- `node tests/js_editor_test.js` - structural checks that the NodeEditor module split is complete

### Troubleshooting
- **Nodes not connecting**: Ensure you're dragging from output (right) to input (left) ports
- **Empty plot**: Check that the plot node's Y signal names match wire names in the graph
- **Compilation errors**: Check code syntax in the Code Editor tab
- Open browser developer tools to see detailed logging
