#!/usr/bin/env python3

import sys
sys.path.append('.')

from parser import parse_string
from vm import VirtualMachine

def test_integrator():
    print("Testing basic euler integrator...")

    # Simple test: integrate a constant 1, should give [0, 0.1, 0.2, 0.3, 0.4, ...]
    code = '''
import euler_integrator

module test_integrator {
    constant_signal = 1
    integrated = euler_integrator(signal=constant_signal, dt=0.1, initial_value=0)
    output integrated
}

execution {
    max_steps: 5
    save: [integrated]
}
'''

    try:
        ast = parse_string(code)
        vm = VirtualMachine()
        vm.load_program(ast)
        result = vm.run()
        print(f"Result: {result}")

        if 'integrated' in result:
            values = result['integrated']
            print(f"Integrated values: {values}")
            expected = [0.0, 0.1, 0.2, 0.3, 0.4]  # integral of 1 with dt=0.1
            print(f"Expected values: {expected}")

            if values == expected:
                print("✅ Integrator working correctly!")
            else:
                print("❌ Integrator not working as expected")
        else:
            print("❌ No integrated output found")

    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_integrator()