#!/usr/bin/env python3

import sys
sys.path.append('.')

from parser import parse_string
from vm import VirtualMachine

def test_fixed_sine():
    print("Testing fixed sine wave with delayed position feedback...")

    # Use memory to break the circular dependency
    code = '''
import euler_integrator

module fixed_sine {
    param frequency = 1
    param amplitude = 1
    param dt = 0.1

    // Use proper angular frequency ω = 2πf
    pi = 3.14159265359
    two_pi = mult(2, pi)
    omega = mult(two_pi, frequency)
    omega_squared = mult(omega, omega)
    initial_velocity = mult(omega, amplitude)

    // Break circular dependency by using memory for position feedback
    // Start with position = 0
    position_delayed = mem(0, position)

    // acceleration = -ω² * position_delayed (using previous step's position)
    minus_one = sub(0, 1)
    neg_omega_squared = mult(minus_one, omega_squared)
    acceleration = mult(neg_omega_squared, position_delayed)

    // Integrate acceleration to get velocity
    velocity = euler_integrator(signal=acceleration, dt=dt, initial_value=initial_velocity)

    // Integrate velocity to get position
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
        print(f"Result: {result}")
        print(f"Position values: {result.get('position', 'NOT_FOUND')}")

        if 'position' in result:
            pos_values = result['position']
            print(f"First few values: {pos_values[:5]}")
            if all(v == 0.0 for v in pos_values[:5]):
                print("❌ Still getting all zeros!")
            else:
                print("✅ Getting non-zero values!")
                # Expected sine wave with ω=2π, dt=0.1, should have sin(2π*0.1) ≈ sin(0.628) ≈ 0.588
                print(f"At step 1: expected ~0.59, got {pos_values[1] if len(pos_values) > 1 else 'N/A'}")
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_fixed_sine()