#!/usr/bin/env python3

from modular_math.parser import parse_string
from modular_math.vm import VirtualMachine

# Simple test of memory initialization
code = """
module test_decay {
    param initial = 100
    param rate = 0.8

    next_val = mult(current_val, rate)
    current_val = mem(initial, next_val)

    output current_val
}

execution {
    max_steps: 5
    save: [current_val]
}
"""

ast = parse_string(code)
vm = VirtualMachine()
vm.load_program(ast)
results = vm.run()

print(f"Results: {results.get('current_val', [])}")
print(f"Expected: [100, 80, 64, 51.2, 40.96]")