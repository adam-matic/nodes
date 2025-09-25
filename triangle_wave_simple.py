#!/usr/bin/env python3

# Test simple triangle wave logic in Python first
def simple_triangle_wave(max_steps=21, amplitude=5):
    """Simple triangle wave that matches expected pattern."""
    output = []
    value = 0.0
    direction = 1.0  # 1 for up, -1 for down

    for step in range(max_steps):
        output.append(value)

        # Move in current direction
        next_value = value + direction

        # Check if we need to turn around
        if next_value > amplitude:
            direction = -1.0
            next_value = amplitude - 1  # Turn around
        elif next_value < -amplitude:
            direction = 1.0
            next_value = -amplitude + 1  # Turn around

        value = next_value

    return output

if __name__ == "__main__":
    result = simple_triangle_wave()
    expected = [0.0, 1.0, 2.0, 3.0, 4.0, 5.0, 4.0, 3.0, 2.0, 1.0, 0.0, -1.0, -2.0, -3.0, -4.0, -5.0, -4.0, -3.0, -2.0, -1.0, 0.0]

    print("Simple triangle wave test:")
    print(f"Generated: {result}")
    print(f"Expected:  {expected}")
    print(f"Match: {result == expected}")

    if result != expected:
        for i, (gen, exp) in enumerate(zip(result, expected)):
            if gen != exp:
                print(f"  First difference at step {i}: got {gen}, expected {exp}")