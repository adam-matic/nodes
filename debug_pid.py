#!/usr/bin/env python3

from test_runner import run_single_test, load_test_case

# Test PID controller
pid_test = load_test_case("tests/ex23_pid_controller_test.json")
success, error, results = run_single_test(pid_test)

print("=== PID CONTROLLER TEST ===")
print(f"Success: {success}")
print(f"Error: {error}")
print(f"Plant output actual: {results.get('plant_output', [])[:10]}")
print(f"Plant output expected: {pid_test['expected_output']['plant_output']}")
print(f"Control signal actual: {results.get('control_signal', [])[:10]}")

# Manual calculation for first few steps
print("\n=== MANUAL CALCULATION ===")
setpoint = 10
plant_out = [0.0]  # Initial plant output
control_sig = []
dt = 0.1

for step in range(5):
    error = setpoint - plant_out[step]

    # PID with kp=2, ki=0.5, kd=0.1
    p_term = 2.0 * error
    # For step 0, integral and derivative should be 0
    control = p_term  # Simplified for step 0
    control_sig.append(control)

    # Plant: simple integrator
    next_plant = plant_out[step] + control * dt
    plant_out.append(next_plant)

    print(f"Step {step}: error={error:.2f}, control={control:.2f}, plant_out={next_plant:.2f}")

print(f"\nManual plant output: {plant_out[1:6]}")
print(f"Expected plant output: {pid_test['expected_output']['plant_output'][:5]}")