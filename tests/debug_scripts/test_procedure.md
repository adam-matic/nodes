# Test Creation and Fixing Procedure

## Overview
This document outlines the procedure for creating equivalent Python code for VM modules and updating expected test results when they don't match the actual VM behavior.

## Procedure Steps

### 1. Examine the Target Module
- Read the module file (e.g., `examples/ex23_pid_controller.txt`)
- Identify all dependencies (imported modules like `euler_integrator`, `differentiator`)
- Note module parameters, inputs, outputs, and internal logic
- Understand the execution flow and mathematical operations

### 2. Analyze Existing Test Structure
- Check for existing test file in `tests/` directory (e.g., `ex23_pid_controller_test.json`)
- Examine test parameters and expected output format
- Note max_steps and which signals are being tested

### 3. Create Equivalent Python Functions
- Create individual functions for each sub-module (e.g., `euler_integrator_step`, `differentiator_step`)
- Build the main module function that combines all components
- Create a simulation function that runs the complete system for multiple steps
- Save as `calculate_[module_name]_expected.py`

Example structure:
```python
def euler_integrator_step(signal, dt, prev_integral):
    return prev_integral + signal * dt

def differentiator_step(signal, dt, prev_signal):
    if prev_signal is None:
        return 0.0
    return (signal - prev_signal) / dt

def simulate_system(params, max_steps):
    # Implementation here
    return outputs
```

### 4. Debug Discrepancies
If Python simulation doesn't match VM output:

- Create a debug script (`debug_[module_name]_test.py`) that:
  - Loads the test case
  - Runs the VM with the same parameters
  - Shows step-by-step comparison of expected vs actual
  - Displays exact numerical values with full precision

- Common issues to check:
  - Initial conditions (memory blocks start with different values)
  - Parameter passing (VM might use different default parameters)
  - Execution order (signals might be computed in different sequence)
  - Floating point precision

### 5. Generate/Update Expected Values
- Run the `calculate_[module_name]_expected.py` script to generate the correct output values.
- If the test JSON file is missing or outdated, copy the precise numerical values from the Python script's output.
- Update the `expected_output` field in the test JSON file.
- This ensures the test case reflects the behavior of the Python model.

### 6. Verify Test Passes
- Run the test runner to confirm the test now passes
- Check that no other tests were broken by changes

## Key Files Created During Process

1. `calculate_[module_name]_expected.py` - Python equivalent simulation
2. `debug_[module_name]_test.py` - Debug script for comparing VM vs expected
3. Updated `tests/[module_name]_test.json` - Test file with correct expected values

## Example Commands

```bash
# Create and run Python simulation
python calculate_pid_expected.py

# Debug VM vs expected values
python debug_pid_test.py

# Run specific test
python test_runner.py | grep -A 5 "PID"

# Run all tests
python test_runner.py
```

## Important Notes

- The Python simulation (`calculate_*_expected.py`) is the ground truth.
- The purpose of the tests is to verify that the VM's output matches the Python model.
- If a test fails, it implies a bug in the VM that needs to be fixed.
- Maintain full floating point precision in test files.
- Test parameters from JSON file override module defaults.
- Memory blocks and initial conditions are critical for accurate simulation.

## Success Criteria

- Test changes from ❌ (failed) to ✅ (passed)
- Overall test success rate improves
- No other tests are broken by the changes