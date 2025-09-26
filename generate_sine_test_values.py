#!/usr/bin/env python3
"""
Generate expected values for sine module parameter tests.
This script runs the sine_wave_generator with different parameters
and outputs the actual results for use in test files.
"""

import sys
import json
from modular_math.parser import parse_file
from modular_math.vm import VirtualMachine
from modular_math.ast_nodes import *

def test_sine_with_params(frequency, amplitude, dt, max_steps):
    """Test sine wave generator with given parameters."""
    # Parse the sine wave file
    ast = parse_file('examples/ex20_sine_wave.txt')

    # Find and modify the sine_wave_generator module parameters
    for module in ast.modules:
        if module.name == 'sine_wave_generator':
            new_body = []
            for stmt in module.body:
                if isinstance(stmt, ParameterDeclaration):
                    if stmt.name == 'frequency':
                        new_stmt = ParameterDeclaration(
                            name='frequency',
                            default_value=NumberLiteral(value=float(frequency))
                        )
                    elif stmt.name == 'amplitude':
                        new_stmt = ParameterDeclaration(
                            name='amplitude',
                            default_value=NumberLiteral(value=float(amplitude))
                        )
                    elif stmt.name == 'dt':
                        new_stmt = ParameterDeclaration(
                            name='dt',
                            default_value=NumberLiteral(value=float(dt))
                        )
                    else:
                        new_stmt = stmt
                    new_body.append(new_stmt)
                else:
                    new_body.append(stmt)

            # Replace the module with updated parameters
            modified_module = ModuleDefinition(name=module.name, body=new_body)
            break

    # Create a new AST with the modified module
    new_modules = []
    for module in ast.modules:
        if module.name == 'sine_wave_generator':
            new_modules.append(modified_module)
        else:
            new_modules.append(module)

    modified_ast = Program(imports=ast.imports, modules=new_modules, execution=ast.execution)

    # Run with VM
    vm = VirtualMachine()
    vm.load_program(modified_ast)

    # Execute for the specified steps
    results = []
    for step in range(max_steps):
        vm.step()
        # Get position value
        position_val = vm.signals.get('position', type('obj', (object,), {'get_value': lambda self, s: 0.0})()).get_value(step)
        results.append(round(position_val, 6))

    return results

def generate_test_files():
    """Generate the test JSON files with correct expected values."""

    # Test 1: frequency=2, amplitude=3, dt=0.1, 8 steps
    print("Generating test 1: frequency=2, amplitude=3...")
    results1 = test_sine_with_params(2, 3, 0.1, 8)

    test1 = {
        "test_name": "Test sine wave generator with different amplitude and frequency parameters",
        "module_file": "examples/ex20_sine_wave.txt",
        "module_name": "sine_wave_generator",
        "parameters": {
            "frequency": 2,
            "amplitude": 3,
            "dt": 0.1
        },
        "max_steps": 8,
        "expected_output": {
            "position": results1
        }
    }

    with open('tests/sine_module_params_test.json', 'w') as f:
        json.dump(test1, f, indent=2)

    # Test 2: frequency=0.5, amplitude=10, dt=0.1, 6 steps
    print("Generating test 2: frequency=0.5, amplitude=10...")
    results2 = test_sine_with_params(0.5, 10, 0.1, 6)

    test2 = {
        "test_name": "Test sine wave generator with low frequency and high amplitude",
        "module_file": "examples/ex20_sine_wave.txt",
        "module_name": "sine_wave_generator",
        "parameters": {
            "frequency": 0.5,
            "amplitude": 10,
            "dt": 0.1
        },
        "max_steps": 6,
        "expected_output": {
            "position": results2
        }
    }

    with open('tests/sine_module_low_freq_test.json', 'w') as f:
        json.dump(test2, f, indent=2)

    print(f"Test 1 results: {results1}")
    print(f"Test 2 results: {results2}")
    print("Test files updated successfully!")

if __name__ == "__main__":
    generate_test_files()