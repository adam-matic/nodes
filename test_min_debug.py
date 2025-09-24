#!/usr/bin/env python3
"""
Debug the min module step by step.
"""

from parser import parse_string, ParseError
from vm import VirtualMachine

# Test each part of min module individually
test_code = """
module debug_min {
    // Test inputs: a=2, b=5
    a = 2
    b = 5

    // Step 1: is_a_less = lt(a, b) -> should be 1 (2 < 5)
    is_a_less = lt(a, b)

    // Step 2: term1 = mult(a, is_a_less) -> should be 2*1 = 2
    term1 = mult(a, is_a_less)

    // Step 3: one_minus_is_a_less = sub(1, is_a_less) -> should be 1-1 = 0
    one_minus_is_a_less = sub(1, is_a_less)

    // Step 4: term2 = mult(b, one_minus_is_a_less) -> should be 5*0 = 0
    term2 = mult(b, one_minus_is_a_less)

    // Step 5: output = add(term1, term2) -> should be 2+0 = 2
    result = add(term1, term2)

    output result
}

execution {
    max_steps: 3
    save: [a, b, is_a_less, term1, one_minus_is_a_less, term2, result]
}
"""

try:
    print("Debugging min module...")
    ast = parse_string(test_code)
    vm = VirtualMachine()
    vm.load_program(ast)
    vm.max_steps = 3
    results = vm.run()

    print("Step-by-step results:")
    for signal_name, values in results.items():
        print(f"  {signal_name}: {values}")

except Exception as e:
    print(f"✗ Error: {e}")
    import traceback
    traceback.print_exc()