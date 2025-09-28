#!/usr/bin/env python3

import sys
sys.path.append('/storage/emulated/0/dev')

from modular_math.parser import parse_file
from modular_math.vm import VirtualMachine
from modular_math.ast_nodes import *

# Run with test parameters
print("=== STEP-BY-STEP DEBUG ===")
ast = parse_file("examples/ex28_exponential_decay.txt")

target_module = None
for module in ast.modules:
    if module.name == 'decay_example':
        target_module = module
        break

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
    else:
        new_body.append(stmt)

modified_module = ModuleDefinition(name=target_module.name, body=new_body)
execution = ExecutionBlock(max_steps=5, save=[Identifier(name='decay_out')])
all_modules = [modified_module if m.name == target_module.name else m for m in ast.modules]
synthetic_ast = Program(imports=ast.imports, modules=all_modules, execution=execution)

vm = VirtualMachine()
vm.load_program(synthetic_ast)
vm.max_steps = 1  # Only run 1 step for detailed analysis

print(f"Execution order: {vm.operation_order}")

# Execute step 0 manually with debugging
print(f"\n=== EXECUTING STEP 0 ===")
vm.current_step = 0
vm.signals["$step"].set_value(0, 0.0)

for op_idx in vm.operation_order:
    op = vm.operations[op_idx]

    print(f"\n--- Executing Op {op_idx}: {op.name} ({op.op_type}) -> {op.output} ---")

    if op.op_type == 'mem_write':
        continue

    try:
        # Check input values before execution
        if hasattr(op, 'inputs') and op.inputs:
            print(f"  Inputs before:")
            for input_name in op.inputs:
                if input_name in vm.signals:
                    val = vm.signals[input_name].get_value(0)
                    print(f"    {input_name}: {val}")
                else:
                    print(f"    {input_name}: MISSING")

        if op.params:
            print(f"  Params: {op.params}")

        result = op.execute(vm.signals, 0)
        print(f"  Result: {result}")

        if op.output:
            vm.signals[op.output].set_value(0, result)
            print(f"  Set signal '{op.output}' = {result}")

    except Exception as e:
        print(f"  ERROR: {e}")

print(f"\n=== FINAL SIGNAL VALUES AT STEP 0 ===")
for signal_name, signal in vm.signals.items():
    if 'decay_out' in signal_name or signal_name == 'initial_value' or 'current_value' in signal_name:
        val = signal.get_value(0)
        print(f"  {signal_name}: {val}")