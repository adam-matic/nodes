#!/usr/bin/env python3
"""
Test Runner for Modular Math Language VM

Runs all test cases and compares VM output against expected results.
"""

import os
import json
import glob
from typing import Dict, List, Any, Tuple
from parser import parse_file, ParseError
from vm import VirtualMachine
from ast_nodes import *


def load_test_case(test_file: str) -> Dict[str, Any]:
    """Load a test case from JSON file."""
    with open(test_file, 'r') as f:
        return json.load(f)


def run_single_test(test_case: Dict[str, Any]) -> Tuple[bool, str, Dict[str, List[float]]]:
    """
    Run a single test case.

    Returns:
        (success, error_message, actual_results)
    """
    try:
        # Parse the module file
        module_file = test_case['module_file']
        if not module_file.startswith('/'):
            module_file = f"/storage/emulated/0/dev/{module_file}"

        ast = parse_file(module_file)

        # Check if this is a module-specific test
        if 'module_name' in test_case and 'parameters' in test_case:
            # Find the target module in the AST
            target_module = None
            for module in ast.modules:
                if module.name == test_case['module_name']:
                    target_module = module
                    break

            if not target_module:
                return False, f"Module '{test_case['module_name']}' not found in {module_file}", {}

            # Apply parameters by modifying the target module directly
            modified_module = target_module
            if test_case['parameters']:
                # Create new declarations with the test values
                new_body = []
                for stmt in target_module.body:
                    if isinstance(stmt, ParameterDeclaration) and stmt.name in test_case['parameters']:
                        # Replace with parameter that has the test value as default
                        param_value = test_case['parameters'][stmt.name]
                        if param_value == "$step":
                            new_param = ParameterDeclaration(
                                name=stmt.name,
                                default_value=None  # Will be handled as step variable
                            )
                        else:
                            new_param = ParameterDeclaration(
                                name=stmt.name,
                                default_value=NumberLiteral(value=float(param_value))
                            )
                        new_body.append(new_param)
                    elif isinstance(stmt, InputDeclaration) and stmt.name in test_case['parameters']:
                        # Convert input to assignment
                        param_value = test_case['parameters'][stmt.name]
                        if param_value == "$step":
                            assignment = Assignment(
                                target=stmt.name,
                                value=StepVariable()
                            )
                        else:
                            assignment = Assignment(
                                target=stmt.name,
                                value=NumberLiteral(value=float(param_value))
                            )
                        new_body.append(assignment)
                    else:
                        new_body.append(stmt)

                modified_module = ModuleDefinition(name=target_module.name, body=new_body)

            # Create execution block
            save_signals = list(test_case.get('expected_output', {}).keys())
            save_expressions = [Identifier(name=signal) for signal in save_signals] if save_signals else None
            execution = ExecutionBlock(
                max_steps=test_case.get('max_steps', 10),
                save=save_expressions
            )

            # Create synthetic AST with all modules, but replace the target module
            all_modules = []
            for module in ast.modules:
                if module.name == target_module.name:
                    all_modules.append(modified_module)  # Use the modified version
                else:
                    all_modules.append(module)  # Keep the original

            synthetic_ast = Program(
                imports=ast.imports,
                modules=all_modules,
                execution=execution
            )

            ast = synthetic_ast

        # Create VM and load program
        vm = VirtualMachine()
        vm.load_program(ast)

        # Override max_steps if specified in test
        if 'max_steps' in test_case:
            vm.max_steps = test_case['max_steps']

        # Run the simulation
        results = vm.run()

        return True, "", results

    except Exception as e:
        return False, str(e), {}


def compare_results(expected: Dict[str, List[float]], actual: Dict[str, List[float]], tolerance: float = 1e-6) -> Tuple[bool, str]:
    """
    Compare expected and actual results.

    Returns:
        (match, error_message)
    """
    for signal_name, expected_values in expected.items():
        if signal_name not in actual:
            return False, f"Missing signal '{signal_name}' in actual results"

        actual_values = actual[signal_name]

        # Check length
        if len(expected_values) != len(actual_values):
            return False, f"Signal '{signal_name}': expected {len(expected_values)} values, got {len(actual_values)}"

        # Check values
        for i, (exp_val, act_val) in enumerate(zip(expected_values, actual_values)):
            if abs(exp_val - act_val) > tolerance:
                return False, f"Signal '{signal_name}' at step {i}: expected {exp_val}, got {act_val}"

    return True, ""


