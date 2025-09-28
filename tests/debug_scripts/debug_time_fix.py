#!/usr/bin/env python3

from test_runner import run_single_test, load_test_case

# Test time module
time_test = load_test_case("tests/time_example_test.json")
success, error, results = run_single_test(time_test)
print("=== TIME MODULE TEST ===")
print(f"Success: {success}")
print(f"Error: {error}")
print(f"Actual: {results.get('timer', [])}")
print(f"Expected: {time_test['expected_output']['timer']}")

# Test range module to make sure we didn't break it
range_test = load_test_case("tests/range_test.json")
success2, error2, results2 = run_single_test(range_test)
print("\n=== RANGE MODULE TEST ===")
print(f"Success: {success2}")
print(f"Error: {error2}")
print(f"Actual: {results2.get('current_value', [])}")
print(f"Expected: {range_test['expected_output']['current_value']}")