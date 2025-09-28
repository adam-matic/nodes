#!/usr/bin/env python3

from modular_math.parser import parse_file
from modular_math.vm import VirtualMachine
from modular_math.ast_nodes import *

# First test with just the base program (uses module defaults)
print("=== TEST 1: Base program (module defaults) ===")
ast = parse_file("examples/ex28_exponential_decay.txt")

vm = VirtualMachine()
vm.load_program(ast)

print(f"Operations after loading:")
for i, op in enumerate(vm.operations):
    print(f"  Op {i}: {op.name} ({op.op_type}) -> {op.output}")
    if op.params:
        print(f"    Params: {op.params}")

print(f"\nMemory blocks: {len(vm.memory_blocks)}")
for i, mb in enumerate(vm.memory_blocks):
    print(f"  Block {i}: init={mb.initial_value}, input={mb.input_signal}, output={mb.output_signal}")

vm.max_steps = 5
results = vm.run()
print(f"Results: {results}")

# Now test with parameter override (simulating test case)
print("\n=== TEST 2: With test parameters ===")
ast2 = parse_file("examples/ex28_exponential_decay.txt")

# Find and modify decay_example module
target_module = None
for module in ast2.modules:
    if module.name == 'decay_example':
        target_module = module
        break

# Apply test parameters
test_params = {'initial_value': 100, 'decay_rate': 0.8}
new_body = []
for stmt in target_module.body:
    if isinstance(stmt, ParameterDeclaration) and stmt.name in test_params:
        param_value = test_params[stmt.name]
        new_param = ParameterDeclaration(
            name=stmt.name,
            default_value=NumberLiteral(value=float(param_value))
        )
        new_body.append(new_param)
        print(f"Modified: {stmt.name} = {param_value}")
    else:
        new_body.append(stmt)

modified_module = ModuleDefinition(name=target_module.name, body=new_body)

# Create execution
execution = ExecutionBlock(max_steps=5, save=[Identifier(name='decay_out')])

# Replace module in AST
all_modules = [modified_module if m.name == target_module.name else m for m in ast2.modules]
synthetic_ast = Program(imports=ast2.imports, modules=all_modules, execution=execution)

vm2 = VirtualMachine()
vm2.load_program(synthetic_ast)

print(f"\nOperations after loading:")
for i, op in enumerate(vm2.operations):
    print(f"  Op {i}: {op.name} ({op.op_type}) -> {op.output}")
    if op.params:
        print(f"    Params: {op.params}")

print(f"\nOperation execution order: {vm2.operation_order}")

print(f"\nMemory blocks: {len(vm2.memory_blocks)}")
for i, mb in enumerate(vm2.memory_blocks):
    print(f"  Block {i}: init={mb.initial_value}, input={mb.input_signal}, output={mb.output_signal}")

vm2.max_steps = 5
results2 = vm2.run()
print(f"Results: {results2}")
print("Expected: [100, 80, 64, 51.2, 40.96]")