#!/usr/bin/env python3
"""
Python equivalent simulation for exponential decay module.
This simulates the behavior expected from the VM.
"""

def simulate_exponential_decay(initial_value, decay_rate, max_steps):
    """
    Simulate exponential decay module.

    Logic:
    - current_value = mem(initial_value, next_value)
    - next_value = mult(current_value, decay_rate)

    At step 0: current_value = initial_value (mem initial condition)
    At step 1: current_value = initial_value * decay_rate
    At step 2: current_value = (initial_value * decay_rate) * decay_rate
    """
    decay_out = []
    current_value = initial_value

    for step in range(max_steps):
        # At each step, output current_value first
        decay_out.append(current_value)
        # Then compute next_value for next iteration
        current_value = current_value * decay_rate

    return decay_out

def simulate_decay_example(initial_value, decay_rate, max_steps):
    """
    Simulate the decay_example module which instantiates exponential_decay.
    """
    return simulate_exponential_decay(initial_value, decay_rate, max_steps)

if __name__ == "__main__":
    # Test with the same parameters as the test case
    test_params = {
        'initial_value': 100,
        'decay_rate': 0.8,
        'max_steps': 5
    }

    result = simulate_decay_example(**test_params)

    print("Python simulation results:")
    print(f"  decay_out: {result}")
    print("\nTest file expects:")
    print("  decay_out: [100, 80, 64, 51.2, 40.96]")

    # Check if they match
    expected = [100, 80, 64, 51.2, 40.96]
    matches = all(abs(a - b) < 0.001 for a, b in zip(result, expected))
    print(f"\nMatches expected: {matches}")