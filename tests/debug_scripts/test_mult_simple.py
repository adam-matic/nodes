#!/usr/bin/env python3
"""
Simple test to check if mult operation works.
"""

from modular_math.parser import parse_string, ParseError
from modular_math.vm import VirtualMachine
from modular_math.ast_nodes import *

# Test mult operation directly
test_code = """
module test_mult {
    // Simple: 2 * 3 = 6
    result = mult(2, 3)
    output result
}

execution {
    max_steps: 3
    save: [result]
}
"""

try:
    print("Testing mult(2, 3)...")
    ast = parse_string(test_code)
    vm = VirtualMachine()
    vm.load_program(ast)
    vm.max_steps = 3
    results = vm.run()

    print(f"Results: {results}")

    if 'result' in results:
        print(f"mult(2, 3) = {results['result']}")
        expected = [6.0, 6.0, 6.0]
        actual = results['result'][:3]
        if actual == expected:
            print("✓ mult working correctly!")
        else:
            print(f"✗ Expected {expected}, got {actual}")
    else:
        print("✗ No 'result' signal found")

except Exception as e:
    print(f"✗ Error: {e}")
    import traceback
    traceback.print_exc()