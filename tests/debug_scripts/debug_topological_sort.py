#!/usr/bin/env python3
"""Debug script to show topological sort order for sine wave example."""

from modular_math.parser import parse_file
from modular_math.vm import VirtualMachine

def debug_operation_order(filename):
    """Parse a file and show the operation order after topological sort."""
    print(f"=== Debugging Operation Order for {filename} ===\n")

    # Parse the program
    program = parse_file(filename)

    # Create VM and load the program
    vm = VirtualMachine()
    vm.load_program(program)

    print("=== All Operations (before sort) ===")
    for i, op in enumerate(vm.operations):
        print(f"{i:2d}: {op.name:15} ({op.op_type:10}) -> {op.output:25} inputs: {op.inputs}")

    print(f"\n=== Operation Order (after topological sort) ===")
    for order, op_idx in enumerate(vm.operation_order):
        op = vm.operations[op_idx]
        print(f"{order:2d}: op[{op_idx:2d}] {op.name:15} ({op.op_type:10}) -> {op.output:25} inputs: {op.inputs}")

    print(f"\n=== Signal Dependencies ===")
    # Build signal dependency graph for visualization
    signal_producers = {}
    for i, op in enumerate(vm.operations):
        if op.output:
            signal_producers[op.output] = i

    print("Signal -> Producer Operation:")
    for signal, producer_idx in signal_producers.items():
        producer_op = vm.operations[producer_idx]
        print(f"  {signal:25} <- op[{producer_idx:2d}] {producer_op.name}")

    print("\nOperation Dependencies:")
    for order, op_idx in enumerate(vm.operation_order):
        op = vm.operations[op_idx]
        dependencies = []
        for input_signal in op.inputs:
            if input_signal in signal_producers:
                dep_idx = signal_producers[input_signal]
                dep_op = vm.operations[dep_idx]
                dependencies.append(f"op[{dep_idx}]({dep_op.name})")

        deps_str = ", ".join(dependencies) if dependencies else "none"
        print(f"  op[{op_idx:2d}] {op.name:15} depends on: {deps_str}")

if __name__ == "__main__":
    debug_operation_order("examples/ex20_sine_wave.txt")