#!/usr/bin/env python3

# Quick debug script to run sine wave directly through the VM
import subprocess
import json

def run_sine_test():
    print("=== Running sine wave test directly ===")

    # Test the specific sine wave configuration that's failing
    test_config = {
        "test_name": "Debug sine wave",
        "module_file": "examples/ex20_sine_wave.txt",
        "module_name": "sine_example",
        "parameters": {"frequency": 5, "amplitude": 1, "dt": 0.1},
        "max_steps": 10,
        "expected_output": {
            "sine_out": [0.0, 0.5, 0.875, 1.031, 0.93, 0.596, 0.113, -0.398, -0.81, -1.019]
        }
    }

    # Write temporary test file
    with open('debug_test.json', 'w') as f:
        json.dump(test_config, f, indent=2)

    # Run test
    try:
        result = subprocess.run(['python', 'test_runner.py', 'debug_test.json'],
                              capture_output=True, text=True)
        print("STDOUT:", result.stdout)
        print("STDERR:", result.stderr)
        print("Return code:", result.returncode)
    except Exception as e:
        print(f"Error running test: {e}")

if __name__ == "__main__":
    run_sine_test()