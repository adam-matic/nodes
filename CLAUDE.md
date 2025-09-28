# Modular Math Language

This project implements a domain-specific language (DSL) for describing and simulating modular computational systems, inspired by block diagrams used in analog computing and control theory.

## Project Structure

- **`modular_math/`** - Core language implementation
  - `tokenizer.py` - Lexical analyzer that breaks source code into tokens
  - `parser.py` - Parser that builds an Abstract Syntax Tree (AST) from tokens
  - `ast_nodes.py` - Defines all AST node types and provides AST printing functionality
  - `vm.py` - Virtual machine that executes the parsed programs
- **`cli/`** - Command-line interface
  - `main.py` - Main entry point for parsing and running examples
- **`web_interface/`** - Visual web interface
  - `index.html` - Web-based visual node editor with drag-and-drop functionality
  - `assets/` - CSS, JavaScript, and API integration files
  - `server.py` - Optional Python backend server for real execution
  - `README.md` - Detailed web interface documentation
- **`examples/`** - Collection of example programs organized by complexity
  - `basic/` - Simple arithmetic and basic language features
  - `control_systems/` - PID controllers, filters, integrators
  - `advanced/` - Signal generators, complex waveforms
- **`tests/`** - Test cases and debugging scripts
  - `debug_scripts/` - Development and debugging utilities
- **`tools/`** - Utility scripts for development
- **`docs/`** - Documentation
  - `language_spec.md` - Complete language specification and design document

## Key Language Features

- **Step-based execution** - Programs run in discrete time steps with global `$step` counter
- **Signal flow paradigm** - Variables represent signals flowing through the system
- **Memory blocks (`mem`)** - Essential for feedback loops and state retention
- **Module system** - Reusable computational blocks with inputs, outputs, and parameters
- **Built-in arithmetic** - Basic operations: `add`, `sub`, `mul`, `div`
- **Comparison operators** - `gt`, `lt`, `eq`, `gte`, `lte` (output 1/0)
- **Control flow** - `HALT` block for stopping execution

## Running Examples

```bash
# Parse and run built-in examples
python cli/main.py --example simple
python cli/main.py --example counter
python cli/main.py --example addition

# Parse files from examples directory
python cli/main.py examples/basic/ex01_addition.txt

# Print AST for debugging
python cli/main.py --print-ast --example counter

# Interactive mode
python cli/main.py --interactive
```

## Testing

Run all test cases:
```bash
python tests/test_runner.py
```

## Web Interface

The web interface provides a visual, drag-and-drop editor for building modular math programs with real Python execution:

```bash
# Start the backend server
cd web_interface
python server.py --port 8080
# Then open http://localhost:8080 in browser
```

Features include:
- **Visual node editor** with drag-and-drop functionality
- **Real-time execution** using the Python VM
- **Actual signal values** displayed on connections
- **Touch support** for mobile devices
- **Code editor** with syntax highlighting
- **Live compilation** and error reporting

## Language Syntax Example

```
module counter {
    next_value = add(current_value, 1)
    current_value = mem(0, next_value)
    output current_value
}

execution {
    max_steps: 10
    save: [current_value]
}
```

## Development Commands

- **Parse files**: `python cli/main.py <filename>`
- **Run tests**: `python tests/test_runner.py`
- **VM simulation**: `python tests/simulate.py`
- **Interactive parsing**: `python cli/main.py --interactive`
- **Web interface**: `cd web_interface && python server.py` (then open http://localhost:8080)

The language is designed for educational purposes and control system simulation, with a focus on clarity and mathematical modeling.