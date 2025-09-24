#!/usr/bin/env python3
"""
Show the expected vs actual output for the sine module tests.
"""

import json
from test_runner import run_single_test, load_test_case

def show_test_results(test_file):
    """Load and run a test, showing expected vs actual values."""
    print(f"\n=== {test_file} ===")

    # Load test case
    test_case = load_test_case(test_file)
    print(f"Test: {test_case['test_name']}")
    print(f"Parameters: {test_case['parameters']}")

    # Run the test
    success, error_msg, actual_results = run_single_test(test_case)

    print(f"\nResult: {'PASS' if success else 'FAIL'}")
    if not success:
        print(f"Error: {error_msg}")

    # Show expected vs actual values
    expected = test_case['expected_output']
    print(f"\nExpected values:")
    for signal_name, values in expected.items():
        print(f"  {signal_name}: {values}")

    print(f"\nActual values:")
    for signal_name, values in actual_results.items():
        if signal_name in expected:
            print(f"  {signal_name}: {values}")

    return success

if __name__ == "__main__":
    print("Sine Module Test Results")
    print("=" * 50)

    # Test both sine parameter tests
    test1_pass = show_test_results("tests/sine_module_params_test.json")
    test2_pass = show_test_results("tests/sine_module_low_freq_test.json")

    print(f"\n" + "=" * 50)
    print(f"Summary: {sum([test1_pass, test2_pass])}/2 tests passed")

    if test1_pass and test2_pass:
        print("\n✅ Both sine parameter tests verify that:")
        print("  - Frequency parameters are correctly passed and used")
        print("  - Amplitude parameters are correctly passed and used")
        print("  - Different parameter combinations produce expected results")
    else:
        print("\n❌ Some tests failed - parameter passing may have issues")