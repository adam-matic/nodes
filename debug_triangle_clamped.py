#!/usr/bin/env python3

import sys
sys.path.append('.')

from parser import parse_string
from vm import VirtualMachine

def debug_triangle_clamped():
    print("Debugging clamped triangle wave...")

    code = '''
import euler_integrator

module debug_triangle {
    param period = 20
    param amplitude = 5
    param dt = 0.1

    two_amplitude = mult(2, amplitude)
    period_dt = mult(period, dt)
    period_dt_half = div(period_dt, 2)
    slope = div(two_amplitude, period_dt_half)
    signal_to_integrate = mult(state, slope)

    integrated_prev = mem(0, integrated)
    integrated = euler_integrator(signal=signal_to_integrate, dt=dt, initial_value=0)

    is_over_positive_amp = gte(integrated, amplitude)
    is_under_negative_amp = lte(integrated, -amplitude)
    should_flip = add(is_over_positive_amp, is_under_negative_amp)

    flipped_state = mult(-1, state)
    term1 = mult(flipped_state, should_flip)
    one_minus_should_flip = sub(1, should_flip)
    term2 = mult(state, one_minus_should_flip)
    next_state = add(term1, term2)
    state = mem(1, next_state)

    is_too_high = gte(integrated, amplitude)
    is_too_low = lte(integrated, -amplitude)
    clamped_high = mult(amplitude, is_too_high)
    clamped_low = mult(-amplitude, is_too_low)
    neither_clamped = mult(integrated, sub(1, add(is_too_high, is_too_low)))
    clamped_integrated = add(clamped_high, add(clamped_low, neither_clamped))

    output integrated
    output clamped_integrated
    output state
}

execution {
    max_steps: 12
    save: [integrated, clamped_integrated, state]
}
'''

    try:
        ast = parse_string(code)
        vm = VirtualMachine()
        vm.load_program(ast)
        result = vm.run()

        print("Triangle wave debug:")
        print("Expected: [0.0, 1.0, 2.0, 3.0, 4.0, 5.0, 4.0, 3.0, 2.0, 1.0, 0.0, -1.0]")
        for step in range(min(12, len(result.get('integrated', [])))):
            integrated = result.get('integrated', [0]*12)[step]
            clamped = result.get('clamped_integrated', [0]*12)[step]
            state = result.get('state', [0]*12)[step]
            print(f"Step {step:2d}: raw={integrated:5.1f}, clamped={clamped:5.1f}, state={state:2.0f}")

    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    debug_triangle_clamped()