#!/usr/bin/env python3
"""
Calculate high-precision expected values for the logistic map test.
This script implements the same logistic map formula as the DSL:
x_next = r * x * (1 - x)
"""

def logistic_map_sequence(r, initial_x, steps):
    """Generate logistic map sequence with given parameters."""
    x = initial_x
    sequence = [x]

    for step in range(1, steps):
        x_next = r * x * (1 - x)
        x = x_next
        sequence.append(x)

    return sequence

if __name__ == "__main__":
    # Parameters from the test case
    r = 3.7
    initial_x = 0.2
    max_steps = 10

    # Calculate sequence
    sequence = logistic_map_sequence(r, initial_x, max_steps)

    print("Logistic Map Sequence (r=3.7, initial_x=0.2):")
    print("Step -> Value")
    for i, value in enumerate(sequence):
        print(f"{i+1:2d}   -> {value}")

    print("\nAs JSON array for test file:")
    formatted_values = [round(val, 15) for val in sequence]  # High precision
    print(formatted_values)

    print("\nDetailed calculation for first few steps:")
    x = initial_x
    print(f"Step 1: x = {x}")
    for step in range(2, min(6, max_steps + 1)):
        x_next = r * x * (1 - x)
        print(f"Step {step}: x = {r} * {x} * {1-x} = {x_next}")
        x = x_next