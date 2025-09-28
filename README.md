# Modular Math Language

A domain-specific language (DSL) for describing and simulating modular computational systems, inspired by block diagrams used in analog computing and control theory.

## Quick Start

### Command Line Interface

```bash
# Run a simple example
python cli/main.py --example counter

# Run an example file
python cli/main.py examples/basic/ex01_addition.txt

# Interactive mode
python cli/main.py --interactive
```

### Web Interface

Open `web_interface/index.html` in your web browser for a visual node-based editor.

## Project Structure

```
modular_math_language/
├── modular_math/           # Core language implementation
├── cli/                    # Command-line interface
├── web_interface/          # Visual web interface
├── examples/               # Example programs by category
│   ├── basic/             # Simple examples
│   ├── control_systems/   # Control system examples
│   └── advanced/          # Advanced signal processing
├── tests/                  # Test cases and debugging
├── tools/                  # Development utilities
└── docs/                   # Documentation
```

## Features

- **Visual node editor** - Drag-and-drop interface for building programs
- **Step-based execution** - Discrete time simulation
- **Signal flow paradigm** - Variables as flowing signals
- **Memory blocks** - State retention and feedback loops
- **Module system** - Reusable computational blocks
- **Built-in operations** - Arithmetic and comparison operators

## Documentation

See [docs/README.md](docs/README.md) for detailed documentation.

## Testing

```bash
python tests/test_runner.py
```

## License

This project is designed for educational purposes and control system simulation.