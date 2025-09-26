#!/usr/bin/env python3

from test_runner import run_single_test, load_test_case

test_case = load_test_case("tests/range_test.json")
success, error, results = run_single_test(test_case)

print(f"Success: {success}")
print(f"Error: {error}")
print(f"Actual: {results.get('current_value', [])}")
print(f"Expected: {test_case['expected_output']['current_value']}")
print(f"Length - Actual: {len(results.get('current_value', []))}, Expected: {len(test_case['expected_output']['current_value'])}")