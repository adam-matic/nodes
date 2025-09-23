#!/usr/bin/env python3
"""
Test script for the Virtual Machine
"""

from parser import parse_string, parse_file
from vm import VirtualMachine


def test_simple_constant():
    """Test a simple constant module."""
    code = """
    module const {
        param value = 42
        output value
    }

    execution {
        max_steps: 5
        save: [value]
    }
    """

    ast = parse_string(code)
    vm = VirtualMachine()
    vm.load_program(ast)

    print("=== Simple Constant Test ===")
    print(f"Operations: {len(vm.operations)}")
    for i, op in enumerate(vm.operations):
        print(f"  {i}: {op.name} -> {op.output}")

    print(f"Signals: {list(vm.signals.keys())}")
    print(f"Operation order: {vm.operation_order}")

    results = vm.run()
    print("Results:", results)


def test_simple_addition():
    """Test a simple addition."""
    code = """
    module addition {
        a = 10
        b = 32
        result = add(a, b)
        output result
    }

    execution {
        max_steps: 3
        save: [result]
    }
    """

    ast = parse_string(code)
    vm = VirtualMachine()
    vm.load_program(ast)

    print("\n=== Simple Addition Test ===")
    print(f"Operations: {len(vm.operations)}")
    for i, op in enumerate(vm.operations):
        print(f"  {i}: {op.name}({op.inputs}) -> {op.output}")

    results = vm.run()
    print("Results:", results)


def test_counter():
    """Test a counter with memory."""
    code = """
    module counter {
        next_value = add(current_value, 1)
        current_value = mem(0, next_value)
        output current_value
    }

    execution {
        max_steps: 5
        save: [current_value, next_value]
    }
    """

    ast = parse_string(code)
    vm = VirtualMachine()
    vm.load_program(ast)

    print("\n=== Counter Test ===")
    print(f"Operations: {len(vm.operations)}")
    for i, op in enumerate(vm.operations):
        print(f"  {i}: {op.name}({op.inputs}) -> {op.output} [{op.op_type}]")

    print(f"Memory blocks: {len(vm.memory_blocks)}")
    for mem in vm.memory_blocks:
        print(f"  {mem.name}: {mem.input_signal} -> {mem.output_signal} (init: {mem.initial_value})")

    results = vm.run()
    print("Results:", results)


def test_real_examples():
    """Test with real example files."""
    examples = [
        'ex01_addition.txt',
        'ex02_counter.txt',
        'ex05_halt_at_step.txt',  # This one has a HALT condition
    ]

    for example in examples:
        print(f"\n=== Testing {example} ===")
        try:
            ast = parse_file(f'/storage/emulated/0/dev/examples/{example}')
            vm = VirtualMachine()
            vm.load_program(ast)

            results = vm.run()
            print(f"✓ Success! Results: {results}")

        except Exception as e:
            print(f"✗ Failed: {e}")


if __name__ == "__main__":
    test_simple_constant()
    test_simple_addition()
    test_counter()
    test_real_examples()