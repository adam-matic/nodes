#!/usr/bin/env python3
"""
Main script to demonstrate the tokenizer and parser for the modular math language.
"""

import sys
import argparse
from parser import parse_file, parse_string, ParseError
from ast_nodes import ASTPrinter


def main():
    parser = argparse.ArgumentParser(description='Parse modular math language files')
    parser.add_argument('file', nargs='?', help='File to parse')
    parser.add_argument('--print-ast', action='store_true', help='Print the AST')
    parser.add_argument('--example', help='Run with a built-in example')

    args = parser.parse_args()

    if args.example:
        # Built-in examples
        examples = {
            'simple': """
                module const {
                    param value
                    output value
                }
            """,
            'counter': """
                module counter {
                    next_value = add(current_value, 1)
                    current_value = mem(0, next_value)
                    output current_value
                }

                execution {
                    max_steps: 10
                    save: [current_value]
                }
            """,
            'addition': """
                import const

                module addition_example {
                    a = const(value=10)
                    b = const(value=32)
                    result = add(a, b)
                    output result
                }

                execution {
                    max_steps: 5
                    save: [result]
                }
            """
        }

        if args.example not in examples:
            print(f"Unknown example: {args.example}")
            print(f"Available examples: {', '.join(examples.keys())}")
            return 1

        try:
            ast = parse_string(examples[args.example])
            print(f"✓ Successfully parsed example '{args.example}'")

            if args.print_ast:
                print("\n--- AST ---")
                printer = ASTPrinter()
                printer.visit(ast)

        except ParseError as e:
            print(f"✗ Parse error in example '{args.example}': {e}")
            return 1

    elif args.file:
        try:
            ast = parse_file(args.file)
            print(f"✓ Successfully parsed {args.file}")

            if args.print_ast:
                print("\n--- AST ---")
                printer = ASTPrinter()
                printer.visit(ast)

        except ParseError as e:
            print(f"✗ Parse error in {args.file}: {e}")
            return 1
        except FileNotFoundError:
            print(f"✗ File not found: {args.file}")
            return 1

    else:
        # Interactive mode
        print("Modular Math Language Parser")
        print("Enter your code (Ctrl+D to finish):")

        try:
            code = sys.stdin.read()
            ast = parse_string(code)
            print("✓ Successfully parsed input")

            if args.print_ast:
                print("\n--- AST ---")
                printer = ASTPrinter()
                printer.visit(ast)

        except ParseError as e:
            print(f"✗ Parse error: {e}")
            return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())