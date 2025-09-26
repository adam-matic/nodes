#!/usr/bin/env python3
"""
Python equivalent simulation for band-pass filter module.
Used to generate expected test values that match VM behavior.
"""

def high_pass_filter_step(signal, alpha, prev_output, prev_input):
    """
    High-pass filter step implementation.
    Formula: y_out = alpha * (y_prev + x_in - x_prev)
    """
    return alpha * (prev_output + signal - prev_input)

def low_pass_filter_step(signal, alpha, prev_output):
    """
    Low-pass filter step implementation.
    Formula: y_out = (1 - alpha) * y_prev + alpha * x_in
    """
    return (1 - alpha) * prev_output + alpha * signal

def simulate_band_pass_example(max_steps=10):
    """
    Simulate the band_pass_example module for max_steps.
    """
    # Initialize state for high-pass filter
    hp_prev_output = 0.0
    hp_prev_input = 0.0

    # Initialize state for low-pass filter
    lp_prev_output = 0.0

    input_signal_values = []
    filtered_signal_values = []

    for step in range(max_steps):
        # Create the complex input signal
        is_fast = 1.0 if step >= 50 else 0.0
        fast_freq = step * 0.5
        slow_freq = step * 0.1
        fast_term = is_fast * fast_freq
        one_minus_is_fast = 1.0 - is_fast
        slow_term = one_minus_is_fast * slow_freq
        input_signal = fast_term + slow_term

        # Apply high-pass filter first
        high_passed = high_pass_filter_step(input_signal, 0.8, hp_prev_output, hp_prev_input)

        # Apply low-pass filter to high-pass output
        filtered_signal = low_pass_filter_step(high_passed, 0.2, lp_prev_output)

        # Store values
        input_signal_values.append(input_signal)
        filtered_signal_values.append(filtered_signal)

        # Update state for next step
        hp_prev_output = high_passed
        hp_prev_input = input_signal
        lp_prev_output = filtered_signal

        print(f"Step {step}: input={input_signal:.6f}, hp_out={high_passed:.6f}, filtered={filtered_signal:.10f}")

    return {
        'input_signal': input_signal_values,
        'filtered_signal': filtered_signal_values
    }

if __name__ == "__main__":
    print("Simulating band-pass filter example...")
    results = simulate_band_pass_example()

    print("\nFinal results:")
    print("Input signal:", [round(x, 6) for x in results['input_signal']])
    print("Filtered signal:", [round(x, 15) for x in results['filtered_signal']])

    print("\nFormatted for test file:")
    print('"filtered_signal":', results['filtered_signal'])