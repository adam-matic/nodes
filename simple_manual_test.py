#!/usr/bin/env python3

from modular_math.parser import parse_file
from modular_math.vm import VirtualMachine

def test_sine_wave():
    print("=== Manual Sine Wave Test ===")

    # Parse the fixed sine wave file
    ast = parse_file("/storage/emulated/0/dev/examples/ex20_sine_wave_fixed.txt")

    # Create VM and run
    vm = VirtualMachine()

    try:
        # Load the AST into the VM
        vm.load_program(ast)

        # Run the simulation
        results = vm.run()
        print("VM Results:", results)

        if 'sine_out' in results:
            sine_values = results['sine_out']
            print("Sine wave values:", sine_values)
        else:
            print("No 'sine_out' in results. Available keys:", list(results.keys()))

    except Exception as e:
        print(f"VM execution error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_sine_wave()