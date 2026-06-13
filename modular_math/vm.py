"""
Virtual Machine for the Modular Math Language

This module implements a virtual machine that executes programs parsed into ASTs.
The VM handles step-based execution, signal flow, memory blocks, and module composition.
"""

from typing import Dict, List, Any, Optional, Set, Tuple, Union
from dataclasses import dataclass, field
from collections import defaultdict, deque
import copy

from .ast_nodes import *


@dataclass
class Signal:
    """Represents a signal in the system."""
    name: str
    values: List[float] = field(default_factory=list)

    def get_value(self, step: int) -> float:
        """Get signal value at a specific step."""
        if step < 0 or step >= len(self.values):
            return 0.0
        return self.values[step]

    def set_value(self, step: int, value: float):
        """Set signal value at a specific step."""
        # Extend the list if necessary
        while len(self.values) <= step:
            self.values.append(0.0)
        self.values[step] = value


@dataclass
class Operation:
    """Represents a single operation to be executed."""
    name: str
    op_type: str  # 'builtin', 'mem_read', 'mem_write', 'constant', 'step'
    inputs: List[str] = field(default_factory=list)
    output: str = ""
    params: Dict[str, Any] = field(default_factory=dict)

    def execute(self, signals: Dict[str, Signal], step: int) -> float:
        """Execute this operation and return the result."""
        if self.op_type == 'constant':
            return self.params['value']

        elif self.op_type == 'step':
            return float(step)

        elif self.op_type == 'mem_read':
            # Read from previous step
            if step == 0:
                # Use initial value from parameter or signal
                if self.params.get('initial_signal'):
                    initial_signal = signals[self.params['initial_signal']]
                    return initial_signal.get_value(0)
                else:
                    return self.params['initial_value']
            else:
                input_signal = signals[self.inputs[0]]
                return input_signal.get_value(step - 1)

        elif self.op_type == 'mem_write':
            # This is handled by the VM directly
            return 0.0

        elif self.op_type == 'builtin':
            return self._execute_builtin(signals, step)

        else:
            raise ValueError(f"Unknown operation type: {self.op_type}")

    def _execute_builtin(self, signals: Dict[str, Signal], step: int) -> float:
        """Execute a built-in function."""
        # Get input values
        input_values = []
        for input_name in self.inputs:
            if input_name in signals:
                input_values.append(signals[input_name].get_value(step))
            else:
                raise ValueError(f"Signal not found: {input_name}")

        # Execute based on function name
        if self.name == 'add':
            return input_values[0] + input_values[1]
        elif self.name in ['mul', 'mult']:
            return input_values[0] * input_values[1]
        elif self.name == 'sub':
            return input_values[0] - input_values[1]
        elif self.name == 'div':
            if input_values[1] == 0:
                raise ValueError("Division by zero")
            return input_values[0] / input_values[1]
        elif self.name == 'gt':
            return 1.0 if input_values[0] > input_values[1] else 0.0
        elif self.name == 'lt':
            return 1.0 if input_values[0] < input_values[1] else 0.0
        elif self.name == 'eq':
            return 1.0 if abs(input_values[0] - input_values[1]) < 1e-10 else 0.0
        elif self.name == 'gte':
            return 1.0 if input_values[0] >= input_values[1] else 0.0
        elif self.name == 'lte':
            return 1.0 if input_values[0] <= input_values[1] else 0.0
        elif self.name == 'copy':
            return input_values[0]
        else:
            raise ValueError(f"Unknown built-in function: {self.name}")


@dataclass
class MemoryBlock:
    """Represents a memory block with its state."""
    name: str
    input_signal: str
    output_signal: str
    initial_value: float


