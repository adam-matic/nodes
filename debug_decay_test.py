#!/usr/bin/env python3

import sys
sys.path.append('/storage/emulated/0/dev')

from modular_math.parser import parse_file
from modular_math.vm import VirtualMachine
from modular_math.ast_nodes import *

# Parse the exponential decay module
program = parse_file('examples/ex28_exponential_decay.txt')

# Find the target module
target_module = None
for module in program.modules:
    if module.name == 'decay_example':
        target_module = module
        break

if not target_module:
    print("Target module 'decay_example' not found!")
    exit(1)

# Apply test parameters by modifying the module
test_params = {'initial_value': 100, 'decay_rate': 0.8}
new_body = []
for stmt in target_module.body:
    if isinstance(stmt, ParameterDeclaration) and stmt.name in test_params:
        # Replace with parameter that has the test value as default
        param_value = test_params[stmt.name]
        new_param = ParameterDeclaration(
            name=stmt.name,
            default_value=NumberLiteral(value=float(param_value))
        )
        new_body.append(new_param)
        print(f"Modified parameter {stmt.name} = {param_value}")
    else:
        new_body.append(stmt)

modified_module = ModuleDefinition(name=target_module.name, body=new_body)

# Create execution block
save_expressions = [Identifier(name='decay_out')]
execution = ExecutionBlock(
    max_steps=5,
    save=save_expressions
)

# Create synthetic AST
all_modules = []
for module in program.modules:
    if module.name == target_module.name:
        all_modules.append(modified_module)
    else:
        all_modules.append(module)

synthetic_ast = Program(
    imports=program.imports,
    modules=all_modules,
    execution=execution
)

# Create VM and run
vm = VirtualMachine()
vm.load_program(synthetic_ast)
vm.max_steps = 5

results = vm.run()

print("\nResults:")
for signal_name, values in results.items():
    print(f"  {signal_name}: {values}")

print("\nExpected:")
print("  decay_out: [100, 80, 64, 51.2, 40.96]")