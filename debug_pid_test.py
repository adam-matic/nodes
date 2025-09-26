#!/usr/bin/env python3

import json
import sys
from modular_math.parser import parse_file
from modular_math.vm import VirtualMachine
from modular_math.ast_nodes import *

def debug_pid_test():
    """Debug the PID test to understand the discrepancy."""

    # Load test parameters
    with open("tests/ex23_pid_controller_test.json", "r") as f:
        test_data = json.load(f)

    print("=== PID Test Debug ===")
    print(f"Module: {test_data['module_name']}")
    print(f"Parameters: {test_data['parameters']}")
    print(f"Max steps: {test_data['max_steps']}")
    print()

    # Parse and run the module
    try:
        ast = parse_file(test_data["module_file"])
        vm = VirtualMachine()

        # Find the target module
        target_module = None
        for node in ast.modules:
            if node.name == test_data["module_name"]:
                target_module = node
                break

        if not target_module:
            print(f"ERROR: Module {test_data['module_name']} not found")
            return

        # Create execution block with test parameters

        # Apply parameters by modifying the target module directly
        modified_module = target_module
        if test_data.get('parameters'):
            # Create new declarations with the test values
            new_body = []
            for stmt in target_module.body:
                if isinstance(stmt, ParameterDeclaration) and stmt.name in test_data['parameters']:
                    # Replace with parameter that has the test value as default
                    param_value = test_data['parameters'][stmt.name]
                    new_param = ParameterDeclaration(
                        name=stmt.name,
                        default_value=NumberLiteral(value=float(param_value))
                    )
                    new_body.append(new_param)
                else:
                    new_body.append(stmt)
            modified_module = ModuleDefinition(name=target_module.name, body=new_body)

        # Create execution block
        save_signals = list(test_data.get('expected_output', {}).keys())
        save_expressions = [Identifier(name=signal) for signal in save_signals] if save_signals else None
        execution = ExecutionBlock(
            max_steps=test_data.get('max_steps', 10),
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

        # Create VM and load program
        vm.load_program(synthetic_ast)
        vm.max_steps = test_data["max_steps"]

        # Run the simulation
        result = vm.run()

        # Debug the module parameters
        print("=== Module Analysis ===")
        print(f"Target module body:")
        for i, stmt in enumerate(target_module.body):
            print(f"  {i}: {type(stmt).__name__} - {stmt}")

        print("\n=== Modified Module Analysis ===")
        print(f"Modified module body:")
        for i, stmt in enumerate(modified_module.body):
            print(f"  {i}: {type(stmt).__name__} - {stmt}")

        print("\n=== Actual Results ===")
        for signal_name, values in result.items():
            if signal_name != "$step":
                print(f"{signal_name}: {values}")

        print("\n=== Expected Results ===")
        for signal_name, expected_values in test_data["expected_output"].items():
            print(f"{signal_name}: {expected_values}")

        print("\n=== Comparison ===")
        for signal_name in test_data["expected_output"]:
            actual = result.get(signal_name, [])
            expected = test_data["expected_output"][signal_name]

            print(f"\n{signal_name}:")
            print("Step | Expected | Actual   | Diff")
            print("-----|----------|----------|----------")
            for i in range(min(len(expected), len(actual))):
                diff = abs(expected[i] - actual[i]) if i < len(actual) else "missing"
                print(f"  {i:2} | {expected[i]:8.3f} | {actual[i]:8.3f} | {diff}")

    except Exception as e:
        print(f"ERROR: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    debug_pid_test()