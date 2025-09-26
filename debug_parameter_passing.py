#!/usr/bin/env python3

import sys
sys.path.append('.')

from modular_math.parser import parse_string
from modular_math.vm import VirtualMachine

def test_parameter_passing():
    print("Testing parameter passing to integrator...")

    code = '''
import euler_integrator

module test_params {
    // Test if calculated initial value works
    calc_initial = mult(6.28, 1)

    constant_signal = 0

    // Test literal value
    integrated_literal = euler_integrator(signal=constant_signal, dt=0.1, initial_value=6.28)

    // Test calculated value
    integrated_calculated = euler_integrator(signal=constant_signal, dt=0.1, initial_value=calc_initial)

    output calc_initial
    output integrated_literal
    output integrated_calculated
}

execution {
    max_steps: 3
    save: [calc_initial, integrated_literal, integrated_calculated]
}
'''

    try:
        ast = parse_string(code)
        vm = VirtualMachine()
        vm.load_program(ast)
        result = vm.run()
        print(f"Result: {result}")

        print("\nTesting parameter passing:")
        if 'calc_initial' in result:
            calc_val = result['calc_initial'][0]
            print(f"Calculated initial value: {calc_val}")

        if 'integrated_literal' in result:
            literal_result = result['integrated_literal']
            print(f"With literal initial=6.28: {literal_result}")

        if 'integrated_calculated' in result:
            calc_result = result['integrated_calculated']
            print(f"With calculated initial: {calc_result}")

    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_parameter_passing()