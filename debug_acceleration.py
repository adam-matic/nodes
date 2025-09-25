#!/usr/bin/env python3

import sys
sys.path.append('.')

from parser import parse_string
from vm import VirtualMachine

def test_acceleration():
    print("Testing acceleration in sine wave...")

    code = '''
import euler_integrator

module test_acceleration {
    param frequency = 1
    param amplitude = 1
    param dt = 0.1

    // Calculate constants
    pi = 3.14159265359
    two_pi = mult(2, pi)
    omega = mult(two_pi, frequency)
    omega_squared = mult(omega, omega)
    initial_velocity = mult(omega, amplitude)

    // Use memory to break circular dependency
    position_delayed = mem(0, position)

    // Calculate acceleration = -ω² * position_delayed
    minus_one = sub(0, 1)
    neg_omega_squared = mult(minus_one, omega_squared)
    acceleration = mult(neg_omega_squared, position_delayed)

    // Integrate to get velocity (with non-zero initial condition)
    velocity = euler_integrator(signal=acceleration, dt=dt, initial_value=initial_velocity)

    // Integrate to get position
    position = euler_integrator(signal=velocity, dt=dt, initial_value=0)

    output position_delayed
    output acceleration
    output velocity
    output position
}

execution {
    max_steps: 5
    save: [position_delayed, acceleration, velocity, position]
}
'''

    try:
        ast = parse_string(code)
        vm = VirtualMachine()
        vm.load_program(ast)
        result = vm.run()
        print(f"Result: {result}")

        print("\nStep-by-step analysis:")
        for step in range(min(5, len(result.get('position', [])))):
            pos_delayed = result.get('position_delayed', [0]*5)[step]
            accel = result.get('acceleration', [0]*5)[step]
            vel = result.get('velocity', [0]*5)[step]
            pos = result.get('position', [0]*5)[step]

            print(f"Step {step}: pos_delayed={pos_delayed:.3f}, accel={accel:.3f}, vel={vel:.3f}, pos={pos:.3f}")

    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_acceleration()