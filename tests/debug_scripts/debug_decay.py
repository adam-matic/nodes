#!/usr/bin/env python3

from test_runner import run_single_test, load_test_case

# Load and run the specific test
test_case = load_test_case("tests/ex28_exponential_decay_test.json")
success, error, results = run_single_test(test_case)

print(f"Success: {success}")
print(f"Error: {error}")
print(f"Actual: {results.get('decay_out', [])}")
print(f"Expected: {test_case['expected_output']['decay_out']}")

# Manual calculation check
expected = [100]
for i in range(4):
    expected.append(expected[-1] * 0.8)
print(f"Manual calculation: {expected}")