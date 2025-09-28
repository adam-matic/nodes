#!/usr/bin/env python3
"""
Command-line interface for the Modular Math Language.

This module provides the main entry point for parsing and running
modular math language programs from the command line.
"""

import sys
import argparse
from pathlib import Path

# Add the parent directory to the Python path so we can import modular_math
sys.path.insert(0, str(Path(__file__).parent.parent))

from modular_math.tokenizer import Tokenizer
from modular_math.parser import Parser
from modular_math.vm import VirtualMachine


BUILTIN_EXAMPLES = {
    'simple': '''
module simple {
    result = add(2, 3)
    output result
}

execution {
    max_steps: 1
    save: [result]
}
''',
    'counter': '''
module counter {
    next_value = add(current_value, 1)
    current_value = mem(0, next_value)
    output current_value
}

execution {
    max_steps: 10
    save: [current_value]
}
''',
    'addition': '''
module addition {
    result = add(5, 7)
    output result
}

execution {
    max_steps: 1
    save: [result]
}
'''
}


def main():
    parser = argparse.ArgumentParser(description='Modular Math Language Interpreter')
    parser.add_argument('file', nargs='?', help='Source file to parse and run')
    parser.add_argument('--example', choices=BUILTIN_EXAMPLES.keys(),
                       help='Run a built-in example')
    parser.add_argument('--print-ast', action='store_true',
                       help='Print the Abstract Syntax Tree')
    parser.add_argument('--interactive', '-i', action='store_true',
                       help='Enter interactive mode')

    args = parser.parse_args()

    # Determine source code
    if args.example:
        source_code = BUILTIN_EXAMPLES[args.example]
        print(f"Running built-in example: {args.example}")
    elif args.file:
        try:
            with open(args.file, 'r') as f:
                source_code = f.read()
            print(f"Running file: {args.file}")
        except FileNotFoundError:
            print(f"Error: File '{args.file}' not found.")
            return 1
        except Exception as e:
            print(f"Error reading file: {e}")
            return 1
    elif args.interactive:
        print("Modular Math Language - Interactive Mode")
        print("Enter your program (Ctrl+D or Ctrl+Z to finish):")
        try:
            source_code = sys.stdin.read()
        except KeyboardInterrupt:
            print("\nExiting...")
            return 0
    else:
        # No input provided, show help
        parser.print_help()
        return 0

    try:
        # Tokenize
        tokenizer = Tokenizer(source_code)
        tokens = tokenizer.tokenize()

        # Parse
        parser_obj = Parser(tokens)
        ast = parser_obj.parse()

        if args.print_ast:
            print("\nAbstract Syntax Tree:")
            print(ast)
            print()

        # Execute
        vm = VirtualMachine()
        source_file = args.file if args.file else None
        vm.load_program(ast, source_file)
        print("\nExecution Results:")
        results = vm.run()

        # Print results
        for signal_name, values in results.items():
            print(f"{signal_name}: {values}")

    except Exception as e:
        print(f"Error: {e}")
        return 1

    return 0


if __name__ == '__main__':
    sys.exit(main())