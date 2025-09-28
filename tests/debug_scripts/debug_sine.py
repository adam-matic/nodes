#!/usr/bin/env python3
"""Debug sine wave generator specifically."""

from modular_math.parser import parse_file
from modular_math.vm import VirtualMachine

# Parse the actual sine wave example
ast = parse_file('/storage/emulated/0/dev/examples/ex20_sine_wave.txt')
vm = VirtualMachine()
vm.load_program(ast)

print("=== Operations (first 20) ===")
for i, op in enumerate(vm.operations[:20]):
    print(f"{i}: {op.name} ({op.op_type}) -> {op.output}")
    if op.inputs:
        print(f"    inputs: {op.inputs}")
    if op.params:
        print(f"    params: {op.params}")
    print()

print(f"\n=== Key Signals at Step 0 ===")
key_signals = ['sine_out', 'sine_out.frequency', 'sine_out.amplitude', 'sine_out.dt',
               'sine_out.initial_velocity', 'sine_out.position', 'sine_out.velocity']
for name in key_signals:
    if name in vm.signals:
        print(f"{name}: {vm.signals[name].values[0]}")

# Run just one step
vm.step()
print(f"\n=== Key Signals at Step 1 ===")
for name in key_signals:
    if name in vm.signals:
        print(f"{name}: {vm.signals[name].values[1]}")