class ModuleResolver:
    """Resolves and loads module dependencies."""

    def __init__(self):
        import os
        self.loaded_modules: Dict[str, ModuleDefinition] = {}
        project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        examples_dir = os.path.join(project_root, 'examples')
        self.module_search_paths = [
            os.path.join(examples_dir, 'basic'),
            os.path.join(examples_dir, 'control_systems'),
            os.path.join(examples_dir, 'advanced'),
            examples_dir  # fallback
        ]

    def load_module(self, module_name: str, module_path: Optional[str] = None, base_dir: Optional[str] = None) -> ModuleDefinition:
        """Load a module by name and optional explicit path."""
        if module_name in self.loaded_modules:
            return self.loaded_modules[module_name]

        # If explicit path is provided, use it
        module_file = None
        if module_path:
            import os
            if not os.path.isabs(module_path):
                # For relative paths, use base_dir if provided, otherwise current working context
                if base_dir:
                    module_file = os.path.join(base_dir, module_path)
                else:
                    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
                    module_file = os.path.join(project_root, module_path)
            else:
                module_file = module_path
            # Fall back to search paths if the explicit path doesn't exist
            # (e.g. code submitted from the web interface has no base directory)
            if not os.path.exists(module_file):
                module_file = None

        if not module_file:
            # Try to find module in search paths
            for search_path in self.module_search_paths:
                candidate_file = f"{search_path}/{module_name}.txt"
                try:
                    with open(candidate_file, 'r'):
                        module_file = candidate_file
                        break
                except FileNotFoundError:
                    continue

            if not module_file:
                raise ValueError(f"Module {module_name} not found in search paths")

        try:
            from .parser import parse_file
            program = parse_file(module_file)

            # Find the module definition
            for module in program.modules:
                if module.name == module_name:
                    self.loaded_modules[module_name] = module

                    # Load any dependencies - pass the directory context for relative imports
                    import os
                    current_dir = os.path.dirname(module_file)
                    for import_stmt in program.imports:
                        if import_stmt.module_path:
                            # Pass the current directory as base for relative imports
                            self.load_module(import_stmt.module_name, import_stmt.module_path, current_dir)
                        else:
                            self.load_module(import_stmt.module_name)

                    return module

            raise ValueError(f"Module {module_name} not found in {module_file}")

        except FileNotFoundError:
            raise ValueError(f"Module file not found: {module_file}")


