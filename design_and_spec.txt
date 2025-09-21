# Modular Math Language: Design and Specification

## 1. Overview

This document specifies a domain-specific language (DSL) for describing and simulating modular computational systems. The language is inspired by block diagrams used in analog computing and control theory, and it operates on scalar signals over discrete time steps.

The core unit of the language is the **module**. A module defines a reusable computational block with named inputs, outputs, and parameters. Modules are composed of basic computational blocks and instances of other modules.

The execution model is based on a global step counter, `$step`, which serves as the main independent variable. The language is intentionally simple, with no support for complex control flow constructs like loops or conditionals within the module definition itself.

## 2. Core Concepts

### 2.1. Execution Model

- **Step-based Execution**: The simulation proceeds in discrete steps. At each step, a global counter, `$step`, is incremented.
- **Discrete Time**: All signals are computed at each time step. Continuous time can be modeled by defining a time variable, e.g., `time = $step * dt`, where `dt` is a fixed time step.
- **Signal Flow**: The language is based on a signal flow paradigm. Signals are variables that are re-calculated at every step.
- **Implicit Parallelism**: All computations within a step are considered to happen simultaneously. The order of statements in a module does not imply a sequence of execution, except where a signal is used in a subsequent calculation within the same step.

### 2.2. Variables and Data Types

- **Scalars Only**: The language currently supports only scalar numerical values. There are no arrays, vectors, or strings.
- **Signals**: A signal is a variable whose value is computed at each step. Signals represent the data flowing through the system.
- **Parameters (`param`)**: A parameter is a constant value that is set at design time when a module is instantiated. Parameters are used to configure modules.
- **Global Step Counter (`$step`)**: A built-in global variable that represents the current execution step, starting from 0.

### 2.3. Scope and Naming

- **Local Scope**: Within a module, signals can be accessed by their name.
- **Global Access**: When a module has a single output, the instance name itself can be used to access that output value. If a module has multiple outputs, they can be accessed using dot notation: `instance_name.signal_name`.

## 3. Basic Blocks

Basic blocks are the fundamental building blocks of the language.

### 3.1. Arithmetic Blocks

- `add(in1, in2)`: `out = in1 + in2`
- `sub(in1, in2)`: `out = in1 - in2`
- `mul(in1, in2)`: `out = in1 * in2`
- `div(in1, in2)`: `out = in1 / in2`

These can also be expressed using infix operators: `+`, `-`, `*`, `/`.

### 3.2. Comparison Blocks

Comparison blocks output `1` if the condition is true, and `0` otherwise.

- `gt(in1, in2)`: `out = 1` if `in1 > in2`, else `0`
- `lt(in1, in2)`: `out = 1` if `in1 < in2`, else `0`
- `eq(in1, in2)`: `out = 1` if `in1 == in2`, else `0`
- `gte(in1, in2)`: `out = 1` if `in1 >= in2`, else `0`
- `lte(in1, in2)`: `out = 1` if `in1 <= in2`, else `0`

### 3.3. Memory Block: `mem`

The `mem` block is essential for creating systems with memory and for implementing feedback loops. It introduces a one-step delay.

- **Syntax**: `mem(initial_value, input_signal)`
- **Operation**: 
    1.  For the first step (`$step = 0`), the output is `initial_value`.
    2.  At step `n`, the output of the `mem` block is the value of `input_signal` from step `n-1`.
    3.  The block internally stores the value of `input_signal` at step `n` to be used as the output at step `n+1`.

**Example:**
```
a = $step * 0.1
b = mem(0, a)
```
In this example, the signal `b` will always have the value that `a` had in the previous step. At `$step = 0`, `b` will be `0`.

### 3.4. Control Flow Block: `HALT`

- **Syntax**: `HALT(condition)`
- **Operation**: The `HALT` block stops the execution of the simulation if its input `condition` is a non-zero value. This is the primary way to terminate a simulation from within a module.

## 4. Module Definition and Instantiation

### 4.1. Module Definition

A module is defined using the `module` keyword.

```
module module_name {
    // Inputs, parameters, and signal definitions
}
```

- **`input`**: Declares a named input signal that must be provided when the module is instantiated.
- **`param`**: Declares a named parameter that can be set at instantiation time.
- **`output`**: Declares a named output signal for the module. If a module has multiple outputs, they can be accessed by name.

### 4.2. Module Instantiation

A module is instantiated by assigning it to a variable. Parameters can be passed during instantiation.

```
instance_name = module_name(param1=value1, param2=value2)
```

### 4.3. Feedback Loops

Any feedback loop in the system must contain at least one `mem` block. A loop without a `mem` block would create a combinatorial loop, which is a compile-time error.

## 5. Runtime Configuration

The execution of a simulation is controlled by a runtime configuration block, which is separate from the module definitions.

- **Syntax**:
```
execution {
    max_steps: <integer>
    stop_when: <condition>
    save: [<signal1>, <instance.signal2>, ...]
    plot: [<signal_to_plot>, ...]
}
```
- **`max_steps`**: The maximum number of steps to run the simulation.
- **`stop_when`**: A condition that, when true, will stop the simulation. This is an alternative to the `HALT` block.
- **`save`**: A list of signals to be saved to the output table at each step.
- **`plot`**: A list of signals to be plotted after the simulation finishes.

When a module is imported into another module, its `execution` block (if any) is ignored.

## 6. Examples

### 6.1. Constant Value Module

This module outputs a constant value.

```
module const {
    param value
    output value
}

// Usage:
// my_const = const(value=42)
// a = my_const + 1
```

### 6.2. Euler Integrator

This module implements a simple Euler integrator.

```
module euler_integrator {
    input signal
    param dt
    param initial_value

    // Euler integration: integral = previous_integral + signal * dt
    signal_dt = signal * dt
    next_integral = integral + signal_dt
    integral = mem(initial_value, next_integral)

    output integral
}
```

### 6.3. Range Generator

This module generates a sequence of numbers and halts when a stop condition is met.

```
module range {
    param start
    param step_size
    param stop

    step_offset = $step * step_size
    current_value = start + step_offset

    // Stop when current value reaches or exceeds stop parameter
    should_stop = gte(current_value, stop)
    HALT(should_stop)

    output current_value
}
```

### 6.4. Composed Module with Runtime Configuration

This example shows how to compose modules and use a runtime configuration.

```
import range

module time_module {
    param start
    param dt
    param stop

    // Create time signal using imported range module
    timer = range(start=start, step_size=dt, stop=stop)

    output timer
}

// Runtime configuration
execution {
    max_steps: 10000
    // The stop condition is handled by the HALT block inside the range module.
    save: [timer, $step]
}
```
