#!/usr/bin/env python3

from test_runner import run_single_test, load_test_case
import json

# Load and run the specific test
test_case = load_test_case("tests/ex21_square_wave_test.json")
print("Test case:", json.dumps(test_case, indent=2))

success, error, results = run_single_test(test_case)
print(f"\nSuccess: {success}")
print(f"Error: {error}")
print(f"Actual results: {results.get('square_out', [])[:25]}")
print(f"Expected: {test_case['expected_output']['square_out']}")