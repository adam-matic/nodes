#!/usr/bin/env python3

import sys
import math
sys.path.append('.')

from parser import parse_string
from vm import VirtualMachine

def verify_sine_wave():
    print("Verifying sine wave behavior over longer period...")

    code = '''
import euler_integrator

module sine_test {
    param frequency = 1
    param amplitude = 1
    param dt = 0.01

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
    max_steps: 100
    save: [position]
}
'''

    try:
        ast = parse_string(code)
        vm = VirtualMachine()
        vm.load_program(ast)
        result = vm.run()

        print("Sine wave verification (f=1, dt=0.01):")
        if 'position' in result:
            pos_values = result['position']

            # Check some key points
            # At t=0.25: sin(2π × 1 × 0.25) = sin(π/2) = 1.0
            # At t=0.5: sin(2π × 1 × 0.5) = sin(π) = 0.0
            # At t=0.75: sin(2π × 1 × 0.75) = sin(3π/2) = -1.0
            # At t=1.0: sin(2π × 1 × 1.0) = sin(2π) = 0.0

            key_points = [
                (25, 0.25, 1.0),   # t=0.25, expect 1.0
                (50, 0.50, 0.0),   # t=0.50, expect 0.0
                (75, 0.75, -1.0),  # t=0.75, expect -1.0
                (100, 1.00, 0.0)   # t=1.00, expect 0.0
            ]

            print("Key points check:")
            for step, time, expected in key_points:
                if step < len(pos_values):
                    actual = pos_values[step]
                    error = abs(actual - expected)
                    print(f"Step {step:2d} (t={time:.2f}): expected {expected:5.2f}, got {actual:5.2f}, error {error:.3f}")

            # Show first few and last few values
            print(f"\nFirst 10 values: {pos_values[:10]}")
            print(f"Values around step 25: {pos_values[23:28]}")

    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    verify_sine_wave()