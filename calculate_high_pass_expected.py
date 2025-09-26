#!/usr/bin/env python3
"""
Python equivalent simulation for high-pass filter module.
Used to generate expected test values that match VM behavior.
"""

def high_pass_filter_step(signal, alpha, prev_output, prev_input):
    """
    High-pass filter step implementation.
    Formula: y_out = alpha * (y_prev + x_in - x_prev)
    """
    return alpha * (prev_output + signal - prev_input)

def simulate_high_pass_example(max_steps=15, alpha=0.9, step_threshold=10):
    """
    Simulate the high_pass_example module for max_steps.
    """
    # Initialize state
    prev_output = 0.0
    prev_input = 0.0

    input_signal_values = []
    filtered_signal_values = []

    for step in range(max_steps):
        # Create step function at step_threshold
        input_signal = 1.0 if step >= step_threshold else 0.0

        # Apply high-pass filter
        filtered_signal = high_pass_filter_step(input_signal, alpha, prev_output, prev_input)

        # Store values
        input_signal_values.append(input_signal)
        filtered_signal_values.append(filtered_signal)

        # Update state for next step
        prev_output = filtered_signal
        prev_input = input_signal

        print(f"Step {step}: input={input_signal}, filtered={filtered_signal:.10f}, prev_out={prev_output:.10f}, prev_in={prev_input:.10f}")

    return {
        'input_signal': input_signal_values,
        'filtered_signal': filtered_signal_values
    }

if __name__ == "__main__":
    print("Simulating high-pass filter example...")
    results = simulate_high_pass_example()

    print("\nFinal results:")
    print("Input signal:", results['input_signal'])
    print("Filtered signal:", [round(x, 10) for x in results['filtered_signal']])

    print("\nFormatted for test file:")
    print('"filtered_signal":', results['filtered_signal'])