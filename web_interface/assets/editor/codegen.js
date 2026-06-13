/**
 * Code generation and graph validation.
 *
 * Part of the NodeEditor split (see docs/ROADMAP.md, Phase 3). Methods are
 * defined in a plain class expression and copied onto NodeEditor.prototype
 * by applyEditorMixin() (defined in app.js). Load after app.js.
 */
applyEditorMixin(class {
    // Validation and Auto-compilation Methods
    validateGraph() {
        this.validationErrors = [];

        // Check for unconnected input ports
        this.nodes.forEach(nodeData => {
            if (nodeData.type === 'output' || nodeData.type === 'const' || nodeData.type === 'input') {
                return; // These don't need inputs
            }

            const nodeInputs = this.getNodeInputs(nodeData.type, nodeData);
            nodeInputs.forEach((inputName, inputIndex) => {
                const isConnected = this.connections.some(conn =>
                    conn.to.nodeId === nodeData.id && conn.to.portIndex === inputIndex
                );

                if (!isConnected) {
                    this.validationErrors.push({
                        type: 'unconnected_input',
                        nodeId: nodeData.id,
                        nodeType: nodeData.type,
                        inputIndex: inputIndex,
                        inputName: inputName,
                        message: `${nodeData.type} node "${nodeData.id}" has unconnected input "${inputName}"`
                    });
                }
            });
        });

        // Check for disconnected output nodes
        const outputNodes = Array.from(this.nodes.values()).filter(n => n.type === 'output');
        outputNodes.forEach(outputNode => {
            const isConnected = this.connections.some(conn =>
                conn.to.nodeId === outputNode.id
            );

            if (!isConnected) {
                this.validationErrors.push({
                    type: 'unconnected_output',
                    nodeId: outputNode.id,
                    nodeType: outputNode.type,
                    message: `Output node "${outputNode.id}" is not connected to any signal`
                });
            }
        });

        // Check for cycles (simplified detection)
        this.detectCycles();

        // Update visual indicators
        this.updateValidationVisuals();

        return this.validationErrors.length === 0;
    }

    detectCycles() {
        // Cycle detection that allows cycles with memory nodes (feedback loops)
        const visited = new Set();
        const recStack = new Set();
        const pathNodes = new Set();

        const dfs = (nodeId) => {
            if (recStack.has(nodeId)) {
                // Found a cycle - check if it contains a memory node
                const cycleHasMemory = this.cycleContainsMemoryNode(nodeId, pathNodes);

                if (!cycleHasMemory) {
                    this.validationErrors.push({
                        type: 'invalid_cycle',
                        nodeId: nodeId,
                        message: `Invalid cycle detected at "${nodeId}" - cycles must contain at least one memory (mem) node for feedback`
                    });
                }
                return true;
            }

            if (visited.has(nodeId)) {
                return false;
            }

            visited.add(nodeId);
            recStack.add(nodeId);
            pathNodes.add(nodeId);

            // Check all outgoing connections
            const outgoingConnections = this.connections.filter(conn => conn.from.nodeId === nodeId);
            for (const conn of outgoingConnections) {
                if (dfs(conn.to.nodeId)) {
                    // Don't continue propagating if we found a valid cycle with memory
                    const targetNode = this.nodes.get(conn.to.nodeId);
                    if (recStack.has(conn.to.nodeId) && this.cycleContainsMemoryNode(conn.to.nodeId, pathNodes)) {
                        // This is a valid feedback loop, stop here
                        pathNodes.delete(nodeId);
                        recStack.delete(nodeId);
                        return false;
                    }
                    return true;
                }
            }

            pathNodes.delete(nodeId);
            recStack.delete(nodeId);
            return false;
        };

        // Start DFS from all nodes
        this.nodes.forEach((nodeData, nodeId) => {
            if (!visited.has(nodeId)) {
                dfs(nodeId);
            }
        });
    }

    cycleContainsMemoryNode(startNodeId, pathNodes) {
        // Check if the current path contains any memory nodes
        for (const nodeId of pathNodes) {
            const nodeData = this.nodes.get(nodeId);
            if (nodeData && nodeData.type === 'mem') {
                return true;
            }
        }

        // Also check the start node of the cycle
        const startNode = this.nodes.get(startNodeId);
        return startNode && startNode.type === 'mem';
    }

    updateValidationVisuals() {
        // Clear previous error indicators
        document.querySelectorAll('.node').forEach(node => {
            node.classList.remove('validation-error', 'validation-warning');
        });

        // Add error indicators to problematic nodes
        this.validationErrors.forEach(error => {
            const nodeElement = document.querySelector(`[data-node-id="${error.nodeId}"]`);
            if (nodeElement) {
                if (error.type === 'invalid_cycle') {
                    nodeElement.classList.add('validation-error');
                } else {
                    nodeElement.classList.add('validation-warning');
                }
            }
        });
    }

    generateCodeFromGraph() {
        if (this.nodes.size === 0) {
            return '';
        }

        // Library nodes are backed by stdlib modules; pull them in by name
        // rather than re-emitting their bodies (see editor/library.js)
        const libraryImports = new Set();
        // Module-instance nodes from saved graphs carry their own definition,
        // which we re-emit inline; first instance of each name wins for overrides
        const moduleDefinitions = new Map();
        this.nodes.forEach((nodeData) => {
            if (nodeData.type !== 'module_instance') return;
            if (nodeData.isLibrary && nodeData.libraryName) {
                libraryImports.add(nodeData.libraryName);
            } else if (nodeData.moduleDefinition) {
                const moduleName = nodeData.moduleName || 'module';
                if (!moduleDefinitions.has(moduleName)) {
                    moduleDefinitions.set(moduleName, {
                        def: nodeData.moduleDefinition,
                        overrides: nodeData.parameters?.paramOverrides || {}
                    });
                }
            }
        });

        let code = '';

        // Imports for library modules come first
        Array.from(libraryImports).sort().forEach(name => {
            code += `import ${name}\n`;
        });
        if (libraryImports.size > 0) code += '\n';

        // Then inline definitions for graph-backed module instances
        moduleDefinitions.forEach(({ def, overrides }, moduleName) => {
            code += this.generateModuleDefinitionCode(def, moduleName, overrides);
            code += '\n\n';
        });

        code += 'module visual_graph {\n';
        const addedWires = new Set();
        // Multi-output module instances are instantiated once, then read
        // per-output; this tracks which have had their instantiation emitted.
        const instantiatedNodes = new Set();

        // Sort connections for consistent ordering
        const sortedConnections = [...this.connections].sort((a, b) => a.wireName.localeCompare(b.wireName));

        // Process each connection, generating wire = operation(...) syntax
        sortedConnections.forEach(conn => {
            const fromNode = this.nodes.get(conn.from.nodeId);
            const toNode = this.nodes.get(conn.to.nodeId);

            if (!fromNode || !toNode) return;

            // Skip if this wire was already defined
            if (addedWires.has(conn.wireName)) return;

            // Handle different source node types
            if (fromNode.type === 'input') {
                // Input nodes just pass through - wire name is same as input name
                addedWires.add(conn.wireName);
            } else if (fromNode.type === 'param') {
                // Param nodes output their parameter value
                const paramName = fromNode.parameters.name || 'param1';
                code += `    ${conn.wireName} = ${paramName}\n`;
                addedWires.add(conn.wireName);
            } else if (fromNode.type === 'const') {
                // Check for parameter binding
                const valueBinding = this.getParameterBinding(fromNode, 'value');
                if (valueBinding) {
                    code += `    ${conn.wireName} = const((value = ${valueBinding}))\n`;
                } else {
                    const value = fromNode.parameters.value || 1;
                    const numValue = isNaN(value) ? 1 : Number(value);
                    code += `    ${conn.wireName} = const(value=${numValue})\n`;
                }
                addedWires.add(conn.wireName);
            } else if (fromNode.type === 'mem') {
                // Find input wire to the mem node
                const memInputConn = this.connections.find(c => c.to.nodeId === fromNode.id);
                const inputWire = memInputConn ? memInputConn.wireName : '0';

                // Check for parameter binding on initialValue
                const initialValueBinding = this.getParameterBinding(fromNode, 'initialValue');
                if (initialValueBinding) {
                    code += `    ${conn.wireName} = mem((initial_value = ${initialValueBinding}), ${inputWire})\n`;
                } else {
                    const initialValue = fromNode.parameters.initialValue || 0;
                    const numInitialValue = isNaN(initialValue) ? 0 : Number(initialValue);
                    code += `    ${conn.wireName} = mem(${numInitialValue}, ${inputWire})\n`;
                }
                addedWires.add(conn.wireName);
            } else if (['add', 'sub', 'mul', 'div', 'gt', 'lt', 'eq', 'gte', 'lte'].includes(fromNode.type)) {
                // Find input wires to the operation node
                const nodeInputs = this.getNodeInputs(fromNode.type);
                const inputWires = [];

                nodeInputs.forEach((inputName, inputIndex) => {
                    const inputConn = this.connections.find(c =>
                        c.to.nodeId === fromNode.id && c.to.portIndex === inputIndex
                    );
                    inputWires[inputIndex] = inputConn ? inputConn.wireName : '0';
                });

                const params = inputWires.join(', ');
                code += `    ${conn.wireName} = ${fromNode.type}(${params})\n`;
                addedWires.add(conn.wireName);
            } else if (fromNode.type === 'module_instance' && fromNode.isLibrary) {
                // Library node: emit a named-argument call. The VM requires
                // named args for module instantiation, and only overridden
                // params are passed (others use the module's own defaults).
                const nodeInputs = this.getNodeInputs(fromNode.type, fromNode);
                const args = [];

                nodeInputs.forEach((inputName, inputIndex) => {
                    const inputConn = this.connections.find(c =>
                        c.to.nodeId === fromNode.id && c.to.portIndex === inputIndex
                    );
                    if (inputConn) {
                        args.push(`${inputName}=${inputConn.wireName}`);
                    }
                });

                const overrides = fromNode.parameters?.paramOverrides || {};
                Object.keys(overrides).forEach(pName => {
                    args.push(`${pName}=${overrides[pName]}`);
                });

                code += `    ${conn.wireName} = ${fromNode.libraryName}(${args.join(', ')})\n`;
                addedWires.add(conn.wireName);
            } else if (fromNode.type === 'module_instance') {
                // Find input wires to the module instance. Module calls require
                // named arguments (the VM binds params by name), so emit
                // inputName=wire for each connected input.
                const nodeInputs = this.getNodeInputs(fromNode.type, fromNode);
                const args = [];

                nodeInputs.forEach((inputName, inputIndex) => {
                    const inputConn = this.connections.find(c =>
                        c.to.nodeId === fromNode.id && c.to.portIndex === inputIndex
                    );
                    if (inputConn) {
                        args.push(`${inputName}=${inputConn.wireName}`);
                    }
                });

                const moduleName = fromNode.moduleName || 'module';
                const declNames = this.getModuleInstanceOutputDeclNames(fromNode);

                if (declNames.length > 1) {
                    // Multi-output: instantiate once, then copy each used output
                    // out of the instance via dot access. A single-token copy
                    // target keeps the wire usable as an `output`/operand.
                    const counter = fromNode.id.split('_').pop();
                    const instVar = `${moduleName}_${counter}_inst`;
                    if (!instantiatedNodes.has(fromNode.id)) {
                        code += `    ${instVar} = ${moduleName}(${args.join(', ')})\n`;
                        instantiatedNodes.add(fromNode.id);
                    }
                    const declName = declNames[conn.from.portIndex];
                    if (declName) {
                        code += `    ${conn.wireName} = ${instVar}.${declName}\n`;
                    }
                } else {
                    // Single output: the VM copies it to the assignment target
                    code += `    ${conn.wireName} = ${moduleName}(${args.join(', ')})\n`;
                }
                addedWires.add(conn.wireName);
            }
        });

        // Handle output statements
        const outputNodes = Array.from(this.nodes.values()).filter(n => n.type === 'output');
        outputNodes.forEach(outputNode => {
            const connection = this.connections.find(conn => conn.to.nodeId === outputNode.id);
            if (connection) {
                code += `    output ${connection.wireName}\n`;
            }
        });

        code += '}\n\n';
        code += 'execution {\n';

        // Get max_steps value from the UI input
        const maxStepsInput = document.getElementById('max-steps-input');
        const maxSteps = maxStepsInput ? parseInt(maxStepsInput.value) || 10 : 10;
        code += `    max_steps: ${maxSteps}\n`;

        // Add save variables for outputs (use wire names)
        const outputWires = [];
        this.connections.forEach(conn => {
            const toNode = this.nodes.get(conn.to.nodeId);
            if (toNode && toNode.type === 'output') {
                outputWires.push(conn.wireName);
            }
        });

        if (outputWires.length > 0) {
            code += `    save: [${outputWires.join(', ')}]\n`;
        }

        code += '}';

        return code;
    }

    /**
     * Output declaration names for a module-instance node, indexed by output
     * port. For a saved-graph module these are the internal wires feeding each
     * output node (the names emitted as `output <wire>` in the module body),
     * which is what a multi-output instance reads via `instance.<name>`.
     * Returns nulls for ports with no incoming wire so indices stay aligned.
     */
    getModuleInstanceOutputDeclNames(nodeData) {
        if (nodeData.isLibrary) {
            return nodeData.outputs || []; // library modules are single-output
        }
        const def = nodeData.moduleDefinition;
        if (!def) return nodeData.outputs || [];
        return def.nodes
            .filter(n => n.type === 'output')
            .map(outNode => {
                const conn = def.connections.find(c => c.to.nodeId === outNode.id);
                return conn ? conn.wireName : null;
            });
    }

    getParameterBinding(nodeData, paramKey) {
        // Check if this parameter is bound to a param node
        if (!nodeData.parameterBindings || !nodeData.parameterBindings[paramKey]) {
            return null;
        }

        const paramNodeId = nodeData.parameterBindings[paramKey];
        const paramNode = this.nodes.get(paramNodeId);

        if (!paramNode || paramNode.type !== 'param') {
            return null;
        }

        // Return the parameter name
        return paramNode.parameters.name || 'param1';
    }
    scheduleAutoCompile() {
        // Persist the open library project on any graph change. Independent of
        // the auto-compile toggle, so it runs before that early return.
        this.scheduleLibraryAutosave();

        if (!this.autoCompileEnabled) return;

        // Clear existing timeout
        if (this.compileTimeout) {
            clearTimeout(this.compileTimeout);
        }

        // Schedule validation and compilation
        this.compileTimeout = setTimeout(() => {
            this.performAutoValidationAndCompilation();
        }, 500); // 500ms delay to avoid excessive compilation
    }

    async performAutoValidationAndCompilation() {
        // Validate the graph
        const isValid = this.validateGraph();

        // Update validation display
        this.displayValidationResults();

        // Generate code from the visual graph
        const generatedCode = this.generateCodeFromGraph();

        // Update the code editor with generated code
        const codeEditor = document.getElementById('code-editor');
        if (codeEditor && generatedCode.trim()) {
            codeEditor.value = generatedCode;
            console.log('Generated code:', generatedCode); // Debug logging
        }

        // Auto-compile if valid
        if (isValid && generatedCode.trim()) {
            try {
                await this.compileCode();
            } catch (error) {
                console.warn('Auto-compilation failed:', error);
                // Show compilation error in output
                this.addOutput(`Auto-compilation failed: ${error.message || error}\n`);
            }
        }
    }

    displayValidationResults() {
        // Remove existing validation panel
        let validationPanel = document.getElementById('validation-panel');
        if (validationPanel) {
            validationPanel.remove();
        }

        if (this.validationErrors.length === 0) {
            return; // No errors to display
        }

        // Create validation panel
        validationPanel = document.createElement('div');
        validationPanel.id = 'validation-panel';
        validationPanel.className = 'validation-panel';

        let html = '<div class="validation-header">Validation Issues</div>';
        html += '<div class="validation-content">';

        this.validationErrors.forEach(error => {
            const className = error.type === 'invalid_cycle' ? 'error' : 'warning';
            html += `<div class="validation-item ${className}">
                <span class="validation-icon">${error.type === 'invalid_cycle' ? '❌' : '⚠️'}</span>
                <span class="validation-message">${error.message}</span>
            </div>`;
        });

        html += '</div>';
        validationPanel.innerHTML = html;

        // Add to the visual editor
        document.getElementById('visual-tab').appendChild(validationPanel);

        // Auto-hide after 5 seconds
        setTimeout(() => {
            if (validationPanel && validationPanel.parentNode) {
                validationPanel.remove();
            }
        }, 5000);
    }

    performManualValidation() {
        // Force immediate validation regardless of auto-compile setting
        const isValid = this.validateGraph();
        this.displayValidationResults();

        // Generate and update code
        const generatedCode = this.generateCodeFromGraph();
        const codeEditor = document.getElementById('code-editor');
        if (codeEditor && generatedCode.trim()) {
            codeEditor.value = generatedCode;
        }

        // Show status in output tab
        if (isValid) {
            this.addOutput('✓ Graph validation passed - no issues found\n');
        } else {
            this.addOutput(`⚠ Graph validation found ${this.validationErrors.length} issue(s)\n`);
        }
    }
    generateModuleDefinitionCode(graphData, moduleName, paramOverrides = {}) {
        let code = `module ${moduleName} {\n`;
        const addedWires = new Set();

        const inputNodes = graphData.nodes.filter(n => n.type === 'input');
        const outputNodes = graphData.nodes.filter(n => n.type === 'output');
        const paramNodes = graphData.nodes.filter(n => n.type === 'param');

        // Param declarations, with any per-instance overrides applied
        paramNodes.forEach((paramNode) => {
            const paramName = paramNode.parameters?.name || 'param1';
            const defaultValue = paramNode.parameters?.defaultValue ?? 0;
            const effectiveValue = paramOverrides[paramName] !== undefined
                ? paramOverrides[paramName]
                : defaultValue;
            const alias = paramNode.parameters?.alias || '';
            if (alias) {
                code += `    param ${paramName} = ${effectiveValue}  // alias for ${alias}\n`;
            } else {
                code += `    param ${paramName} = ${effectiveValue}\n`;
            }
        });

        // Input declarations using the port name from the input node
        inputNodes.forEach((inputNode, idx) => {
            const portName = (inputNode.parameters?.name || '').trim() || `in_${idx}`;
            code += `    input ${portName}\n`;
        });

        // Sort connections for consistent ordering
        const sortedConnections = [...graphData.connections].sort((a, b) =>
            a.wireName.localeCompare(b.wireName)
        );

        // Generate signal assignments (similar to main graph generation)
        sortedConnections.forEach(conn => {
            const fromNode = graphData.nodes.find(n => n.id === conn.from.nodeId);
            const toNode = graphData.nodes.find(n => n.id === conn.to.nodeId);

            if (!fromNode || !toNode) return;
            if (addedWires.has(conn.wireName)) return;

            // Skip input and param nodes - they're already declared
            if (fromNode.type === 'input') {
                addedWires.add(conn.wireName);
                return;
            }

            if (fromNode.type === 'param') {
                // Param nodes just provide their name as the wire value
                addedWires.add(conn.wireName);
                return;
            }

            // Handle different node types
            if (fromNode.type === 'const') {
                const value = fromNode.parameters?.value || 1;
                const numValue = isNaN(value) ? 1 : Number(value);
                code += `    ${conn.wireName} = const(value=${numValue})\n`;
                addedWires.add(conn.wireName);
            } else if (fromNode.type === 'mem') {
                const memInputConn = graphData.connections.find(c => c.to.nodeId === fromNode.id);
                const inputWire = memInputConn ? memInputConn.wireName : '0';
                const initialValue = fromNode.parameters?.initialValue || 0;
                const numInitialValue = isNaN(initialValue) ? 0 : Number(initialValue);
                code += `    ${conn.wireName} = mem(${numInitialValue}, ${inputWire})\n`;
                addedWires.add(conn.wireName);
            } else if (['add', 'sub', 'mul', 'div', 'gt', 'lt', 'eq', 'gte', 'lte'].includes(fromNode.type)) {
                const inputWires = [];
                const numInputs = fromNode.type === 'mem' ? 1 : 2;

                for (let i = 0; i < numInputs; i++) {
                    const inputConn = graphData.connections.find(c =>
                        c.to.nodeId === fromNode.id && c.to.portIndex === i
                    );
                    inputWires[i] = inputConn ? inputConn.wireName : '0';
                }

                const params = inputWires.join(', ');
                code += `    ${conn.wireName} = ${fromNode.type}(${params})\n`;
                addedWires.add(conn.wireName);
            }
        });

        // Output declarations. The language's `output` takes a single signal
        // name (the internal wire feeding the output node) — there is no
        // `output name wire` form. The output node's own port name only labels
        // the instance's port; it does not appear here.
        outputNodes.forEach((outputNode) => {
            const connection = graphData.connections.find(c => c.to.nodeId === outputNode.id);
            if (connection) {
                code += `    output ${connection.wireName}\n`;
            }
        });

        code += '}';

        return code;
    }
});
