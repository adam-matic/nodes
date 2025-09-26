#!/usr/bin/env python3
"""Test script to demonstrate memory block behavior."""

from modular_math.parser import parse_string
from modular_math.vm import VirtualMachine

def test_memory_behavior():
    """Test and demonstrate how memory blocks work."""

    # Simple counter example to show memory behavior
    program_text = '''
    module counter {
        next_value = add(current_value, 1)
        current_value = mem(0, next_value)
        output current_value
    }

    execution {
        max_steps: 5
        save: [current_value, next_value]
    }
    '''

    print("=== Testing Memory Block Behavior ===")
    print("Program:")
    print(program_text)

    # Parse and load the program
    program = parse_string(program_text)
    vm = VirtualMachine()
    vm.load_program(program)

    print("\n=== Operations Created ===")
    for i, op in enumerate(vm.operations):
        print(f"{i:2d}: {op.name:15} ({op.op_type:10}) -> {op.output:20} inputs: {op.inputs}")

    print(f"\n=== Execution Order ===")
    for order, op_idx in enumerate(vm.operation_order):
        op = vm.operations[op_idx]
        print(f"{order:2d}: op[{op_idx:2d}] {op.name:15} -> {op.output:20}")

    print(f"\n=== Step-by-Step Execution ===")

    # Run step by step and show what happens
    for step in range(5):
        print(f"\n--- Step {step} ---")

        # Show signal values before this step
        print("Signal values before step execution:")
        for signal_name, signal in vm.signals.items():
            if len(signal.values) > step:
                print(f"  {signal_name:20} = {signal.get_value(step)}")
            else:
                print(f"  {signal_name:20} = (not set)")

        # Execute one step
        vm.step()

        # Show signal values after this step
        print("Signal values after step execution:")
        for signal_name, signal in vm.signals.items():
            if len(signal.values) > step:
                print(f"  {signal_name:20} = {signal.get_value(step)}")
            else:
                print(f"  {signal_name:20} = (not set)")

    print(f"\n=== Final Results ===")
    results = vm.get_results()
    for signal_name, values in results.items():
        print(f"{signal_name:20}: {values}")

def test_memory_with_changing_input():
    """Test memory block with a changing input to show read/write behavior."""

    program_text = '''
    module memory_test {
        // Input changes each step: step * 10
        input_signal = mult($step, 10)

        // Memory block stores the input_signal
        stored_value = mem(42, input_signal)

        output input_signal
        output stored_value
    }

    execution {
        max_steps: 6
        save: [input_signal, stored_value]
    }
    '''

    print("\n\n=== Testing Memory with Changing Input ===")
    print("Program:")
    print(program_text)

    program = parse_string(program_text)
    vm = VirtualMachine()
    vm.load_program(program)

    print(f"\n=== Memory Operation Details ===")
    for i, op in enumerate(vm.operations):
        if op.op_type == 'mem_read':
            print(f"Memory operation: {op.name} -> {op.output}")
            print(f"  Inputs: {op.inputs}")
            print(f"  Params: {op.params}")

    # Run the simulation
    vm.run()

    print(f"\n=== Step-by-Step Analysis ===")
    results = vm.get_results()

    steps = results.get('$step', list(range(len(results['input_signal']))))
    input_values = results['input_signal']
    stored_values = results['stored_value']

    print("Step | Input | Stored | Explanation")
    print("-----|-------|--------|------------")
    for i, (step, inp, stored) in enumerate(zip(steps, input_values, stored_values)):
        if i == 0:
            explanation = "stored = initial_value (42)"
        else:
            explanation = f"stored = input from step {i-1} ({input_values[i-1]})"
        print(f"{int(step):4d} | {inp:5.0f} | {stored:6.0f} | {explanation}")

if __name__ == "__main__":
    test_memory_behavior()
    test_memory_with_changing_input()