#!/usr/bin/env python3

import sys
sys.path.append('.')

from modular_math.parser import parse_string
from modular_math.vm import VirtualMachine

def generate_f01_values():
    print("Generating values for frequency=0.1:")

    code = '''
import euler_integrator

module sine_test {
    param frequency = 0.1
    param amplitude = 1
    param dt = 0.1

    pi = 3.14159265359
    two_pi = mult(2, pi)
    omega = mult(two_pi, frequency)
    omega_squared = mult(omega, omega)
    minus_one = sub(0, 1)
    neg_omega_squared = mult(minus_one, omega_squared)

    position_delayed = mem(0, position)
    acceleration = mult(neg_omega_squared, position_delayed)

    velocity_prev = mem(0, velocity)
    is_first_step = eq($step, 0)
    omega_times_amplitude = mult(omega, amplitude)

    velocity_increment = mult(acceleration, dt)
    velocity_updated = add(velocity_prev, velocity_increment)
    term1 = mult(velocity_updated, sub(1, is_first_step))
    term2 = mult(omega_times_amplitude, is_first_step)
    velocity = add(term1, term2)

    position = euler_integrator(signal=velocity, dt=dt, initial_value=0)

    output position
}

execution {
    max_steps: 10
    save: [position]
}
'''

    try:
        ast = parse_string(code)
        vm = VirtualMachine()
        vm.load_program(ast)
        result = vm.run()

        if 'position' in result:
            pos_values = result['position'][:10]
            print(f"Generated values: {pos_values}")

            # Round to 3 decimal places for test file
            rounded = [round(v, 3) for v in pos_values]
            print(f"For test file:    {rounded}")

    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    generate_f01_values()