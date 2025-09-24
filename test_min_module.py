#!/usr/bin/env python3
"""
Test the min module exactly as defined in the ramp generator.
"""

from parser import parse_string, ParseError
from vm import VirtualMachine

# Test the exact min module from ramp generator
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
    print("Testing min module instantiation...")
    ast = parse_string(test_code)
    vm = VirtualMachine()
    vm.load_program(ast)
    vm.max_steps = 3
    results = vm.run()

    print(f"Results: {results}")

    if 'result' in results:
        print(f"min(2, 5) = {results['result']}")
        expected = [2.0, 2.0, 2.0]
        actual = results['result'][:3]
        if actual == expected:
            print("✓ Min module working correctly!")
        else:
            print(f"✗ Expected {expected}, got {actual}")
    else:
        print("✗ No 'result' signal found")
        print("Available signals:", list(results.keys()))

except Exception as e:
    print(f"✗ Error: {e}")
    import traceback
    traceback.print_exc()