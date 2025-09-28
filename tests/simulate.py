#!/usr/bin/env python3
"""
Modular Math Language Simulator

A complete command-line interface for parsing and executing modular math language programs.
"""

import sys
import argparse
import json
import csv
from modular_math.parser import parse_file, parse_string, ParseError
from modular_math.vm import VirtualMachine
from modular_math.ast_nodes import ASTPrinter


def format_results_table(results: dict) -> str:
    """Format results as a table."""
    if not results:
        return "No results to display"

    # Get signal names and step count
    signal_names = list(results.keys())
    if not signal_names:
        return "No signals in results"

    # Handle case where results might be empty lists
    try:
        step_count = len(results[signal_names[0]])
    except IndexError:
        return "No steps in results to display"


    # Create header
    header = "Step".ljust(8) + "".join(name.ljust(12) for name in signal_names)
    separator = "-" * len(header)

    lines = [header, separator]

    # Add data rows
    for step in range(step_count):
        row = f"{step}".ljust(8)
        for name in signal_names:
            value = results[name][step] if step < len(results[name]) else 0.0
            row += f"{value:.4f}".ljust(12)
        lines.append(row)

    return "\n".join(lines)


def save_results_csv(results: dict, filename: str):
    """Save results to CSV file."""
    if not results:
        return

    signal_names = list(results.keys())
    step_count = len(results[signal_names[0]])

    with open(filename, 'w', newline='') as csvfile:
        writer = csv.writer(csvfile)

        # Write header
        writer.writerow(['Step'] + signal_names)

        # Write data
        for step in range(step_count):
            row = [step]
            for name in signal_names:
                value = results[name][step] if step < len(results[name]) else 0.0
                row.append(value)
            writer.writerow(row)


def save_results_json(results: dict, filename: str):
    """Save results to JSON file."""
    with open(filename, 'w') as jsonfile:
        json.dump(results, jsonfile, indent=2)


def run_simulation(ast, args):
    """Helper function to run the VM and display results."""
    if args.print_ast:
        print("=== Abstract Syntax Tree ===")
        printer = ASTPrinter()
        printer.visit(ast)
        print()

    # Create and load the VM
    if args.verbose:
        print("Loading program into VM...")

    vm = VirtualMachine()
    vm.load_program(ast)

    if args.verbose:
        print(f"VM loaded with {len(vm.operations)} operations and {len(vm.signals)} signals")
        print(f"Memory blocks: {len(vm.memory_blocks)}")
        print(f"Halt conditions: {len(vm.halt_conditions)}")
        print(f"Max steps: {vm.max_steps}")
        print()

    # Execute the program
    if args.verbose:
        print("Executing program...")

    results = vm.run()

    if args.verbose:
        final_step = vm.current_step
        halted = vm.halted
        print(f"Execution completed at step {final_step}")
        if halted:
            print("Program halted due to halt condition")
        else:
            print("Program completed max steps")
        print()

    # Display results
    if not args.no_table:
        print("=== Simulation Results ===")
        print(format_results_table(results))

    # Save results
    if args.csv:
        save_results_csv(results, args.csv)
        print(f"\nResults saved to {args.csv}")

    if args.json:
        save_results_json(results, args.json)
        print(f"\nResults saved to {args.json}")


def main():
    parser = argparse.ArgumentParser(
        description='Parse, simulate, and debug modular math language programs.',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  simulate.py examples/ex02_counter.txt                    # Run a file
  simulate.py --example counter                            # Run a built-in example
  simulate.py                                              # Enter interactive mode
  simulate.py examples/ex02_counter.txt --print-ast        # Show AST before running
  simulate.py examples/ex02_counter.txt --csv results.csv  # Save results to CSV
  simulate.py --list-examples                              # List available file-based examples
        """
    )

    parser.add_argument('file', nargs='?', help='Program file to simulate. If not provided, enters interactive mode.')
    parser.add_argument('--example', help='Run a built-in example')
    parser.add_argument('--print-ast', action='store_true', help='Print the AST before execution')
    parser.add_argument('--verbose', '-v', action='store_true', help='Verbose output')
    parser.add_argument('--csv', help='Save results to CSV file')
    parser.add_argument('--json', help='Save results to JSON file')
    parser.add_argument('--list-examples', action='store_true', help='List available examples from the examples/ directory')
    parser.add_argument('--no-table', action='store_true', help='Don\'t print results table')

    args = parser.parse_args()

    # --- Mode Selection ---

    source_text = None
    source_name = "input"

    if args.list_examples:
        import os
        examples_dir = '/storage/emulated/0/dev/examples'
        if os.path.exists(examples_dir):
            print("Available examples (run with 'simulate.py <filename>'):")
            for filename in sorted(os.listdir(examples_dir)):
                if filename.endswith('.txt'):
                    print(f"  {filename}")
        else:
            print("Examples directory not found")
        return 0

    elif args.example:
        source_name = f"example '{args.example}'"
        examples = {
            'simple': """
                module const { param value output value }
                execution { max_steps: 1 save: [value] }
            """,
            'counter': """
                module counter {
                    next_value = add(current_value, 1)
                    current_value = mem(0, next_value)
                    output current_value
                }
                execution { max_steps: 10 save: [current_value] }
            """,
            'addition': """
                module const { param value output value }
                module addition_example {
                    a = const(value=10)
                    b = const(value=32)
                    result = add(a, b)
                    output result
                }
                execution { max_steps: 2 save: [result] }
            """
        }
        if args.example not in examples:
            print(f"Unknown example: {args.example}")
            print(f"Available examples: {', '.join(examples.keys())}")
            return 1
        source_text = examples[args.example]

    elif args.file:
        source_name = args.file
        try:
            with open(args.file, 'r') as f:
                source_text = f.read()
        except FileNotFoundError:
            print(f"✗ File not found: {args.file}")
            return 1

    else:
        # Interactive mode
        print("Modular Math Language Interactive Simulator")
        print("Enter your code (Ctrl+D to finish and run):")
        source_name = "stdin"
        source_text = sys.stdin.read()
        if not source_text.strip():
            print("No input provided. Exiting.")
            return 0

    # --- Parsing and Simulation ---

    if source_text is None:
        parser.print_help()
        return 1

    try:
        if args.verbose:
            print(f"Parsing {source_name}...")

        ast = parse_string(source_text)
        run_simulation(ast, args)
        return 0

    except ParseError as e:
        print(f"Parse error in {source_name}: {e}")
        return 1
    except Exception as e:
        print(f"An unexpected error occurred in {source_name}: {e}")
        if args.verbose:
            import traceback
            traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
