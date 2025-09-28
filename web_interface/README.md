# Modular Math Language - Web Interface

A visual, web-based editor for the Modular Math Language with drag-and-drop node creation and real-time execution powered by Python backend.

## Features

### Visual Node Editor
- **Drag-and-drop interface** for creating computational graphs
- **Node types**: arithmetic (add, sub, mul, div), memory (mem), constants (const), comparisons (gt, lt, eq), I/O (input, output)
- **Visual connections** between nodes with real-time value display
- **Node parameters** - configurable values for memory initial states and constants
- **Touch support** - optimized for tablets and mobile devices with pinch-to-zoom and pan

### Code Editor
- **Syntax-aware text editor** for direct code editing
- **Real-time synchronization** between visual and text representations
- **Sample programs** included for learning

### Execution Environment
- **Step-by-step execution** with visual feedback
- **Automatic execution** with configurable step timing
- **Real-time signal values** displayed on connections
- **Execution output** panel with detailed logging

### Python Backend Integration
- **Real compilation** using the language parser and tokenizer
- **Actual VM execution** with correct signal values
- **Real-time signal monitoring** during program execution
- **REST API** for extensibility

## Quick Start

**Option 1: Use the startup script**
```bash
cd web_interface
./start.sh          # Defaults to port 8080
./start.sh 9000      # Use custom port
```

**Option 2: Start server directly**
```bash
cd web_interface
python server.py --port 8080
```

**Then open your browser to:**
```
http://localhost:8080
```

The interface requires the Python server to function - it will show "Server Disconnected" if the backend is not running.

## File Structure

```
web_interface/
├── index.html          # Main web interface
├── assets/
│   ├── style.css       # Visual styling and responsive design
│   ├── app.js          # Core node editor functionality
│   └── api.js          # Backend communication
├── server.py           # Required Python backend server
├── start.sh            # Convenient startup script
└── README.md           # This file
```

## Usage Guide

### Creating Nodes
- **Visual Editor**: Click "Add Node" button or double-tap empty space
- **Available Types**:
  - `add`, `sub`, `mul`, `div` - Arithmetic operations (2 inputs, 1 output)
  - `mem` - Memory/delay element (1 input, 1 output, configurable initial value)
  - `const` - Constant value (0 inputs, 1 output, configurable value)
  - `gt`, `lt`, `eq` - Comparison operations (2 inputs, 1 output)
  - `input`, `output` - Module I/O connections

### Connecting Nodes
- **Drag from output port** (right side) **to input port** (left side)
- **Color coding**: Green for positive values, red for negative, blue for zero
- **Value display**: Real-time signal values shown on connections during execution

### Node Parameters
- **Select a node** by clicking on it
- **Click "Parameters"** button for configurable nodes (mem, const)
- **Memory nodes**: Set initial value
- **Constant nodes**: Set constant output value

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

## Backend Server API

The server provides REST endpoints for real compilation and execution:

- `GET /` - Serve the web interface
- `GET /assets/*` - Serve static assets
- `POST /api/compile` - Compile code and return validation results
- `POST /api/step` - Execute one simulation step
- `POST /api/run` - Start automatic execution
- `POST /api/reset` - Reset execution state
- `GET /api/status` - Get current execution status
- `GET /api/signals` - Get current signal values

## Browser Compatibility

- **Chrome/Chromium** 80+ (recommended)
- **Firefox** 75+
- **Safari** 13+
- **Edge** 80+

Touch features require modern mobile browsers with pointer events support.

## Architecture

The web interface is built on a client-server architecture:

### Frontend (Browser)
- **Visual node editor** built with HTML5 Canvas and SVG
- **Real-time UI updates** showing connection values and execution state
- **API client** that communicates with the Python backend

### Backend (Python Server)
- **HTTP server** serving the web interface and API endpoints
- **Language integration** using the tokenizer, parser, and VM
- **Real execution** of modular math programs with actual computed values

### Communication
The frontend and backend communicate via REST API, allowing real-time compilation, execution, and signal monitoring.

## Development

### Adding New Node Types
1. Update `getNodeInputs()` and `getNodeOutputs()` in `app.js`
2. Add node class in `getNodeClass()` for styling
3. Add to node menu in `index.html`
4. Update backend server if needed for real execution

### Extending API
1. Add new endpoints in `server.py`
2. Add corresponding methods in `api.js`
3. Update the NodeEditor class to use new functionality

## Troubleshooting

### Server Issues
- **"Server Disconnected"**: Ensure Python server is running with `python server.py`
- **Connection refused**: Check that server is running on the correct port (default 8080)
- **Module import errors**: Ensure you're running from the correct directory with modular_math modules available

### Interface Issues
- **Nodes not connecting**: Ensure you're dragging from output (right) to input (left) ports
- **Touch not working**: Ensure browser supports pointer events
- **Compilation errors**: Check code syntax in the Code Editor tab

### Debug Mode
Open browser developer tools to see detailed logging and API communication.