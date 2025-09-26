#!/usr/bin/env python3

import sys
sys.path.append('.')

from modular_math.parser import parse_string
from modular_math.vm import VirtualMachine

def test_simple_sine():
    # Test basic sine wave generation
    print("Testing simple sine wave...")

    code = '''
import euler_integrator

module simple_sine {
    param frequency = 1
    param amplitude = 1
    param dt = 0.1

    // Use proper angular frequency ω = 2πf
    pi = 3.14159265359
    two_pi = mult(2, pi)
    omega = mult(two_pi, frequency)
    omega_squared = mult(omega, omega)

    // For sine wave: d²x/dt² = -ω²x
    // Initial conditions: x(0) = 0, v(0) = ω*A (to get sine, not cosine)
    initial_velocity = mult(omega, amplitude)

    // acceleration = -ω² * position
    minus_one = sub(0, 1)
    neg_omega_squared = mult(minus_one, omega_squared)
    acceleration = mult(neg_omega_squared, position)

    // Integrate twice
    velocity = euler_integrator(signal=acceleration, dt=dt, initial_value=initial_velocity)
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
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_simple_sine()