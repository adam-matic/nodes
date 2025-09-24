# Modular Math Language

This project implements a domain-specific language (DSL) for describing and simulating modular computational systems, inspired by block diagrams used in analog computing and control theory.

## Project Structure

- **`main.py`** - Command-line interface for parsing and running examples
- **`tokenizer.py`** - Lexical analyzer that breaks source code into tokens
- **`parser.py`** - Parser that builds an Abstract Syntax Tree (AST) from tokens
- **`ast_nodes.py`** - Defines all AST node types and provides AST printing functionality
- **`vm.py`** - Virtual machine that executes the parsed programs
- **`test_runner.py`** - Test harness that runs all test cases
- **`simulate.py`** - Simulation utilities
- **`design_and_spec.txt`** - Complete language specification and design document
- **`examples/`** - Collection of example programs (30+ examples)
- **`tests/`** - Test cases with expected outputs
- **`code/`** - Additional code samples

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
python main.py --example simple
python main.py --example counter
python main.py --example addition

# Parse files from examples directory
python main.py examples/ex01_addition.txt

# Print AST for debugging
python main.py --print-ast --example counter

# Interactive mode
python main.py
```

## Testing

Run all test cases:
```bash
python test_runner.py
```

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

- **Parse files**: `python main.py <filename>`
- **Run tests**: `python test_runner.py`
- **VM simulation**: `python simulate.py` (if implemented)
- **Interactive parsing**: `python main.py` (stdin mode)

The language is designed for educational purposes and control system simulation, with a focus on clarity and mathematical modeling.