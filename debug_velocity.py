#!/usr/bin/env python3

import sys
sys.path.append('.')

from parser import parse_string
from vm import VirtualMachine

def test_velocity():
    print("Testing sine wave velocity calculation...")

    code = '''
import euler_integrator

module test_velocity {
    param frequency = 1
    param amplitude = 1
    param dt = 0.1

    // Calculate angular frequency
    pi = 3.14159265359
    two_pi = mult(2, pi)
    omega = mult(two_pi, frequency)
    initial_velocity = mult(omega, amplitude)

    // For debugging, output the initial velocity calculation
    output omega
    output initial_velocity
}

execution {
    max_steps: 5
    save: [omega, initial_velocity]
}
'''

    try:
        ast = parse_string(code)
        vm = VirtualMachine()
        vm.load_program(ast)
        result = vm.run()
        print(f"Result: {result}")

        omega_expected = 2 * 3.14159265359 * 1  # ≈ 6.28
        print(f"Expected omega (2πf): {omega_expected}")

        if 'omega' in result:
            omega_actual = result['omega'][0] if result['omega'] else 'N/A'
            print(f"Actual omega: {omega_actual}")

        if 'initial_velocity' in result:
            initial_v_actual = result['initial_velocity'][0] if result['initial_velocity'] else 'N/A'
            print(f"Actual initial velocity: {initial_v_actual}")
            print(f"Expected initial velocity (omega * amplitude): {omega_expected}")

    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_velocity()