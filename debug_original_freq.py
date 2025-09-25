#!/usr/bin/env python3

import sys
sys.path.append('.')

from parser import parse_string
from vm import VirtualMachine

def test_original_freq():
    print("Testing with original frequency (f^2 instead of (2πf)^2)...")

    code = '''
import euler_integrator

module original_sine {
    param frequency = 5
    param amplitude = 1
    param dt = 0.1

    // Original (incorrect) frequency calculation - just f^2
    freq_squared = mult(frequency, frequency)
    minus_one = sub(0, 1)
    neg_freq_squared = mult(minus_one, freq_squared)

    // Break circular dependency
    position_delayed = mem(0, position)
    acceleration = mult(neg_freq_squared, position_delayed)

    // Manual velocity integration - original used amplitude * frequency
    velocity_prev = mem(0, velocity)
    is_first_step = eq($step, 0)
    initial_vel = mult(amplitude, frequency)

    velocity_increment = mult(acceleration, dt)
    velocity_updated = add(velocity_prev, velocity_increment)
    term1 = mult(velocity_updated, sub(1, is_first_step))
    term2 = mult(initial_vel, is_first_step)
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

        print("Original frequency results:")
        if 'position' in result:
            pos_values = result['position'][:10]
            expected = [0.0, 0.5, 0.875, 1.031, 0.93, 0.596, 0.113, -0.398, -0.81, -1.019]
            print(f"Actual:   {pos_values}")
            print(f"Expected: {expected}")

            # Check first few matches
            matches = 0
            for i in range(min(5, len(pos_values))):
                if abs(pos_values[i] - expected[i]) < 0.01:
                    matches += 1
            print(f"Close matches in first 5: {matches}/5")

    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_original_freq()