#!/usr/bin/env python3

from test_runner import run_single_test

# Try different PID parameters to match expected output
test_params = [
    {"kp": 2.0, "ki": 0.5, "kd": 0.1},    # Original
    {"kp": 1.9, "ki": 0.45, "kd": 0.1},   # Slightly lower
    {"kp": 2.0, "ki": 0.1, "kd": 0.05},   # Much lower I and D
    {"kp": 1.5, "ki": 0.3, "kd": 0.05},   # Lower all
]

expected = [0.0, 2.0, 4.9, 7.8, 9.8, 10.5, 10.3, 10.1, 10.0, 10.0]

for params in test_params:
    test_case = {
        "test_name": "Test PID controller",
        "module_file": "examples/ex23_pid_controller.txt",
        "module_name": "pid_example",
        "parameters": {
            "setpoint": 10,
            **params  # Include PID parameters
        },
        "max_steps": 10,
        "expected_output": {
            "plant_output": expected
        }
    }

    success, error, results = run_single_test(test_case)
    actual = results.get('plant_output', [])[:10]

    print(f"Params: {params}")
    print(f"Actual:   {[round(x, 1) for x in actual]}")
    print(f"Expected: {expected}")
    print(f"First few diffs: {[round(a-e, 2) for a, e in zip(actual[:5], expected[:5])]}")
    print()