#!/usr/bin/env python3

import sys
sys.path.append('.')

from parser import parse_string
from vm import VirtualMachine

def test_step_by_step():
    print("Testing step-by-step sine wave...")

    code = '''
import euler_integrator

module debug_sine {
    param frequency = 1
    param amplitude = 1
    param dt = 0.1

    // Calculate constants
    pi = 3.14159265359
    two_pi = mult(2, pi)
    omega = mult(two_pi, frequency)
    omega_squared = mult(omega, omega)
    minus_one = sub(0, 1)
    neg_omega_squared = mult(minus_one, omega_squared)

    // Break circular dependency
    position_delayed = mem(0, position)
    acceleration = mult(neg_omega_squared, position_delayed)

    // Manual velocity integration
    velocity_prev = mem(0, velocity)
    is_first_step = eq($step, 0)
    omega_times_amplitude = mult(omega, amplitude)

    velocity_increment = mult(acceleration, dt)
    velocity_updated = add(velocity_prev, velocity_increment)
    term1 = mult(velocity_updated, sub(1, is_first_step))
    term2 = mult(omega_times_amplitude, is_first_step)
    velocity = add(term1, term2)

    // Position integration
    position = euler_integrator(signal=velocity, dt=dt, initial_value=0)

    output position_delayed
    output acceleration
    output velocity
    output position
}

execution {
    max_steps: 4
    save: [position_delayed, acceleration, velocity, position]
}
'''

    try:
        ast = parse_string(code)
        vm = VirtualMachine()
        vm.load_program(ast)
        result = vm.run()

        print("Step-by-step analysis:")
        for step in range(4):
            pos_delayed = result.get('position_delayed', [0]*4)[step]
            accel = result.get('acceleration', [0]*4)[step]
            vel = result.get('velocity', [0]*4)[step]
            pos = result.get('position', [0]*4)[step]
            print(f"Step {step}: pos_delayed={pos_delayed:.3f}, accel={accel:.3f}, vel={vel:.3f}, pos={pos:.3f}")

        # Expected for sine wave:
        # Step 0: pos=0, vel=ω*A=6.28
        # Step 1: pos≈vel*dt=0.628 (but sine should be ~0.588)
        print("\nExpected sine behavior:")
        print("Step 0: pos=0.000, vel=6.283")
        print("Step 1: pos≈0.628")

    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_step_by_step()