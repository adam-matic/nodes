#!/usr/bin/env python3

from test_runner import run_single_test, load_test_case
from modular_math.parser import parse_file
from modular_math.vm import VirtualMachine

# Test parameter override directly
test_case = {
    "test_name": "Test param override",
    "module_file": "examples/ex28_exponential_decay.txt",
    "module_name": "decay_example",
    "parameters": {
        "initial_value": 100,
        "decay_rate": 0.8
    },
    "max_steps": 5,
    "expected_output": {
        "decay_out": [100, 80, 64, 51.2, 40.96]
    }
}

success, error, results = run_single_test(test_case)
print(f"Test override result: {results.get('decay_out', [])}")

# Test without override
ast = parse_file("examples/ex28_exponential_decay.txt")
vm = VirtualMachine()
vm.load_program(ast)
vm.max_steps = 5
results2 = vm.run()
print(f"Normal result: {results2.get('decay_out', [])}")