#!/usr/bin/env python3
"""Simple test to show memory block behavior clearly."""

from modular_math.parser import parse_string
from modular_math.vm import VirtualMachine

def test_simple_memory():
    """Test memory with a simple incrementing counter."""

    program_text = '''
    module test {
        // Simple counter: current + 1 each step
        increment = add(previous, 1)
        previous = mem(5, increment)  // Start at 5
        output previous
        output increment
    }

    execution {
        max_steps: 6
        save: [previous, increment]
    }
    '''

    print("=== Simple Memory Block Test ===")
    print("Starting value: 5, increment by 1 each step")
    print()

    program = parse_string(program_text)
    vm = VirtualMachine()
    vm.load_program(program)

    # Show the operations
    print("Operations created:")
    for i, op in enumerate(vm.operations):
        if op.op_type == 'mem_read':
            print(f"  {i}: {op.op_type} -> {op.output} (reads from {op.inputs[0]}, initial={op.params['initial_value']})")
        else:
            print(f"  {i}: {op.op_type} {op.name} -> {op.output} (inputs: {op.inputs})")

    # Run and show results
    vm.run()
    results = vm.get_results()

    print(f"\nResults:")
    print("Step | Previous | Increment | Memory Behavior")
    print("-----|----------|-----------|----------------")

    previous_vals = results['previous']
    increment_vals = results['increment']

    for step in range(len(previous_vals)):
        prev = previous_vals[step]
        inc = increment_vals[step]

        if step == 0:
            behavior = "previous = initial_value (5)"
        else:
            behavior = f"previous = increment from step {step-1} ({increment_vals[step-1]})"

        print(f"{step:4d} | {prev:8.0f} | {inc:9.0f} | {behavior}")

if __name__ == "__main__":
    test_simple_memory()