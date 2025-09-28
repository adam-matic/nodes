#!/usr/bin/env python3

from modular_math.parser import parse_file
from modular_math.vm import VirtualMachine
import json

# Parse and run the square wave
ast = parse_file("examples/ex21_square_wave.txt")
vm = VirtualMachine()
vm.load_program(ast)
vm.max_steps = 25
results = vm.run()

print("Square wave output:")
print(results.get('square_out', [])[:25])

# Compare with expected
expected = [-2, -2, -2, -2, -2, 2, 2, 2, 2, 2, -2, -2, -2, -2, -2, 2, 2, 2, 2, 2, -2, -2, -2, -2, -2]
print("Expected output:")
print(expected)
print("Match:", results.get('square_out', [])[:25] == expected)