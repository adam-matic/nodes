#!/usr/bin/env python3
"""
Isolated test for the min module to debug why it's outputting zeros.
"""

from modular_math.parser import parse_string, ParseError
from modular_math.vm import VirtualMachine
from modular_math.ast_nodes import *

# Test the min module in isolation
test_code = """
module min {
    input a
    input b

    is_a_less = lt(a, b)
    term1 = mult(a, is_a_less)
    one_minus_is_a_less = sub(1, is_a_less)
    term2 = mult(b, one_minus_is_a_less)
    output = add(term1, term2)
}

module test_min {
    // Test with simple values: min(2, 5) should be 2
    result = min(a=2, b=5)
    output result
}

execution {
    max_steps: 3
    save: [result]
}
"""

try:
    print("Parsing test code...")
    ast = parse_string(test_code)
    print("✓ Successfully parsed")

    print("\nRunning VM...")
    vm = VirtualMachine()
    vm.load_program(ast)
    vm.max_steps = 3
    results = vm.run()

    print(f"Results: {results}")

    if 'result' in results:
        print(f"min(2, 5) = {results['result']}")
        expected = [2, 2, 2]  # Should be 2 for all steps
        actual = results['result'][:3]
        if actual == expected:
            print("✓ Min module working correctly!")
        else:
            print(f"✗ Expected {expected}, got {actual}")
    else:
        print("✗ No 'result' signal found in output")

except ParseError as e:
    print(f"✗ Parse error: {e}")
except Exception as e:
    print(f"✗ VM error: {e}")
    import traceback
    traceback.print_exc()