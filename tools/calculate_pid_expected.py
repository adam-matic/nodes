#!/usr/bin/env python3
"""
Generate expected values for PID controller test using Python equivalent functions.
"""
import json

def euler_integrator_step(signal, dt, prev_integral):
    """Euler integration step: integral = previous_integral + signal * dt"""
    return prev_integral + signal * dt

def differentiator_step(signal, dt, prev_signal):
    """Differentiator step: derivative = (signal - prev_signal) / dt"""
    if prev_signal is None:
        return 0.0  # Initial derivative is 0
    return (signal - prev_signal) / dt

def pid_controller_step(setpoint, process_variable, kp, ki, kd, dt, prev_integral, prev_error):
    """
    Single step of PID controller.
    Returns: (output, new_integral, error)
    """
    # Error term
    error = setpoint - process_variable

    # Proportional component
    p_term = kp * error

    # Integral component
    new_integral = euler_integrator_step(error, dt, prev_integral)
    i_term = ki * new_integral

    # Derivative component
    error_derivative = differentiator_step(error, dt, prev_error)
    d_term = kd * error_derivative

    # PID output
    output = p_term + i_term + d_term

    return output, new_integral, error

def simulate_pid_system(setpoint, kp, ki, kd, dt=0.1, initial_plant_output=0.0, max_steps=10):
    """
    Simulate the complete PID system with plant (simple integrator).
    Returns: (plant_outputs, control_signals)
    """
    plant_outputs = []
    control_signals = []

    # PID controller state
    integral = 0.0
    prev_error = None

    # Plant state
    plant_output = initial_plant_output

    for step in range(max_steps):
        # PID controller computes control signal based on CURRENT plant output
        control_signal, integral, error = pid_controller_step(
            setpoint, plant_output, kp, ki, kd, dt, integral, prev_error
        )
        control_signals.append(control_signal)

        # Plant (simple integrator) responds to control signal
        plant_output = euler_integrator_step(control_signal, dt, plant_output)
        plant_outputs.append(plant_output)

        # Update previous error for next iteration
        prev_error = error

    return plant_outputs, control_signals

def main():
    # Test parameters from the test file
    setpoint = 10
    kp = 2
    ki = 0.5
    kd = 0.1
    dt = 0.1
    max_steps = 10

    print(f"Simulating PID system with:")
    print(f"  setpoint = {setpoint}")
    print(f"  kp = {kp}, ki = {ki}, kd = {kd}")
    print(f"  dt = {dt}")
    print(f"  max_steps = {max_steps}")
    print()

    # Also test with what VM seems to be using (first signal = 30)
    # If error=10 and control_signal=30, then kp must be 3 (30/10=3)
    print("Testing alternative parameters to match VM (kp=3):")
    alt_kp = 3.0
    plant_outputs_alt, control_signals_alt = simulate_pid_system(
        setpoint, alt_kp, ki, kd, dt, 0.0, max_steps
    )

    print(f"Alt plant outputs: {[round(x, 1) for x in plant_outputs_alt]}")
    print(f"Alt control signals: {[round(x, 1) for x in control_signals_alt]}")
    print()

    plant_outputs, control_signals = simulate_pid_system(
        setpoint, kp, ki, kd, dt, 0.0, max_steps
    )

    print("Plant outputs:")
    for i, output in enumerate(plant_outputs):
        print(f"  Step {i+1}: {output:.6f}")

    print("\nControl signals:")
    for i, signal in enumerate(control_signals):
        print(f"  Step {i+1}: {signal:.6f}")

    # Round to reasonable precision for test comparison
    plant_outputs_rounded = [round(x, 1) for x in plant_outputs]
    control_signals_rounded = [round(x, 1) for x in control_signals]

    print(f"\nRounded plant outputs: {plant_outputs_rounded}")
    print(f"Rounded control signals: {control_signals_rounded}")

    return plant_outputs_rounded, control_signals_rounded

if __name__ == "__main__":
    main()