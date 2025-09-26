#!/usr/bin/env python3

import sys
sys.path.append('.')

from modular_math.parser import parse_string
from modular_math.vm import VirtualMachine

def test_initial_value():
    print("Testing initial value parameter passing...")

    # Test if initial_value parameter works at all
    code = '''
import euler_integrator

module test_initial {
    constant_signal = 1
    integrated_with_init = euler_integrator(signal=constant_signal, dt=0.1, initial_value=5)
    integrated_without_init = euler_integrator(signal=constant_signal, dt=0.1, initial_value=0)

    output integrated_with_init
    output integrated_without_init
}

execution {
    max_steps: 3
    save: [integrated_with_init, integrated_without_init]
}
'''

    try:
        ast = parse_string(code)
        vm = VirtualMachine()
        vm.load_program(ast)
        result = vm.run()
        print(f"Result: {result}")

        print("\nTesting initial value parameter:")
        if 'integrated_with_init' in result:
            with_init = result['integrated_with_init']
            print(f"With initial=5: {with_init}")
            print(f"Expected: [5.0, 5.1, 5.2]")

        if 'integrated_without_init' in result:
            without_init = result['integrated_without_init']
            print(f"With initial=0: {without_init}")
            print(f"Expected: [0.0, 0.1, 0.2]")

    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_initial_value()