class VirtualMachine:
    """Virtual machine for executing modular math language programs."""

    def __init__(self):
        self.signals: Dict[str, Signal] = {}
        self.operations: List[Operation] = []
        self.memory_blocks: List[MemoryBlock] = []
        self.halt_conditions: List[str] = []
        self.max_steps = 1000
        self.save_signals: List[str] = []
        self.plot_signals: List[str] = []
        self.current_step = 0
        self.halted = False

        self.module_resolver = ModuleResolver()
        self.operation_order: List[int] = []  # Topologically sorted operation indices
        self.program_modules: Dict[str, ModuleDefinition] = {}  # Modules from current program

    def load_program(self, program: Program, source_file: Optional[str] = None):
        """Load a program AST into the VM."""
        self.signals.clear()
        self.operations.clear()
        self.memory_blocks.clear()
        self.halt_conditions.clear()

        # Store program modules for internal resolution
        self.program_modules.clear()
        for module in program.modules:
            self.program_modules[module.name] = module

        # Load all imported modules with proper base directory context
        import os
        if source_file:
            base_dir = os.path.dirname(os.path.abspath(source_file))
        else:
            base_dir = os.getcwd()  # Default to current working directory

        for import_stmt in program.imports:
            if import_stmt.module_path:
                self.module_resolver.load_module(import_stmt.module_name, import_stmt.module_path, base_dir)
            else:
                self.module_resolver.load_module(import_stmt.module_name)

        # Process execution block
        if program.execution:
            self._process_execution_block(program.execution)

        # Flatten all modules
        for module in program.modules:
            self._flatten_module(module, "")

        # Build computation graph and sort operations
        self._build_computation_graph()
        self._topological_sort()

        # Initialize signal tables
        self._initialize_signals()

    def _process_execution_block(self, execution: ExecutionBlock):
        """Process the execution configuration."""
        if execution.max_steps is not None:
            self.max_steps = execution.max_steps

        if execution.save:
            for expr in execution.save:
                self.save_signals.append(self._get_signal_name(expr))

        if execution.plot:
            for expr in execution.plot:
                self.plot_signals.append(self._get_signal_name(expr))

        if execution.stop_when:
            # TODO: Handle stop_when condition
            pass

    def _get_signal_name(self, expr: Expression) -> str:
        """Extract signal name from an expression."""
        if isinstance(expr, Identifier):
            return expr.name
        elif isinstance(expr, StepVariable):
            return "$step"
        elif isinstance(expr, DotAccess):
            obj_name = self._get_signal_name(expr.object)
            return f"{obj_name}.{expr.member}"
        else:
            raise ValueError(f"Cannot extract signal name from {type(expr)}")

    def _resolve_dot_access(self, expr: 'DotAccess', prefix: str) -> str:
        """Flattened signal name for a dotted reference within `prefix`.
        e.g. instance `s` output `sum` at prefix '' -> 's.sum'."""
        return f"{prefix}{self._get_signal_name(expr)}"

    def _flatten_module(self, module: ModuleDefinition, prefix: str, overridden_params: Optional[Set[str]] = None):
        """Flatten a module into operations and signals."""
        full_prefix = f"{prefix}." if prefix else ""

        # Create signals for inputs, parameters, and outputs
        for stmt in module.body:
            if isinstance(stmt, InputDeclaration):
                signal_name = f"{full_prefix}{stmt.name}"
                self.signals[signal_name] = Signal(signal_name)

            elif isinstance(stmt, ParameterDeclaration):
                signal_name = f"{full_prefix}{stmt.name}"
                self.signals[signal_name] = Signal(signal_name)

                # If parameter has a default value and wasn't overridden, create a constant operation
                if stmt.default_value and (overridden_params is None or stmt.name not in overridden_params):
                    value = self._evaluate_constant_expression(stmt.default_value)
                    op = Operation(
                        name="const",
                        op_type="constant",
                        output=signal_name,
                        params={"value": value}
                    )
                    self.operations.append(op)

            elif isinstance(stmt, OutputDeclaration):
                signal_name = f"{full_prefix}{stmt.name}"
                if signal_name not in self.signals:
                    self.signals[signal_name] = Signal(signal_name)

            elif isinstance(stmt, Assignment):
                self._flatten_assignment(stmt, full_prefix)

            elif isinstance(stmt, HaltStatement):
                halt_signal = self._ensure_signal_for_expression(stmt.condition, full_prefix)
                self.halt_conditions.append(halt_signal)

    def _evaluate_constant_expression(self, expr: Expression, prefix: str = "") -> float:
        """Evaluate a constant expression at compile time."""
        if isinstance(expr, NumberLiteral):
            return expr.value
        elif isinstance(expr, Identifier):
            # Try to find the parameter value
            param_signal = f"{prefix}{expr.name}"
            if param_signal in self.signals:
                # If the parameter has been set, get its value
                signal = self.signals[param_signal]
                if signal.values:
                    return signal.values[0]
            # If not found, return 0 as default (will be set later by parameter assignment)
            return 0.0
        elif isinstance(expr, BinaryOperation):
            left = self._evaluate_constant_expression(expr.left, prefix)
            right = self._evaluate_constant_expression(expr.right, prefix)

            if expr.operator == '+':
                return left + right
            elif expr.operator == '-':
                return left - right
            elif expr.operator == '*':
                return left * right
            elif expr.operator == '/':
                return left / right
            else:
                raise ValueError(f"Unsupported operator in constant expression: {expr.operator}")
        else:
            raise ValueError(f"Cannot evaluate constant expression: {type(expr)}")

    def _flatten_assignment(self, assignment: Assignment, prefix: str):
        """Flatten an assignment into operations."""
        output_signal = f"{prefix}{assignment.target}"

        # Ensure output signal exists
        if output_signal not in self.signals:
            self.signals[output_signal] = Signal(output_signal)

        # Create operation based on the assignment value
        self._create_operation_from_expression(assignment.value, output_signal, prefix)

    def _create_operation_from_expression(self, expr: Expression, output_signal: str, prefix: str):
        """Create operations from an expression."""
        if isinstance(expr, NumberLiteral):
            op = Operation(
                name="const",
                op_type="constant",
                output=output_signal,
                params={"value": expr.value}
            )
            self.operations.append(op)

        elif isinstance(expr, Identifier):
            # This is just a signal reference - create a copy operation
            input_signal = f"{prefix}{expr.name}"
            op = Operation(
                name="copy",
                op_type="builtin",
                inputs=[input_signal],
                output=output_signal
            )
            self.operations.append(op)

        elif isinstance(expr, StepVariable):
            op = Operation(
                name="step",
                op_type="step",
                output=output_signal
            )
            self.operations.append(op)

        elif isinstance(expr, BinaryOperation):
            self._create_binary_operation(expr, output_signal, prefix)

        elif isinstance(expr, FunctionCall):
            self._create_function_call_operation(expr, output_signal, prefix)

        elif isinstance(expr, ModuleInstantiation):
            self._create_module_instantiation(expr, output_signal, prefix)

        elif isinstance(expr, DotAccess):
            # Reading one output of a multi-output module instance: the
            # instance's outputs are flattened to "<instance>.<output>"
            # signals, so copy from there.
            source_signal = self._resolve_dot_access(expr, prefix)
            op = Operation(
                name="copy",
                op_type="builtin",
                inputs=[source_signal],
                output=output_signal
            )
            self.operations.append(op)

        else:
            raise ValueError(f"Unsupported expression type: {type(expr)}")

    def _create_binary_operation(self, expr: BinaryOperation, output_signal: str, prefix: str):
        """Create operation for binary expression."""
        # Create temporary signals for operands if needed
        left_signal = self._ensure_signal_for_expression(expr.left, prefix)
        right_signal = self._ensure_signal_for_expression(expr.right, prefix)

        # Map operators to function names
        op_map = {
            '+': 'add', '-': 'sub', '*': 'mul', '/': 'div',
            '>': 'gt', '<': 'lt', '==': 'eq', '>=': 'gte', '<=': 'lte'
        }

        if expr.operator not in op_map:
            raise ValueError(f"Unsupported binary operator: {expr.operator}")

        op = Operation(
            name=op_map[expr.operator],
            op_type="builtin",
            inputs=[left_signal, right_signal],
            output=output_signal
        )
        self.operations.append(op)

    def _create_function_call_operation(self, expr: FunctionCall, output_signal: str, prefix: str):
        """Create operation for function call."""
        if expr.name == 'mem':
            # Special handling for memory blocks
            if len(expr.arguments) != 2:
                raise ValueError("mem function requires exactly 2 arguments")

            # Handle initial value - could be a constant or parameter reference
            if isinstance(expr.arguments[0], NumberLiteral):
                initial_value = expr.arguments[0].value
                initial_signal = None
            else:
                # Create signal for the initial value expression
                initial_signal = self._ensure_signal_for_expression(expr.arguments[0], prefix)
                initial_value = 0.0  # Default, will be overridden at runtime

            input_signal = self._ensure_signal_for_expression(expr.arguments[1], prefix)

            # Create memory block
            mem_block = MemoryBlock(
                name=output_signal,
                input_signal=input_signal,
                output_signal=output_signal,
                initial_value=initial_value
            )
            self.memory_blocks.append(mem_block)

            # Create mem_read operation
            op = Operation(
                name="mem_read",
                op_type="mem_read",
                inputs=[input_signal] + ([initial_signal] if initial_signal else []),
                output=output_signal,
                params={"initial_value": initial_value, "initial_signal": initial_signal}
            )
            self.operations.append(op)

        else:
            # Regular function call
            input_signals = []
            for arg in expr.arguments:
                input_signals.append(self._ensure_signal_for_expression(arg, prefix))

            op = Operation(
                name=expr.name,
                op_type="builtin",
                inputs=input_signals,
                output=output_signal
            )
            self.operations.append(op)

    def _create_module_instantiation(self, expr: ModuleInstantiation, output_signal: str, prefix: str):
        """Create operations for module instantiation."""
        # Load the module definition - check program modules first
        if expr.module_name in self.program_modules:
            module_def = self.program_modules[expr.module_name]
        else:
            module_def = self.module_resolver.load_module(expr.module_name)

        # Create instance prefix
        instance_name = output_signal.replace(f"{prefix}", "").replace(".", "")
        instance_prefix = f"{prefix}{instance_name}"

        # Bind parameters
        param_bindings = {}
        for param_name, param_expr in expr.parameters.items():
            param_signal = f"{instance_prefix}.{param_name}"
            self.signals[param_signal] = Signal(param_signal)

            # Create operation to set parameter value
            self._create_operation_from_expression(param_expr, param_signal, prefix)
            param_bindings[param_name] = param_signal

        # Flatten the module with the instance prefix
        overridden_param_names = set(expr.parameters.keys())
        self._flatten_module(module_def, instance_prefix, overridden_param_names)

        # Handle single output case - copy output to the assignment target
        outputs = [stmt for stmt in module_def.body if isinstance(stmt, OutputDeclaration)]
        if len(outputs) == 1:
            output_name = outputs[0].name
            source_signal = f"{instance_prefix}.{output_name}"

            op = Operation(
                name="copy",
                op_type="builtin",
                inputs=[source_signal],
                output=output_signal
            )
            self.operations.append(op)

    def _ensure_signal_for_expression(self, expr: Expression, prefix: str) -> str:
        """Ensure a signal exists for an expression and return its name."""
        if isinstance(expr, Identifier):
            signal_name = f"{prefix}{expr.name}"
            if signal_name not in self.signals:
                self.signals[signal_name] = Signal(signal_name)
            return signal_name

        elif isinstance(expr, StepVariable):
            return "$step"

        elif isinstance(expr, DotAccess):
            signal_name = self._resolve_dot_access(expr, prefix)
            if signal_name not in self.signals:
                self.signals[signal_name] = Signal(signal_name)
            return signal_name

        elif isinstance(expr, NumberLiteral):
            # Create a temporary signal for the constant
            temp_name = f"_temp_const_{len(self.operations)}"
            self.signals[temp_name] = Signal(temp_name)

            op = Operation(
                name="const",
                op_type="constant",
                output=temp_name,
                params={"value": expr.value}
            )
            self.operations.append(op)
            return temp_name

        else:
            # Create a temporary signal and operation for complex expressions
            temp_name = f"_temp_{len(self.operations)}"
            self.signals[temp_name] = Signal(temp_name)
            self._create_operation_from_expression(expr, temp_name, prefix)
            return temp_name

    def _build_computation_graph(self):
        """Build the computation dependency graph."""
        # This will be used by topological sort
        pass

    def _topological_sort(self):
        """Sort operations in topological order."""
        # Build dependency graph
        dependencies: Dict[int, Set[int]] = defaultdict(set)
        dependents: Dict[int, Set[int]] = defaultdict(set)

        # Map signal names to operation indices that produce them
        signal_producers: Dict[str, int] = {}

        for i, op in enumerate(self.operations):
            if op.output:
                signal_producers[op.output] = i

        # Build dependencies - but ignore dependencies for mem_read operations
        # since they read from the previous step, except for initial_signal dependencies
        for i, op in enumerate(self.operations):
            if op.op_type == 'mem_read':
                # Memory read operations don't depend on current step values,
                # but they do depend on their initial_signal at step 0
                if 'initial_signal' in op.params:
                    initial_signal_name = op.params['initial_signal']
                    if initial_signal_name in signal_producers:
                        producer_idx = signal_producers[initial_signal_name]
                        dependencies[i].add(producer_idx)
                        dependents[producer_idx].add(i)
                continue

            for input_signal in op.inputs:
                if input_signal in signal_producers:
                    producer_idx = signal_producers[input_signal]
                    # Don't create dependency if the producer is a mem_read for the same signal
                    # AND the consumer is also accessing that signal from a previous step
                    producer_op = self.operations[producer_idx]
                    if (producer_op.op_type == 'mem_read' and producer_op.output == input_signal and
                        op.op_type == 'mem_read'):
                        # Only skip for mem_read -> mem_read dependencies on same signal
                        continue
                    dependencies[i].add(producer_idx)
                    dependents[producer_idx].add(i)

        # Kahn's algorithm for topological sorting
        in_degree = {i: len(dependencies[i]) for i in range(len(self.operations))}
        queue = deque([i for i in range(len(self.operations)) if in_degree[i] == 0])
        result = []

        while queue:
            current = queue.popleft()
            result.append(current)

            for dependent in dependents[current]:
                in_degree[dependent] -= 1
                if in_degree[dependent] == 0:
                    queue.append(dependent)

        if len(result) != len(self.operations):
            raise ValueError("Circular dependency detected in computation graph")

        self.operation_order = result

    def _initialize_signals(self):
        """Initialize signal tables for execution."""
        # Add special $step signal
        if "$step" not in self.signals:
            self.signals["$step"] = Signal("$step")

        # Pre-allocate signal storage
        for signal in self.signals.values():
            signal.values = [0.0] * (self.max_steps + 1)

    def run(self) -> Dict[str, List[float]]:
        """Execute the program and return results."""
        self.current_step = 0
        self.halted = False

        while self.current_step < self.max_steps and not self.halted:
            self.step()

        return self.get_results()

    def reset(self):
        """Reset the VM execution state."""
        print(f"[VM] Reset called - current_step was {self.current_step}, resetting to 0")
        self.current_step = 0
        self.halted = False

        # Clear all signal values but keep signal definitions
        for signal in self.signals.values():
            signal.values.clear()
        print(f"[VM] Reset complete - current_step is now {self.current_step}")

    def step(self):
        """Execute one simulation step."""
        # Set $step signal value
        if "$step" in self.signals:
            self.signals["$step"].set_value(self.current_step, float(self.current_step))

        # Execute operations in topological order
        halt_triggered = False

        for op_idx in self.operation_order:
            op = self.operations[op_idx]

            if op.op_type == 'mem_write':
                continue  # Memory writes are handled differently

            try:
                result = op.execute(self.signals, self.current_step)

                # Save the result immediately so other operations can use it
                if op.output:
                    self.signals[op.output].set_value(self.current_step, result)

                # Check if this is a halt condition (but don't halt yet)
                if op.output in self.halt_conditions and result != 0.0:
                    halt_triggered = True

            except Exception as e:
                raise RuntimeError(f"Error executing operation {op.name} at step {self.current_step}: {e}")

        # Set halt flag after all operations are complete
        if halt_triggered:
            self.halted = True

        # Increment step counter for next iteration
        if not self.halted and self.current_step < self.max_steps:
            self.current_step += 1

        # Check if we've reached max_steps
        if self.current_step >= self.max_steps:
            self.halted = True

    def get_results(self) -> Dict[str, List[float]]:
        """Get execution results."""
        results = {}

        # Determine how many steps to include
        result_steps = self.current_step
        if self.halted and self.current_step < self.max_steps:
            # Halted by a HALT condition: current_step was not incremented,
            # so include the step that triggered the halt
            result_steps = self.current_step + 1

        # Always include step numbers
        if "$step" in self.signals:
            results["$step"] = self.signals["$step"].values[:result_steps]

        # Include saved signals
        for signal_name in self.save_signals:
            if signal_name in self.signals:
                results[signal_name] = self.signals[signal_name].values[:result_steps]

        return results