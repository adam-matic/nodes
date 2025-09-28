#!/usr/bin/env python3

import math

def euler_integrator(signal_values, dt, initial_value):
    """Simulate the Euler integrator module."""
    integral_values = [initial_value]
    integral = initial_value

    for signal in signal_values:
        signal_dt = signal * dt
        integral = integral + signal_dt
        integral_values.append(integral)

    return integral_values[:-1]  # Remove the extra value

def calculate_sine_wave(frequency, amplitude, dt, max_steps):
    """Calculate expected sine wave values using the same algorithm as the modular math language."""

    # Initialize values
    freq_squared = frequency * frequency
    neg_freq_squared = -1.0 * freq_squared
    initial_velocity = amplitude * frequency

    # Track all values
    position_values = [0.0]  # Start with initial position = 0
    velocity_values = [initial_velocity]  # Start with initial velocity
    acceleration_values = []

    position = 0.0
    velocity = initial_velocity

    for step in range(max_steps):
        # acceleration = neg_freq_squared * position
        acceleration = neg_freq_squared * position
        acceleration_values.append(acceleration)

        # Update velocity using Euler integration: velocity += acceleration * dt
        velocity = velocity + acceleration * dt
        velocity_values.append(velocity)

        # Update position using Euler integration: position += velocity * dt
        position = position + velocity * dt
        position_values.append(position)

    return position_values[:-1], velocity_values[:-1], acceleration_values

def print_sine_test_cases():
    """Generate test cases for different sine wave configurations."""

    print("=== Sine Wave Test Case Generation ===\n")

    # Test case 1: Main sine wave test (frequency=5, amplitude=1, dt=0.1, 10 steps)
    print("Test Case 1: ex20_sine_wave_test.json")
    print("Parameters: frequency=5, amplitude=1, dt=0.1, max_steps=10")
    positions, velocities, accelerations = calculate_sine_wave(5, 1, 0.1, 10)
    print(f"Expected sine_out: {[round(x, 3) for x in positions]}")
    print()

    # Test case 2: Parameter variation (frequency=2, amplitude=3, dt=0.1, 8 steps)
    print("Test Case 2: sine_module_params_test.json")
    print("Parameters: frequency=2, amplitude=3, dt=0.1, max_steps=8")
    positions, velocities, accelerations = calculate_sine_wave(2, 3, 0.1, 8)
    print(f"Expected position: {[round(x, 3) for x in positions]}")
    print()

    # Test case 3: Low frequency (frequency=0.5, amplitude=10, dt=0.1, 6 steps)
    print("Test Case 3: sine_module_low_freq_test.json")
    print("Parameters: frequency=0.5, amplitude=10, dt=0.1, max_steps=6")
    positions, velocities, accelerations = calculate_sine_wave(0.5, 10, 0.1, 6)
    print(f"Expected position: {[round(x, 3) for x in positions]}")
    print()

    # Comparison with analytical solution
    print("=== Analytical Comparison ===")
    print("For frequency=1, amplitude=1, dt=0.1:")
    positions, _, _ = calculate_sine_wave(1, 1, 0.1, 10)
    analytical = [1 * math.sin(1 * i * 0.1) for i in range(10)]

    print("Euler method:", [round(x, 3) for x in positions])
    print("Analytical:  ", [round(x, 3) for x in analytical])
    print("Difference:  ", [round(abs(a-b), 3) for a, b in zip(positions, analytical)])

if __name__ == "__main__":
    print_sine_test_cases()