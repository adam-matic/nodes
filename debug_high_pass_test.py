#!/usr/bin/env python3
"""
Debug script to compare VM output vs expected values for high-pass filter test.
"""

import json
import sys
from modular_math.parser import parse_file
from modular_math.vm import VirtualMachine
from calculate_high_pass_expected import simulate_high_pass_example

def load_test_case():
    """Load the high-pass filter test case."""
    with open('tests/ex25_high_pass_filter_test.json', 'r') as f:
        return json.load(f)

def run_vm_test(test_case):
    """Run the VM with the same parameters as the test."""
    # Parse the module file
    module_file = f"/storage/emulated/0/dev/{test_case['module_file']}"
    ast = parse_file(module_file)

    # Create VM and load program
    vm = VirtualMachine()
    vm.load_program(ast)
    vm.max_steps = test_case['max_steps']

    # Run the simulation
    return vm.run()

def main():
    print("=== High-Pass Filter Test Debug ===")

    # Load test case
    test_case = load_test_case()
    print(f"Test: {test_case['test_name']}")
    print(f"Max steps: {test_case['max_steps']}")

    # Run VM
    print("\n1. Running VM...")
    vm_results = run_vm_test(test_case)

    # Run Python simulation
    print("2. Running Python simulation...")
    python_results = simulate_high_pass_example(max_steps=test_case['max_steps'])

    # Compare results
    print("\n3. Comparison:")
    expected = test_case['expected_output']['filtered_signal']
    vm_actual = vm_results['filtered_signal']
    python_actual = python_results['filtered_signal']

    print("Step | Expected   | VM Actual          | Python Actual      | VM-Exp Diff    | Py-VM Diff")
    print("-" * 95)

    for i in range(len(expected)):
        exp_val = expected[i]
        vm_val = vm_actual[i] if i < len(vm_actual) else "N/A"
        py_val = python_actual[i] if i < len(python_actual) else "N/A"

        if isinstance(vm_val, (int, float)) and isinstance(exp_val, (int, float)):
            vm_diff = vm_val - exp_val
            py_vm_diff = py_val - vm_val if isinstance(py_val, (int, float)) else "N/A"
        else:
            vm_diff = "N/A"
            py_vm_diff = "N/A"

        print(f"{i:4d} | {exp_val:10.6f} | {vm_val:18.6f} | {py_val:18.6f} | {vm_diff:13.6f} | {py_vm_diff}")

    print(f"\nVM results (full precision):")
    print(f"  filtered_signal: {vm_actual}")

    print(f"\nTest file should contain:")
    print(f'  "filtered_signal": {vm_actual}')

if __name__ == "__main__":
    main()