def format_test_result(test_name: str, success: bool, error_msg: str = "",
                      expected: Dict = None, actual: Dict = None) -> str:
    """Format test result for display."""
    if success:
        return f"✓ {test_name}"
    else:
        result = f"✗ {test_name}\n  Error: {error_msg}"

        if expected and actual:
            result += "\n  Expected vs Actual:"
            for signal_name in expected.keys():
                if signal_name in actual:
                    exp_vals = expected[signal_name]
                    act_vals = actual[signal_name]
                    result += f"\n    {signal_name}: {exp_vals[:5]}{'...' if len(exp_vals) > 5 else ''}"
                    result += f"\n    {signal_name}: {act_vals[:5]}{'...' if len(act_vals) > 5 else ''}"

        return result


def run_all_tests(verbose: bool = False, filter_pattern: str = None) -> Tuple[int, int]:
    """
    Run all test cases.

    Returns:
        (passed_count, total_count)
    """
    test_dir = "/storage/emulated/0/dev/tests"
    test_files = glob.glob(f"{test_dir}/*.json")

    if filter_pattern:
        test_files = [f for f in test_files if filter_pattern in os.path.basename(f)]

    test_files.sort()

    passed = 0
    total = len(test_files)

    print(f"Running {total} test cases...\n")

    for test_file in test_files:
        test_case = load_test_case(test_file)
        test_name = test_case.get('test_name', os.path.basename(test_file))

        # Run the test
        success, error_msg, actual_results = run_single_test(test_case)

        if success:
            # Compare results
            expected_output = test_case.get('expected_output', {})
            tolerance = test_case.get('tolerance', 1e-6)  # Allow test-specific tolerance
            match, compare_error = compare_results(expected_output, actual_results, tolerance)

            if match:
                passed += 1
                print(format_test_result(test_name, True))
            else:
                print(format_test_result(test_name, False, compare_error, expected_output, actual_results))
        else:
            print(format_test_result(test_name, False, error_msg))

        if verbose and success:
            print(f"  Results: {actual_results}")
            print()

    return passed, total


def main():
    import argparse

    parser = argparse.ArgumentParser(description='Run VM test cases')
    parser.add_argument('--verbose', '-v', action='store_true', help='Verbose output')
    parser.add_argument('--filter', help='Filter test files by pattern')
    parser.add_argument('--single', help='Run a single test file')

    args = parser.parse_args()

    if args.single:
        # Run single test
        test_file = args.single
        if not test_file.startswith('/'):
            test_file = f"/storage/emulated/0/dev/tests/{test_file}"
        if not test_file.endswith('.json'):
            test_file += '.json'

        test_case = load_test_case(test_file)
        test_name = test_case.get('test_name', os.path.basename(test_file))

        print(f"Running single test: {test_name}")
        success, error_msg, actual_results = run_single_test(test_case)

        if success:
            expected_output = test_case.get('expected_output', {})
            tolerance = test_case.get('tolerance', 1e-6)  # Allow test-specific tolerance
            match, compare_error = compare_results(expected_output, actual_results, tolerance)

            print(f"Expected: {expected_output}")
            print(f"Actual:   {actual_results}")
            print(f"Match: {match}")
            if not match:
                print(f"Error: {compare_error}")
        else:
            print(f"Execution failed: {error_msg}")
    else:
        # Run all tests
        passed, total = run_all_tests(args.verbose, args.filter)

        print(f"\n=== Test Summary ===")
        print(f"Passed: {passed}/{total}")
        print(f"Success Rate: {100 * passed / total:.1f}%")

        if passed == total:
            print("🎉 All tests passed!")
        else:
            print(f"❌ {total - passed} tests failed")


if __name__ == "__main__":
    main()