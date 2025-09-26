#!/usr/bin/env python3

from modular_math.parser import parse_file
from modular_math.vm import VirtualMachine

# Parse and run PID controller directly
ast = parse_file("examples/ex23_pid_controller.txt")
vm = VirtualMachine()
vm.load_program(ast)
vm.max_steps = 10
results = vm.run()

print("=== DIRECT RUN ===")
print(f"Plant output: {results.get('plant_output', [])[:10]}")
print(f"Control signal: {results.get('control_signal', [])[:10]}")

# Expected for comparison
expected = [0.0, 2.0, 4.9, 7.8, 9.8, 10.5, 10.3, 10.1, 10.0, 10.0]
print(f"Expected: {expected}")

# Check if there's a specific parameter that would give expected results
# Let's try to reverse engineer what kp should be
# Step 0: error=10, expected plant_output[1]=2.0
# With dt=0.1: control = plant_output[1]/dt = 2.0/0.1 = 20
# So kp * error = 20, kp * 10 = 20, kp = 2 ✓

# Step 1: error=8 (10-2), expected increment=2.9 (4.9-2.0)
# With dt=0.1: control = 2.9/0.1 = 29
# But simple P: kp * error = 2 * 8 = 16 ≠ 29
# This suggests I or D terms are significant

print("\n=== REVERSE ENGINEERING ===")
for i in range(len(expected)-1):
    if i > 0:
        error = 10 - expected[i]
        increment = expected[i+1] - expected[i]
        implied_control = increment / 0.1
        simple_p = 2.0 * error
        print(f"Step {i}: error={error:.1f}, increment={increment:.1f}, implied_control={implied_control:.1f}, simple_p={simple_p:.1f}")