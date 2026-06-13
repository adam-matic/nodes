/**
 * Virtual Machine for the Modular Math Language.
 * JavaScript port of modular_math/vm.py — keep the two in sync.
 *
 * The VM handles step-based execution, signal flow, memory blocks, and
 * module composition. Module imports are resolved through a pluggable
 * source resolver (a module-name-keyed registry in the browser, the
 * filesystem in Node tests) since the browser has no filesystem.
 */

(function (root, factory) {
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = factory(require('./parser.js'));
    } else {
        Object.assign(root, factory(root));
    }
})(typeof self !== 'undefined' ? self : this, function (parserModule) {
    const { parseString } = parserModule;

    class Signal {
        constructor(name) {
            this.name = name;
            this.values = [];
        }

        getValue(step) {
            if (step < 0 || step >= this.values.length) return 0.0;
            return this.values[step];
        }

        setValue(step, value) {
            while (this.values.length <= step) {
                this.values.push(0.0);
            }
            this.values[step] = value;
        }
    }

    class Operation {
        constructor(name, opType, inputs = [], output = '', params = {}) {
            this.name = name;
            this.opType = opType; // 'builtin', 'mem_read', 'mem_write', 'constant', 'step'
            this.inputs = inputs;
            this.output = output;
            this.params = params;
        }

        execute(signals, step) {
            if (this.opType === 'constant') {
                return this.params.value;
            }

            if (this.opType === 'step') {
                return step;
            }

            if (this.opType === 'mem_read') {
                // Read from previous step
                if (step === 0) {
                    if (this.params.initialSignal) {
                        return signals[this.params.initialSignal].getValue(0);
                    }
                    return this.params.initialValue;
                }
                return signals[this.inputs[0]].getValue(step - 1);
            }

            if (this.opType === 'mem_write') {
                return 0.0; // Handled by the VM directly
            }

            if (this.opType === 'builtin') {
                return this.executeBuiltin(signals, step);
            }

            throw new Error(`Unknown operation type: ${this.opType}`);
        }

        executeBuiltin(signals, step) {
            const inputValues = this.inputs.map((inputName) => {
                if (!(inputName in signals)) {
                    throw new Error(`Signal not found: ${inputName}`);
                }
                return signals[inputName].getValue(step);
            });

            switch (this.name) {
                case 'add': return inputValues[0] + inputValues[1];
                case 'mul':
                case 'mult': return inputValues[0] * inputValues[1];
                case 'sub': return inputValues[0] - inputValues[1];
                case 'div':
                    if (inputValues[1] === 0) throw new Error('Division by zero');
                    return inputValues[0] / inputValues[1];
                case 'gt': return inputValues[0] > inputValues[1] ? 1.0 : 0.0;
                case 'lt': return inputValues[0] < inputValues[1] ? 1.0 : 0.0;
                case 'eq': return Math.abs(inputValues[0] - inputValues[1]) < 1e-10 ? 1.0 : 0.0;
                case 'gte': return inputValues[0] >= inputValues[1] ? 1.0 : 0.0;
                case 'lte': return inputValues[0] <= inputValues[1] ? 1.0 : 0.0;
                case 'copy': return inputValues[0];
                default:
                    throw new Error(`Unknown built-in function: ${this.name}`);
            }
        }
    }

    class MemoryBlock {
        constructor(name, inputSignal, outputSignal, initialValue) {
            this.name = name;
            this.inputSignal = inputSignal;
            this.outputSignal = outputSignal;
            this.initialValue = initialValue;
        }
    }

    class ModuleResolver {
        /**
         * @param resolveSource optional (moduleName, modulePath, context) -> {source, context}
         *        Returns the module source text and an opaque context passed back for
         *        the module's own relative imports. The default looks up moduleName in
         *        the registry (window.MODULE_LIBRARY in the browser).
         */
        constructor(resolveSource = null) {
            this.loadedModules = {};
            this.resolveSource = resolveSource || ModuleResolver.registryResolver;
        }

        static registryResolver(moduleName) {
            const registry = (typeof MODULE_LIBRARY !== 'undefined') ? MODULE_LIBRARY : {};
            if (!(moduleName in registry)) {
                throw new Error(`Module ${moduleName} not found in search paths`);
            }
            return { source: registry[moduleName], context: null };
        }

        loadModule(moduleName, modulePath = null, context = null) {
            if (moduleName in this.loadedModules) {
                return this.loadedModules[moduleName];
            }

            const resolved = this.resolveSource(moduleName, modulePath, context);
            const program = parseString(resolved.source);

            for (const module of program.modules) {
                if (module.name === moduleName) {
                    this.loadedModules[moduleName] = module;

                    // Load any dependencies with the resolved context
                    for (const importStmt of program.imports) {
                        this.loadModule(importStmt.moduleName, importStmt.modulePath, resolved.context);
                    }

                    return module;
                }
            }

            throw new Error(`Module ${moduleName} not found in resolved source`);
        }
    }

    class VirtualMachine {
        constructor(resolveSource = null) {
            this.signals = {};
            this.operations = [];
            this.memoryBlocks = [];
            this.haltConditions = [];
            this.maxSteps = 1000;
            this.saveSignals = [];
            this.plotSignals = [];
            this.currentStep = 0;
            this.halted = false;

            this.moduleResolver = new ModuleResolver(resolveSource);
            this.operationOrder = []; // Topologically sorted operation indices
            this.programModules = {}; // Modules from current program
        }

        loadProgram(program, context = null) {
            this.signals = {};
            this.operations = [];
            this.memoryBlocks = [];
            this.haltConditions = [];

            this.programModules = {};
            for (const module of program.modules) {
                this.programModules[module.name] = module;
            }

            for (const importStmt of program.imports) {
                this.moduleResolver.loadModule(importStmt.moduleName, importStmt.modulePath, context);
            }

            if (program.execution) {
                this.processExecutionBlock(program.execution);
            }

            for (const module of program.modules) {
                this.flattenModule(module, '');
            }

            this.topologicalSort();
            this.initializeSignals();
        }

        processExecutionBlock(execution) {
            if (execution.maxSteps !== null && execution.maxSteps !== undefined) {
                this.maxSteps = execution.maxSteps;
            }

            if (execution.save) {
                for (const expr of execution.save) {
                    this.saveSignals.push(this.getSignalName(expr));
                }
            }

            if (execution.plot) {
                for (const expr of execution.plot) {
                    this.plotSignals.push(this.getSignalName(expr));
                }
            }
        }

        getSignalName(expr) {
            if (expr.kind === 'Identifier') return expr.name;
            if (expr.kind === 'StepVariable') return '$step';
            if (expr.kind === 'DotAccess') {
                return `${this.getSignalName(expr.object)}.${expr.member}`;
            }
            throw new Error(`Cannot extract signal name from ${expr.kind}`);
        }

        /** Flattened signal name for a dotted reference within `prefix`.
         *  e.g. instance `s` output `sum` at prefix '' -> 's.sum'. */
        resolveDotAccess(expr, prefix) {
            return `${prefix}${this.getSignalName(expr)}`;
        }

        flattenModule(module, prefix, overriddenParams = null) {
            const fullPrefix = prefix ? `${prefix}.` : '';

            for (const stmt of module.body) {
                if (stmt.kind === 'InputDeclaration') {
                    const signalName = `${fullPrefix}${stmt.name}`;
                    this.signals[signalName] = new Signal(signalName);

                } else if (stmt.kind === 'ParameterDeclaration') {
                    const signalName = `${fullPrefix}${stmt.name}`;
                    this.signals[signalName] = new Signal(signalName);

                    // If parameter has a default value and wasn't overridden, create a constant
                    if (stmt.defaultValue && (overriddenParams === null || !overriddenParams.has(stmt.name))) {
                        const value = this.evaluateConstantExpression(stmt.defaultValue);
                        this.operations.push(new Operation('const', 'constant', [], signalName, { value }));
                    }

                } else if (stmt.kind === 'OutputDeclaration') {
                    const signalName = `${fullPrefix}${stmt.name}`;
                    if (!(signalName in this.signals)) {
                        this.signals[signalName] = new Signal(signalName);
                    }

                } else if (stmt.kind === 'Assignment') {
                    this.flattenAssignment(stmt, fullPrefix);

                } else if (stmt.kind === 'HaltStatement') {
                    const haltSignal = this.ensureSignalForExpression(stmt.condition, fullPrefix);
                    this.haltConditions.push(haltSignal);
                }
            }
        }

        evaluateConstantExpression(expr, prefix = '') {
            if (expr.kind === 'NumberLiteral') {
                return expr.value;
            }
            if (expr.kind === 'Identifier') {
                const paramSignal = `${prefix}${expr.name}`;
                if (paramSignal in this.signals) {
                    const signal = this.signals[paramSignal];
                    if (signal.values.length > 0) {
                        return signal.values[0];
                    }
                }
                return 0.0;
            }
            if (expr.kind === 'BinaryOperation') {
                const left = this.evaluateConstantExpression(expr.left, prefix);
                const right = this.evaluateConstantExpression(expr.right, prefix);
                switch (expr.operator) {
                    case '+': return left + right;
                    case '-': return left - right;
                    case '*': return left * right;
                    case '/': return left / right;
                    default:
                        throw new Error(`Unsupported operator in constant expression: ${expr.operator}`);
                }
            }
            throw new Error(`Cannot evaluate constant expression: ${expr.kind}`);
        }

        flattenAssignment(assignment, prefix) {
            const outputSignal = `${prefix}${assignment.target}`;

            if (!(outputSignal in this.signals)) {
                this.signals[outputSignal] = new Signal(outputSignal);
            }

            this.createOperationFromExpression(assignment.value, outputSignal, prefix);
        }

        createOperationFromExpression(expr, outputSignal, prefix) {
            if (expr.kind === 'NumberLiteral') {
                this.operations.push(new Operation('const', 'constant', [], outputSignal, { value: expr.value }));

            } else if (expr.kind === 'Identifier') {
                // Just a signal reference - create a copy operation
                const inputSignal = `${prefix}${expr.name}`;
                this.operations.push(new Operation('copy', 'builtin', [inputSignal], outputSignal));

            } else if (expr.kind === 'StepVariable') {
                this.operations.push(new Operation('step', 'step', [], outputSignal));

            } else if (expr.kind === 'BinaryOperation') {
                this.createBinaryOperation(expr, outputSignal, prefix);

            } else if (expr.kind === 'FunctionCall') {
                this.createFunctionCallOperation(expr, outputSignal, prefix);

            } else if (expr.kind === 'ModuleInstantiation') {
                this.createModuleInstantiation(expr, outputSignal, prefix);

            } else if (expr.kind === 'DotAccess') {
                // Reading one output of a multi-output module instance: the
                // instance's outputs are flattened to "<instance>.<output>"
                // signals, so copy from there.
                const sourceSignal = this.resolveDotAccess(expr, prefix);
                this.operations.push(new Operation('copy', 'builtin', [sourceSignal], outputSignal));

            } else {
                throw new Error(`Unsupported expression type: ${expr.kind}`);
            }
        }

        createBinaryOperation(expr, outputSignal, prefix) {
            const leftSignal = this.ensureSignalForExpression(expr.left, prefix);
            const rightSignal = this.ensureSignalForExpression(expr.right, prefix);

            const opMap = {
                '+': 'add', '-': 'sub', '*': 'mul', '/': 'div',
                '>': 'gt', '<': 'lt', '==': 'eq', '>=': 'gte', '<=': 'lte',
            };

            if (!(expr.operator in opMap)) {
                throw new Error(`Unsupported binary operator: ${expr.operator}`);
            }

            this.operations.push(new Operation(opMap[expr.operator], 'builtin', [leftSignal, rightSignal], outputSignal));
        }

        createFunctionCallOperation(expr, outputSignal, prefix) {
            if (expr.name === 'mem') {
                if (expr.arguments.length !== 2) {
                    throw new Error('mem function requires exactly 2 arguments');
                }

                // Handle initial value - could be a constant or parameter reference
                let initialValue, initialSignal;
                if (expr.arguments[0].kind === 'NumberLiteral') {
                    initialValue = expr.arguments[0].value;
                    initialSignal = null;
                } else {
                    initialSignal = this.ensureSignalForExpression(expr.arguments[0], prefix);
                    initialValue = 0.0; // Default, will be overridden at runtime
                }

                const inputSignal = this.ensureSignalForExpression(expr.arguments[1], prefix);

                this.memoryBlocks.push(new MemoryBlock(outputSignal, inputSignal, outputSignal, initialValue));

                const inputs = [inputSignal];
                if (initialSignal) inputs.push(initialSignal);
                this.operations.push(new Operation('mem_read', 'mem_read', inputs, outputSignal,
                    { initialValue, initialSignal }));

            } else {
                const inputSignals = expr.arguments.map((arg) => this.ensureSignalForExpression(arg, prefix));
                this.operations.push(new Operation(expr.name, 'builtin', inputSignals, outputSignal));
            }
        }

        createModuleInstantiation(expr, outputSignal, prefix) {
            // Load the module definition - check program modules first
            let moduleDef;
            if (expr.moduleName in this.programModules) {
                moduleDef = this.programModules[expr.moduleName];
            } else {
                moduleDef = this.moduleResolver.loadModule(expr.moduleName);
            }

            // Create instance prefix (strip the prefix and dots from the target signal)
            let instanceName = prefix ? outputSignal.split(prefix).join('') : outputSignal;
            instanceName = instanceName.split('.').join('');
            const instancePrefix = `${prefix}${instanceName}`;

            // Bind parameters
            for (const [paramName, paramExpr] of Object.entries(expr.parameters)) {
                const paramSignal = `${instancePrefix}.${paramName}`;
                this.signals[paramSignal] = new Signal(paramSignal);
                this.createOperationFromExpression(paramExpr, paramSignal, prefix);
            }

            // Flatten the module with the instance prefix
            const overriddenParamNames = new Set(Object.keys(expr.parameters));
            this.flattenModule(moduleDef, instancePrefix, overriddenParamNames);

            // Handle single output case - copy output to the assignment target
            const outputs = moduleDef.body.filter((stmt) => stmt.kind === 'OutputDeclaration');
            if (outputs.length === 1) {
                const sourceSignal = `${instancePrefix}.${outputs[0].name}`;
                this.operations.push(new Operation('copy', 'builtin', [sourceSignal], outputSignal));
            }
        }

        ensureSignalForExpression(expr, prefix) {
            if (expr.kind === 'Identifier') {
                const signalName = `${prefix}${expr.name}`;
                if (!(signalName in this.signals)) {
                    this.signals[signalName] = new Signal(signalName);
                }
                return signalName;
            }

            if (expr.kind === 'StepVariable') {
                return '$step';
            }

            if (expr.kind === 'DotAccess') {
                const signalName = this.resolveDotAccess(expr, prefix);
                if (!(signalName in this.signals)) {
                    this.signals[signalName] = new Signal(signalName);
                }
                return signalName;
            }

            if (expr.kind === 'NumberLiteral') {
                const tempName = `_temp_const_${this.operations.length}`;
                this.signals[tempName] = new Signal(tempName);
                this.operations.push(new Operation('const', 'constant', [], tempName, { value: expr.value }));
                return tempName;
            }

            // Create a temporary signal and operation for complex expressions
            const tempName = `_temp_${this.operations.length}`;
            this.signals[tempName] = new Signal(tempName);
            this.createOperationFromExpression(expr, tempName, prefix);
            return tempName;
        }

        topologicalSort() {
            const n = this.operations.length;
            const dependencies = Array.from({ length: n }, () => new Set());
            const dependents = Array.from({ length: n }, () => new Set());

            // Map signal names to operation indices that produce them
            const signalProducers = {};
            this.operations.forEach((op, i) => {
                if (op.output) signalProducers[op.output] = i;
            });

            // Build dependencies - mem_read operations read from the previous step,
            // so they only depend on their initial_signal (needed at step 0)
            this.operations.forEach((op, i) => {
                if (op.opType === 'mem_read') {
                    const initialSignalName = op.params.initialSignal;
                    if (initialSignalName && initialSignalName in signalProducers) {
                        const producerIdx = signalProducers[initialSignalName];
                        dependencies[i].add(producerIdx);
                        dependents[producerIdx].add(i);
                    }
                    return;
                }

                for (const inputSignal of op.inputs) {
                    if (inputSignal in signalProducers) {
                        const producerIdx = signalProducers[inputSignal];
                        const producerOp = this.operations[producerIdx];
                        if (producerOp.opType === 'mem_read' && producerOp.output === inputSignal &&
                            op.opType === 'mem_read') {
                            continue;
                        }
                        dependencies[i].add(producerIdx);
                        dependents[producerIdx].add(i);
                    }
                }
            });

            // Kahn's algorithm
            const inDegree = dependencies.map((deps) => deps.size);
            const queue = [];
            for (let i = 0; i < n; i++) {
                if (inDegree[i] === 0) queue.push(i);
            }
            const result = [];

            while (queue.length > 0) {
                const current = queue.shift();
                result.push(current);

                for (const dependent of dependents[current]) {
                    inDegree[dependent] -= 1;
                    if (inDegree[dependent] === 0) {
                        queue.push(dependent);
                    }
                }
            }

            if (result.length !== n) {
                throw new Error('Circular dependency detected in computation graph');
            }

            this.operationOrder = result;
        }

        initializeSignals() {
            if (!('$step' in this.signals)) {
                this.signals['$step'] = new Signal('$step');
            }

            // Pre-allocate signal storage
            for (const signal of Object.values(this.signals)) {
                signal.values = new Array(this.maxSteps + 1).fill(0.0);
            }
        }

        run() {
            this.currentStep = 0;
            this.halted = false;

            while (this.currentStep < this.maxSteps && !this.halted) {
                this.step();
            }

            return this.getResults();
        }

        reset() {
            this.currentStep = 0;
            this.halted = false;

            // Clear all signal values but keep signal definitions
            for (const signal of Object.values(this.signals)) {
                signal.values = [];
            }
        }

        step() {
            // Set $step signal value
            if ('$step' in this.signals) {
                this.signals['$step'].setValue(this.currentStep, this.currentStep);
            }

            let haltTriggered = false;

            for (const opIdx of this.operationOrder) {
                const op = this.operations[opIdx];

                if (op.opType === 'mem_write') continue; // Handled differently

                let result;
                try {
                    result = op.execute(this.signals, this.currentStep);
                } catch (e) {
                    throw new Error(`Error executing operation ${op.name} at step ${this.currentStep}: ${e.message}`);
                }

                // Save the result immediately so other operations can use it
                if (op.output) {
                    this.signals[op.output].setValue(this.currentStep, result);
                }

                // Check if this is a halt condition (but don't halt yet)
                if (this.haltConditions.includes(op.output) && result !== 0.0) {
                    haltTriggered = true;
                }
            }

            // Set halt flag after all operations are complete
            if (haltTriggered) {
                this.halted = true;
            }

            // Increment step counter for next iteration
            if (!this.halted && this.currentStep < this.maxSteps) {
                this.currentStep += 1;
            }

            // Check if we've reached max_steps
            if (this.currentStep >= this.maxSteps) {
                this.halted = true;
            }
        }

        getResults() {
            const results = {};

            // Determine how many steps to include
            let resultSteps = this.currentStep;
            if (this.halted && this.currentStep < this.maxSteps) {
                // Halted by a HALT condition: current_step was not incremented,
                // so include the step that triggered the halt
                resultSteps = this.currentStep + 1;
            }

            // Always include step numbers
            if ('$step' in this.signals) {
                results['$step'] = this.signals['$step'].values.slice(0, resultSteps);
            }

            for (const signalName of this.saveSignals) {
                if (signalName in this.signals) {
                    results[signalName] = this.signals[signalName].values.slice(0, resultSteps);
                }
            }

            return results;
        }
    }

    return { Signal, Operation, MemoryBlock, ModuleResolver, VirtualMachine };
});
