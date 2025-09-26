#!/usr/bin/env python3
"""Get the exact VM output for the exponential decay test."""

import sys
sys.path.append('/storage/emulated/0/dev')

from test_runner import run_single_test

# Load and run the exact test case
test_case = {
    "test_name": "Test exponential decay",
    "module_file": "examples/ex28_exponential_decay.txt",
    "module_name": "decay_example",
    "parameters": {
        "initial_value": 100,
        "decay_rate": 0.8
    },
    "max_steps": 5,
    "expected_output": {
        "decay_out": [100, 80, 64, 51.2, 40.96]  # This is what we're trying to verify
    }
}

success, error_msg, actual_results = run_single_test(test_case)

print("=== VM OUTPUT FOR EXPONENTIAL DECAY TEST ===")
print(f"Success: {success}")
if error_msg:
    print(f"Error: {error_msg}")

print(f"VM Results:")
for signal, values in actual_results.items():
    print(f"  {signal}: {values}")

print(f"\nTest expects:")
for signal, values in test_case['expected_output'].items():
    print(f"  {signal}: {values}")

print(f"\nFormatted for test file update:")
print(f'  "decay_out": {actual_results.get("decay_out", [])}')