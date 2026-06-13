/**
 * NodeEditor core: construction, toolbar/tab wiring, selection state,
 * parameter panel, execution control, and text output.
 *
 * The rest of the editor lives in mixin modules loaded after this file
 * (assets/editor/*.js); each calls applyEditorMixin() to add its methods
 * to NodeEditor.prototype. The split is file-level modularization only --
 * everything still runs on one class instance with no build step.
 */
class NodeEditor {
    constructor() {
        this.nodes = new Map();
        this.connections = [];
        this.nextNodeId = 1;
        this.selectedNode = null;
        this.selectedNodeForHighlight = null; // For visual selection (different from drag selection)
        this.selectedConnection = null;
        this.dragOffset = { x: 0, y: 0 };
        this.isDragging = false;
        this.isConnecting = false;
        this.connectionStart = null;
        this.tempConnection = null;
        this.currentStep = 0;
        this.isRunning = false;
        this.executionInterval = null;

        // Zoom and pan state
        this.zoom = 1;
        this.panX = 0;
        this.panY = 0;
        this.isPanning = false;
        this.lastPanPosition = { x: 0, y: 0 };
        this.initialPinchDistance = 0;
        this.initialZoom = 1;

        // Space-drag panning (desktop)
        this.spaceDown = false;
        this.mousePanning = false;

        // Node context menu state
        this.longPressTimer = null;
        this.longPressNode = null;

        // Floating action bar shown above the selected node
        this.nodeActionsEl = null;

        // The canvas area of the visual tab (the palette sidebar sits beside it)
        this.canvasEl = document.getElementById('editor-canvas');

        // Plot panel (Plots tab) — one chart per plot node in the graph
        this.plotPanel = new PlotPanel(document.getElementById('plots-container'));

        // Undo/redo (snapshots of the serialized graph; see editor/history.js)
        this.history = new UndoHistory({
            capture: () => this.captureState(),
            restore: (state) => this.restoreState(state),
            onChange: () => this.updateUndoRedoButtons()
        });

        this.setupEventListeners();
        this.setupPalette();
        this.createSampleNodes();

        // API integration
        this.apiClient = window.apiClient;

        // Validation and auto-compilation
        this.validationErrors = [];
        this.autoCompileEnabled = true;
        this.compileTimeout = null;

        // Variable table tracking
        this.variableTableInitialized = false;
    }
    setupEventListeners() {
        // Tab switching
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
        });

        // Node editor events
        const nodeEditor = this.canvasEl;
        nodeEditor.addEventListener('mousedown', (e) => this.onMouseDown(e));
        nodeEditor.addEventListener('mousemove', (e) => this.onMouseMove(e));
        nodeEditor.addEventListener('mouseup', (e) => this.onMouseUp(e));
        nodeEditor.addEventListener('contextmenu', (e) => e.preventDefault()); // Prevent browser context menu
        nodeEditor.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });

        // Touch events for mobile support
        nodeEditor.addEventListener('touchstart', (e) => this.onTouchStart(e), { passive: false });
        nodeEditor.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: false });
        nodeEditor.addEventListener('touchend', (e) => this.onTouchEnd(e), { passive: false });

        // Toolbar controls
        document.getElementById('undo-btn').addEventListener('click', () => this.undo());
        document.getElementById('redo-btn').addEventListener('click', () => this.redo());
        document.getElementById('params-node-btn').addEventListener('click', () => this.showParameterPanel());
        document.getElementById('flip-node-btn').addEventListener('click', () => this.flipSelectedNode());
        document.getElementById('delete-btn').addEventListener('click', () => this.deleteSelected());
        document.getElementById('new-graph-btn').addEventListener('click', () => this.newGraph());
        document.getElementById('save-graph-btn').addEventListener('click', () => this.saveGraph());
        document.getElementById('load-graph-btn').addEventListener('click', () => this.loadGraph());
        document.getElementById('insert-module-btn').addEventListener('click', () => this.insertModule());
        document.getElementById('file-input').addEventListener('change', (e) => this.handleFileSelect(e));

        // Parameter panel controls
        document.getElementById('close-params-btn').addEventListener('click', () => this.hideParameterPanel());
        document.getElementById('save-params-btn').addEventListener('click', () => this.saveParameters());
        document.getElementById('cancel-params-btn').addEventListener('click', () => this.hideParameterPanel());

        // Auto-compilation controls
        document.getElementById('auto-compile-checkbox').addEventListener('change', (e) => {
            this.autoCompileEnabled = e.target.checked;
            if (this.autoCompileEnabled) {
                this.scheduleAutoCompile();
            }
        });
        document.getElementById('validate-btn').addEventListener('click', () => this.performManualValidation());

        // Max steps control
        document.getElementById('max-steps-input').addEventListener('input', () => {
            this.scheduleAutoCompile();
        });

        // Execution controls
        document.getElementById('compile-btn').addEventListener('click', () => this.compileCode());
        document.getElementById('run-btn').addEventListener('click', () => this.toggleRun());
        document.getElementById('step-btn').addEventListener('click', () => this.executeStep());
        document.getElementById('reset-btn').addEventListener('click', () => this.reset());
        document.getElementById('clear-output-btn').addEventListener('click', () => this.clearOutput());
        document.getElementById('copy-output-btn').addEventListener('click', () => this.copyOutput());

        // Toolbar execution controls (same functionality as output tab)
        document.getElementById('toolbar-run-btn').addEventListener('click', () => this.toggleRun());
        document.getElementById('toolbar-step-btn').addEventListener('click', () => this.executeStep());
        document.getElementById('toolbar-reset-btn').addEventListener('click', () => this.reset());

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.onKeyDown(e));
        document.addEventListener('keyup', (e) => this.onKeyUp(e));
    }
    switchTab(tabName) {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

        document.getElementById('visual-tab').classList.toggle('hidden', tabName !== 'visual');
        document.getElementById('code-tab').classList.toggle('hidden', tabName !== 'code');
        document.getElementById('plots-tab').classList.toggle('hidden', tabName !== 'plots');
        document.getElementById('output-tab').classList.toggle('hidden', tabName !== 'output');

        // Canvases have zero size while the tab is hidden, so redraw on show
        if (tabName === 'plots') {
            this.plotPanel.renderAll();
        }

        // Clear output tab indicator when user views output
        if (tabName === 'output') {
            const outputTab = document.querySelector('[data-tab="output"]');
            outputTab.style.fontWeight = '';
            outputTab.style.color = '';
        }
    }

    selectNode(nodeElement) {
        // Clear previous selection
        if (this.selectedNodeForHighlight) {
            this.selectedNodeForHighlight.classList.remove('selected');
        }

        // Select new node
        this.selectedNodeForHighlight = nodeElement;
        if (nodeElement) {
            nodeElement.classList.add('selected');
        }
        this.showNodeActions(nodeElement);
        this.updateToolbarButtonStates();
    }

    /** Attach the floating action bar (params/flip/duplicate/delete) to the
     *  selected node. The bar travels with the node since it's a child. */
    showNodeActions(nodeElement) {
        this.hideNodeActions();
        if (!nodeElement) return;

        const nodeData = this.nodes.get(nodeElement.dataset.nodeId);

        const bar = document.createElement('div');
        bar.className = 'node-actions';

        const actions = [];
        if (nodeData && this.nodeHasParameters(nodeData.type)) {
            actions.push({ icon: '⚙', title: 'Edit parameters', handler: () => this.showParameterPanel() });
        }
        actions.push({ icon: '⇄', title: 'Flip horizontally', handler: () => this.flipSelectedNode() });
        actions.push({ icon: '⧉', title: 'Duplicate', handler: () => this.duplicateSelectedNode() });
        actions.push({ icon: '🗑', title: 'Delete (Del)', handler: () => this.deleteSelectedNode(), danger: true });

        actions.forEach(({ icon, title, handler, danger }) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = icon;
            btn.title = title;
            if (danger) btn.classList.add('danger');
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                handler();
            });
            bar.appendChild(btn);
        });

        // Don't let presses on the bar start a node drag or canvas pan
        // (and on touch, skipping the canvas handler lets the click fire)
        bar.addEventListener('mousedown', (e) => e.stopPropagation());
        bar.addEventListener('touchstart', (e) => e.stopPropagation());

        nodeElement.appendChild(bar);
        this.nodeActionsEl = bar;
    }

    hideNodeActions() {
        if (this.nodeActionsEl) {
            this.nodeActionsEl.remove();
            this.nodeActionsEl = null;
        }
    }

    clearSelection() {
        if (this.selectedNodeForHighlight) {
            this.selectedNodeForHighlight.classList.remove('selected');
            this.selectedNodeForHighlight = null;
        }
        this.hideNodeActions();

        // Clear connection selection
        if (this.selectedConnection) {
            this.selectedConnection.pathElement.classList.remove('selected');
            if (this.selectedConnection.touchArea) {
                this.selectedConnection.touchArea.classList.remove('selected');
            }
            this.selectedConnection = null;
        }

        this.updateToolbarButtonStates();
    }
    showParameterPanel() {
        if (!this.selectedNodeForHighlight) return;

        const nodeId = this.selectedNodeForHighlight.dataset.nodeId;
        const nodeData = this.nodes.get(nodeId);

        if (!nodeData || !this.nodeHasParameters(nodeData.type)) return;

        // Update panel title
        document.getElementById('parameter-title').textContent = `${nodeData.type.toUpperCase()} Parameters`;

        // Generate parameter form based on node type
        const content = this.generateParameterForm(nodeData);
        document.getElementById('parameter-content').innerHTML = content;

        // Show the panel
        document.getElementById('parameter-panel').classList.remove('hidden');
    }

    hideParameterPanel() {
        document.getElementById('parameter-panel').classList.add('hidden');
    }

    generateParameterForm(nodeData) {
        let html = '';

        switch (nodeData.type) {
            case 'mem':
                html = `
                    <div class="parameter-field">
                        <label for="initial-value">Initial Value:</label>
                        <input type="number" id="initial-value" value="${nodeData.parameters.initialValue}" step="any">
                    </div>
                `;
                break;

            case 'const':
                html = `
                    <div class="parameter-field">
                        <label for="const-value">Constant Value:</label>
                        <input type="number" id="const-value" value="${nodeData.parameters.value}" step="any">
                    </div>
                `;
                break;

            case 'plot':
                html = `
                    <div class="parameter-field">
                        <label for="signal-x">X Signal (default: step):</label>
                        <input type="text" id="signal-x" value="${nodeData.parameters.signalX}" placeholder="step">
                    </div>
                    <div class="parameter-field">
                        <label for="signal-y">Y Signals (comma-separated):</label>
                        <input type="text" id="signal-y" value="${nodeData.parameters.signalY}" placeholder="signal_a, signal_b">
                    </div>
                    <div class="parameter-field">
                        <label for="history-size">History Size (points kept):</label>
                        <input type="number" id="history-size" value="${nodeData.parameters.historySize}" min="10" max="100000" step="10">
                    </div>
                `;
                break;

            case 'param':
                html = `
                    <div class="parameter-field">
                        <label for="param-name">Parameter Name:</label>
                        <input type="text" id="param-name" value="${nodeData.parameters.name}" placeholder="param1">
                    </div>
                    <div class="parameter-field">
                        <label for="param-default">Default Value:</label>
                        <input type="number" id="param-default" value="${nodeData.parameters.defaultValue}" step="any">
                    </div>
                    <div class="parameter-field">
                        <label for="param-alias">Alias (points to internal param):</label>
                        <input type="text" id="param-alias" value="${nodeData.parameters.alias}" placeholder="internal_param">
                    </div>
                `;
                break;

            case 'input':
            case 'output':
                html = `
                    <div class="parameter-field">
                        <label for="io-name">Port Name:</label>
                        <input type="text" id="io-name" value="${nodeData.parameters.name || ''}" placeholder="e.g. signal_in">
                        <div class="parameter-hint">Shown as the port label on module instances that include this graph.</div>
                    </div>
                `;
                break;

            case 'module_instance': {
                // Derive specs from stored paramSpecs, or fall back to scanning moduleDefinition
                let specs = nodeData.parameters.paramSpecs;
                if ((!specs || specs.length === 0) && nodeData.moduleDefinition) {
                    specs = nodeData.moduleDefinition.nodes
                        .filter(n => n.type === 'param')
                        .map(n => ({ name: n.parameters?.name || 'param', defaultValue: n.parameters?.defaultValue ?? 0 }));
                }
                specs = specs || [];
                if (specs.length === 0) {
                    html = '<p class="no-params-msg">This module has no parameters.</p>';
                } else {
                    const overrides = nodeData.parameters.paramOverrides || {};
                    html = specs.map(spec => {
                        const val = overrides[spec.name] !== undefined ? overrides[spec.name] : spec.defaultValue;
                        return `
                            <div class="parameter-field">
                                <label for="mparam-${spec.name}">${spec.name}:</label>
                                <input type="number" id="mparam-${spec.name}"
                                       data-param-name="${spec.name}"
                                       value="${val}" step="any"
                                       placeholder="${spec.defaultValue}">
                                <span class="parameter-hint">default: ${spec.defaultValue}</span>
                            </div>
                        `;
                    }).join('');
                }
                break;
            }

            default:
                html = '<p>No parameters available for this node type.</p>';
        }

        return html;
    }

    saveParameters() {
        if (!this.selectedNodeForHighlight) return;

        const nodeId = this.selectedNodeForHighlight.dataset.nodeId;
        const nodeData = this.nodes.get(nodeId);

        if (!nodeData) return;

        this.checkpoint();

        // Save parameters based on node type
        switch (nodeData.type) {
            case 'mem':
                const initialValue = document.getElementById('initial-value').value;
                nodeData.parameters.initialValue = parseFloat(initialValue) || 0;
                break;

            case 'const':
                const constValue = document.getElementById('const-value').value;
                nodeData.parameters.value = parseFloat(constValue) || 0;
                break;

            case 'plot':
                const signalX = document.getElementById('signal-x').value;
                const signalY = document.getElementById('signal-y').value;
                const historySize = document.getElementById('history-size').value;
                nodeData.parameters.signalX = signalX || 'step';
                nodeData.parameters.signalY = signalY || '';
                nodeData.parameters.historySize = parseInt(historySize) || 1000;
                this.syncPlotPanel();
                break;

            case 'param':
                const paramName = document.getElementById('param-name').value;
                const paramDefault = document.getElementById('param-default').value;
                const paramAlias = document.getElementById('param-alias').value;
                nodeData.parameters.name = paramName || 'param1';
                nodeData.parameters.defaultValue = parseFloat(paramDefault) || 0;
                nodeData.parameters.alias = paramAlias || '';
                break;

            case 'input':
            case 'output': {
                const ioPortName = document.getElementById('io-name').value.trim();
                nodeData.parameters.name = ioPortName.replace(/[^a-zA-Z0-9_]/g, '_');
                break;
            }

            case 'module_instance': {
                let specs = nodeData.parameters.paramSpecs;
                if ((!specs || specs.length === 0) && nodeData.moduleDefinition) {
                    specs = nodeData.moduleDefinition.nodes
                        .filter(n => n.type === 'param')
                        .map(n => ({ name: n.parameters?.name || 'param', defaultValue: n.parameters?.defaultValue ?? 0 }));
                }
                const newOverrides = {};
                (specs || []).forEach(spec => {
                    const input = document.getElementById(`mparam-${spec.name}`);
                    if (input) {
                        const v = parseFloat(input.value);
                        if (!isNaN(v)) newOverrides[spec.name] = v;
                    }
                });
                nodeData.parameters.paramOverrides = newOverrides;
                break;
            }
        }

        // Update the parameter display on the node
        this.updateNodeParameterDisplay(nodeId);

        this.hideParameterPanel();

        // Trigger validation and auto-compilation after parameter change
        this.scheduleAutoCompile();
    }
    createSampleNodes() {
        // Create a sample counter circuit
        const constId = this.createNode('const', { x: 50, y: 100 });
        const addId = this.createNode('add', { x: 200, y: 150 });
        const memId = this.createNode('mem', { x: 400, y: 150 });
        const outputId = this.createNode('output', { x: 600, y: 150 });

        // Wait for nodes to be created, then connect them
        setTimeout(() => {
            // Connect const to add
            this.createConnection(
                { nodeId: constId, portType: 'output', portIndex: 0, element: this.nodes.get(constId).element.querySelector('.port.output') },
                { nodeId: addId, portType: 'input', portIndex: 0, element: this.nodes.get(addId).element.querySelector('.port.input') }
            );

            // Connect add to mem
            this.createConnection(
                { nodeId: addId, portType: 'output', portIndex: 0, element: this.nodes.get(addId).element.querySelector('.port.output') },
                { nodeId: memId, portType: 'input', portIndex: 0, element: this.nodes.get(memId).element.querySelector('.port.input') }
            );

            // Connect mem back to add (feedback)
            this.createConnection(
                { nodeId: memId, portType: 'output', portIndex: 0, element: this.nodes.get(memId).element.querySelector('.port.output') },
                { nodeId: addId, portType: 'input', portIndex: 1, element: this.nodes.get(addId).element.querySelectorAll('.port.input')[1] }
            );

            // Connect mem to output
            this.createConnection(
                { nodeId: memId, portType: 'output', portIndex: 0, element: this.nodes.get(memId).element.querySelector('.port.output') },
                { nodeId: outputId, portType: 'input', portIndex: 0, element: this.nodes.get(outputId).element.querySelector('.port.input') }
            );

            // The sample graph is the baseline, not an undoable action
            this.history.reset();
        }, 100);
    }
    async compileCode() {
        const codeEditor = document.getElementById('code-editor');
        const code = codeEditor.value;

        // Reset variable table flag for new compilation
        this.variableTableInitialized = false;

        this.addOutput('Compiling code...\n');

        try {
            const result = await this.apiClient.compileCode(code);

            if (result.success) {
                this.addOutput(`✓ ${result.message}\n`);

                // Reset step counter on successful compilation (server resets it to 0)
                this.currentStep = 0;
                document.getElementById('step-counter').textContent = 'Step: 0';
                document.getElementById('toolbar-step-counter').textContent = 'Step: 0';

                if (result.max_steps) {
                    this.maxSteps = result.max_steps;
                    // Update the UI input to reflect the compiled max_steps value
                    const maxStepsInput = document.getElementById('max-steps-input');
                    if (maxStepsInput && parseInt(maxStepsInput.value) !== result.max_steps) {
                        maxStepsInput.value = result.max_steps;
                    }
                }
            } else {
                this.addOutput(`✗ ${result.message}\n`);
            }
        } catch (error) {
            this.addOutput(`✗ Compilation failed: ${error.message}\n`);
        }
    }

    async toggleRun() {
        if (this.isRunning) {
            this.stopExecution();
        } else {
            await this.startExecution();
        }
    }

    async startExecution() {
        try {
            const result = await this.apiClient.runProgram();

            if (result.success) {
                this.isRunning = true;
                document.getElementById('run-btn').textContent = 'Stop';
                document.getElementById('toolbar-run-btn').textContent = 'Stop';
                this.addOutput('Starting execution...\n');

                // Get current max_steps value from the UI
                const maxStepsInput = document.getElementById('max-steps-input');
                const currentMaxSteps = maxStepsInput ? parseInt(maxStepsInput.value) || 10 : 10;

                // Execute steps as fast as possible, but yield to the
                // browser regularly so plots and outputs update live
                let lastYield = performance.now();
                while (this.isRunning && this.currentStep < currentMaxSteps) {
                    await this.executeStep();
                    if (performance.now() - lastYield > 12) {
                        await new Promise(resolve => setTimeout(resolve, 0));
                        lastYield = performance.now();
                    }
                }

                // Stop when done
                if (this.isRunning) {
                    this.stopExecution();
                    this.addOutput('Execution completed.\n');
                }
            } else {
                this.addOutput(`✗ ${result.message}\n`);
            }
        } catch (error) {
            this.addOutput(`✗ Failed to start execution: ${error.message}\n`);
        }
    }

    stopExecution() {
        this.isRunning = false;
        document.getElementById('run-btn').textContent = 'Run';
        document.getElementById('toolbar-run-btn').textContent = 'Run';
        if (this.executionInterval) {
            clearInterval(this.executionInterval);
            this.executionInterval = null;
        }
        this.addOutput('Execution stopped.\n');
    }

    async executeStep() {
        try {
            const result = await this.apiClient.executeStep();

            if (result.success) {
                this.currentStep = result.step || (this.currentStep + 1);
                document.getElementById('step-counter').textContent = `Step: ${this.currentStep}`;
                document.getElementById('toolbar-step-counter').textContent = `Step: ${this.currentStep}`;

                // Update connection values with real data from server
                if (result.signals) {
                    this.updateConnectionValues(result.signals);
                    // Show variable values in columnar format
                    this.addVariableOutput(this.currentStep, result.signals);
                } else {
                    this.addOutput(`Step ${this.currentStep} executed\n`);
                }
            } else {
                this.addOutput(`✗ ${result.message}\n`);
                if (this.isRunning) {
                    this.stopExecution();
                }
            }
        } catch (error) {
            this.addOutput(`✗ Step execution failed: ${error.message}\n`);
            if (this.isRunning) {
                this.stopExecution();
            }
        }
    }

    updateConnectionValues(signals) {
        const obstacles = this.getObstacleRects();
        this.connections.forEach((conn, index) => {
            // Look up the signal value using the wire name
            let value = signals[conn.wireName];

            if (value === undefined) {
                // Fallback: try to match by node types (old method)
                const fromNodeType = this.nodes.get(conn.from.nodeId)?.type;
                const signalKey = `${fromNodeType}_${conn.from.nodeId.split('_')[1]}_out`;
                value = signals[signalKey];
            }

            if (value === undefined) {
                // Last resort fallback
                const signalKeys = Object.keys(signals);
                value = signalKeys[index % signalKeys.length] ? signals[signalKeys[index % signalKeys.length]] : Math.random() * 10;
            }

            conn.value = value;
            // Text is updated in updateConnection() which will be called after this
            this.updateConnection(conn, obstacles);
            conn.element.classList.add('active');
        });

        // Update plot nodes
        this.updatePlots(signals);

        // Remove active class after a short delay
        setTimeout(() => {
            this.connections.forEach(conn => {
                conn.element.classList.remove('active');
            });
        }, 200);
    }

    async reset() {
        this.stopExecution();

        // Reset step counter immediately
        this.currentStep = 0;
        document.getElementById('step-counter').textContent = 'Step: 0';
        document.getElementById('toolbar-step-counter').textContent = 'Step: 0';

        try {
            const result = await this.apiClient.resetProgram();

            document.getElementById('output').textContent = 'Ready to execute...\n';

            // Reset variable table flag
            this.variableTableInitialized = false;

            // Clear connection values
            this.connections.forEach(conn => {
                conn.value = null;
                conn.textElement.textContent = '';
                conn.element.classList.remove('active');
            });

            // Clear plot data
            this.plotPanel.clearData();

            if (result.success) {
                this.addOutput(`✓ ${result.message}\n`);
            } else {
                this.addOutput(`⚠ Reset completed locally\n`);
            }
        } catch (error) {
            this.addOutput(`⚠ Reset completed locally\n`);
        }
    }

    addOutput(text) {
        const output = document.getElementById('output');
        output.textContent += text;
        output.scrollTop = output.scrollHeight;

        // Add visual indicator to output tab if it's not currently active
        const currentTab = document.querySelector('.tab.active')?.dataset.tab;
        const outputTab = document.querySelector('[data-tab="output"]');

        if (currentTab !== 'output') {
            // Add a subtle indicator that there's new output
            outputTab.style.fontWeight = 'bold';
            outputTab.style.color = '#2196F3';
        }

        // Auto-switch to output tab when starting execution, unless the
        // user is watching the plots
        if (this.isRunning && text.includes('Starting execution') && currentTab !== 'plots') {
            this.switchTab('output');
        }
    }

    addVariableOutput(step, signals) {
        // Initialize column headers if this is the first step (step 0 or 1)
        if (step <= 1 && !this.variableTableInitialized) {
            this.initializeVariableTable(signals);
            this.variableTableInitialized = true;
        }

        // Format variable values in columns (filter out internal variables)
        const variableNames = Object.keys(signals)
            .filter(name => !name.startsWith('_temp_') && !name.startsWith('$'))
            .sort();
        let line = `${step.toString().padStart(4)} |`;

        variableNames.forEach(varName => {
            const value = signals[varName];
            const formattedValue = this.formatValue(value);
            line += ` ${formattedValue.padStart(8)} |`;
        });

        this.addOutput(line + '\n');
    }

    initializeVariableTable(signals) {
        const variableNames = Object.keys(signals)
            .filter(name => !name.startsWith('_temp_') && !name.startsWith('$'))
            .sort();

        // Add header
        this.addOutput('\n=== Variable Values ===\n');

        // Add column headers
        let headerLine = 'Step |';
        variableNames.forEach(varName => {
            const shortName = this.shortenVariableName(varName);
            headerLine += ` ${shortName.padStart(8)} |`;
        });
        this.addOutput(headerLine + '\n');

        // Add separator line
        let separatorLine = '-----+';
        variableNames.forEach(() => {
            separatorLine += '---------+';
        });
        this.addOutput(separatorLine + '\n');
    }

    shortenVariableName(varName) {
        // Shorten variable names to fit in 8 characters
        if (varName.length <= 8) return varName;

        // Try to keep meaningful parts
        if (varName.includes('_')) {
            const parts = varName.split('_');
            if (parts.length >= 2) {
                return parts[0].substr(0, 4) + '_' + parts[1].substr(0, 2);
            }
        }

        return varName.substr(0, 8);
    }

    formatValue(value) {
        if (value === null || value === undefined) return 'null';
        if (typeof value === 'number') {
            // Format numbers to 2 decimal places, or as integer if whole number
            if (Number.isInteger(value)) {
                return value.toString();
            } else {
                return value.toFixed(2);
            }
        }
        return value.toString().substr(0, 8);
    }

    clearOutput() {
        const output = document.getElementById('output');
        output.textContent = 'Output cleared.\n';
    }

    async copyOutput() {
        const output = document.getElementById('output');
        const text = output.textContent;

        try {
            await navigator.clipboard.writeText(text);
            // Briefly show success feedback
            const copyBtn = document.getElementById('copy-output-btn');
            const originalText = copyBtn.textContent;
            copyBtn.textContent = 'Copied!';
            copyBtn.style.background = '#4CAF50';

            setTimeout(() => {
                copyBtn.textContent = originalText;
                copyBtn.style.background = '';
            }, 1500);
        } catch (err) {
            // Fallback for older browsers
            this.fallbackCopyToClipboard(text);
        }
    }

    fallbackCopyToClipboard(text) {
        // Create a temporary textarea to select and copy text
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();

        try {
            document.execCommand('copy');

            // Show success feedback
            const copyBtn = document.getElementById('copy-output-btn');
            const originalText = copyBtn.textContent;
            copyBtn.textContent = 'Copied!';
            copyBtn.style.background = '#4CAF50';

            setTimeout(() => {
                copyBtn.textContent = originalText;
                copyBtn.style.background = '';
            }, 1500);
        } catch (err) {
            console.error('Failed to copy text: ', err);
            alert('Copy failed. Please select and copy the text manually.');
        }

        document.body.removeChild(textArea);
    }
    selectConnection(connection) {
        console.log('Selecting connection:', connection); // Debug log

        // Clear previous connection selection
        if (this.selectedConnection) {
            this.selectedConnection.pathElement.classList.remove('selected');
            if (this.selectedConnection.touchArea) {
                this.selectedConnection.touchArea.classList.remove('selected');
            }
        }

        // Select new connection
        this.selectedConnection = connection;
        if (connection) {
            console.log('Connection selected successfully'); // Debug log
            connection.pathElement.classList.add('selected');
            // Also apply selection style to touch area for consistency
            if (connection.touchArea) {
                connection.touchArea.classList.add('selected');
            }

            // Provide immediate visual feedback
            connection.pathElement.style.stroke = '#2196f3';
            connection.pathElement.style.strokeWidth = '6px';

            // Reset visual feedback after a moment
            setTimeout(() => {
                if (connection.pathElement.classList.contains('selected')) {
                    connection.pathElement.style.stroke = '';
                    connection.pathElement.style.strokeWidth = '';
                }
            }, 200);
        }
    }

    updateToolbarButtonStates() {
        const nodeElement = this.selectedNodeForHighlight;
        let hasParameters = false;
        if (nodeElement) {
            const nodeData = this.nodes.get(nodeElement.dataset.nodeId);
            hasParameters = !!(nodeData && this.nodeHasParameters(nodeData.type));
        }

        document.getElementById('params-node-btn').disabled = !hasParameters;
        document.getElementById('flip-node-btn').disabled = !nodeElement;
        document.getElementById('delete-btn').disabled = !nodeElement && !this.selectedConnection;
    }

    onKeyDown(e) {
        // Don't steal keys from text fields (e.g. Backspace in the code editor)
        const target = e.target;
        const isTyping = target && (target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' || target.isContentEditable);
        const mod = e.ctrlKey || e.metaKey;

        if (e.key === 'Escape') {
            this.clearSelection();
            this.hideNodeContextMenu();
            return;
        }

        // Ctrl+S / Ctrl+R work everywhere (the browser defaults are never
        // what you want inside the editor)
        if (mod && (e.key === 's' || e.key === 'S')) {
            e.preventDefault();
            this.saveGraph();
            return;
        }
        if (mod && (e.key === 'r' || e.key === 'R')) {
            e.preventDefault();
            this.toggleRun();
            return;
        }

        if (isTyping) return;

        if (mod && (e.key === 'z' || e.key === 'Z')) {
            e.preventDefault();
            if (e.shiftKey) {
                this.redo();
            } else {
                this.undo();
            }
            return;
        }
        if (mod && (e.key === 'y' || e.key === 'Y')) {
            e.preventDefault();
            this.redo();
            return;
        }

        // Hold Space to pan the canvas by dragging
        if (e.code === 'Space') {
            e.preventDefault(); // don't scroll the page or trigger focused buttons
            if (!e.repeat) {
                this.spaceDown = true;
                this.canvasEl.classList.add('space-pan');
            }
            return;
        }

        // Delete key - delete selected node or connection
        if (e.key === 'Delete' || e.key === 'Backspace') {
            e.preventDefault();
            this.deleteSelected();
        }
    }

    onKeyUp(e) {
        if (e.code === 'Space') {
            this.spaceDown = false;
            this.canvasEl.classList.remove('space-pan');
            if (this.mousePanning) {
                this.mousePanning = false;
                this.finishPan();
            }
        }
    }
}

/**
 * Copy the methods of a mixin class onto NodeEditor.prototype. Used by the
 * editor modules (assets/editor/*.js) to split one large class across files
 * without changing `this` semantics and without a build step.
 */
function applyEditorMixin(mixinClass) {
    for (const name of Object.getOwnPropertyNames(mixinClass.prototype)) {
        if (name === 'constructor') continue;
        Object.defineProperty(NodeEditor.prototype, name,
            Object.getOwnPropertyDescriptor(mixinClass.prototype, name));
    }
}

// Initialize the editor when the page loads (mixin scripts have run by then)
document.addEventListener('DOMContentLoaded', () => {
    new NodeEditor();
});
