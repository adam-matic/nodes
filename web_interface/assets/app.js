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

        // Node context menu state
        this.longPressTimer = null;
        this.longPressNode = null;

        // Plot panel (Plots tab) — one chart per plot node in the graph
        this.plotPanel = new PlotPanel(document.getElementById('plots-container'));

        this.setupEventListeners();
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
        const nodeEditor = document.getElementById('visual-tab');
        nodeEditor.addEventListener('mousedown', (e) => this.onMouseDown(e));
        nodeEditor.addEventListener('mousemove', (e) => this.onMouseMove(e));
        nodeEditor.addEventListener('mouseup', (e) => this.onMouseUp(e));
        nodeEditor.addEventListener('contextmenu', (e) => e.preventDefault()); // Prevent browser context menu

        // Touch events for mobile support
        nodeEditor.addEventListener('touchstart', (e) => this.onTouchStart(e), { passive: false });
        nodeEditor.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: false });
        nodeEditor.addEventListener('touchend', (e) => this.onTouchEnd(e), { passive: false });


        // Context menu
        document.getElementById('node-menu').addEventListener('click', (e) => {
            if (e.target.classList.contains('node-menu-item')) {
                this.createNode(e.target.dataset.type, this.menuPos);
                this.hideNodeMenu();
            }
        });

        // Hide menu on click outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#node-menu') && !e.target.closest('#add-node-btn')) {
                this.hideNodeMenu();
            }
        });

        // Toolbar controls
        document.getElementById('add-node-btn').addEventListener('click', (e) => this.showNodeMenuFromButton(e));
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

    showNodeMenuFromButton(e) {
        const menu = document.getElementById('node-menu');
        const button = e.target;

        // Position menu below the button (since it's now at the top)
        const buttonRect = button.getBoundingClientRect();
        menu.style.left = buttonRect.left + 'px';
        menu.style.top = (buttonRect.bottom + 5) + 'px';

        // Set default position for new nodes (center of viewport)
        const nodeEditor = document.getElementById('visual-tab');
        const editorRect = nodeEditor.getBoundingClientRect();
        const centerX = editorRect.width / 2;
        const centerY = editorRect.height / 2;
        this.menuPos = this.screenToWorld(centerX, centerY);

        menu.classList.remove('hidden');
    }

    hideNodeMenu() {
        document.getElementById('node-menu').classList.add('hidden');
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

            const nodeId = nodeElement.dataset.nodeId;
            const nodeData = this.nodes.get(nodeId);

            // Enable toolbar buttons based on node capabilities
            document.getElementById('flip-node-btn').disabled = false;
            document.getElementById('delete-btn').disabled = false;

            // Enable parameters button only if node has parameters
            if (nodeData && this.nodeHasParameters(nodeData.type)) {
                document.getElementById('params-node-btn').disabled = false;
            } else {
                document.getElementById('params-node-btn').disabled = true;
            }
        } else {
            // Disable all toolbar buttons
            document.getElementById('params-node-btn').disabled = true;
            document.getElementById('flip-node-btn').disabled = true;
            document.getElementById('delete-btn').disabled = true;
        }
    }

    clearSelection() {
        if (this.selectedNodeForHighlight) {
            this.selectedNodeForHighlight.classList.remove('selected');
            this.selectedNodeForHighlight = null;
        }

        // Clear connection selection
        if (this.selectedConnection) {
            this.selectedConnection.pathElement.classList.remove('selected');
            if (this.selectedConnection.touchArea) {
                this.selectedConnection.touchArea.classList.remove('selected');
            }
            this.selectedConnection = null;
        }

        // Disable toolbar buttons when no selection
        document.getElementById('params-node-btn').disabled = true;
        document.getElementById('flip-node-btn').disabled = true;
        document.getElementById('delete-btn').disabled = true;
    }

    deleteSelected() {
        // Check if a connection is selected
        if (this.selectedConnection) {
            console.log('Deleting selected connection:', this.selectedConnection); // Debug log
            this.deleteConnection(this.selectedConnection);
            this.selectedConnection = null;
            // Disable delete button after deletion
            document.getElementById('delete-btn').disabled = true;
            return;
        }

        // Check if a node is selected
        if (this.selectedNodeForHighlight) {
            console.log('Deleting selected node:', this.selectedNodeForHighlight); // Debug log
            this.deleteSelectedNode();
            return;
        }

        console.log('No selection to delete'); // Debug log
    }

    deleteSelectedNode() {
        if (!this.selectedNodeForHighlight) return;

        const nodeId = this.selectedNodeForHighlight.dataset.nodeId;

        // Remove all connections associated with this node
        this.connections = this.connections.filter(connection => {
            if (connection.from.nodeId === nodeId || connection.to.nodeId === nodeId) {
                // Remove the connection element from DOM
                if (connection.element) {
                    connection.element.remove();
                }
                return false; // Remove from array
            }
            return true; // Keep in array
        });

        // Remove the node from DOM
        this.selectedNodeForHighlight.remove();

        // Remove from nodes map
        this.nodes.delete(nodeId);
        this.syncPlotPanel();

        // Clear selection
        this.selectedNodeForHighlight = null;
        document.getElementById('params-node-btn').disabled = true;
        document.getElementById('flip-node-btn').disabled = true;
        document.getElementById('delete-btn').disabled = true;

        // Trigger validation and auto-compilation
        this.scheduleAutoCompile();
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
        }

        // Update the parameter display on the node
        this.updateNodeParameterDisplay(nodeId);

        this.hideParameterPanel();

        // Trigger validation and auto-compilation after parameter change
        this.scheduleAutoCompile();
    }

    flipSelectedNode() {
        if (!this.selectedNodeForHighlight) return;

        const nodeId = this.selectedNodeForHighlight.dataset.nodeId;
        const nodeData = this.nodes.get(nodeId);

        if (!nodeData) return;

        // Toggle flipped state
        nodeData.isFlipped = !nodeData.isFlipped;

        // Update visual appearance
        if (nodeData.isFlipped) {
            this.selectedNodeForHighlight.classList.add('flipped');
        } else {
            this.selectedNodeForHighlight.classList.remove('flipped');
        }

        // Update all connections to reflect the new port positions
        this.updateConnections();
    }

    createNode(type, pos) {
        const nodeId = `${type}_${this.nextNodeId++}`;
        const parameters = this.getDefaultParameters(type);
        const node = this.createNodeElement(type, nodeId, pos, parameters);

        this.nodes.set(nodeId, {
            id: nodeId,
            type: type,
            element: node,
            pos: pos,
            inputs: this.getNodeInputs(type),
            outputs: this.getNodeOutputs(type),
            value: null,
            isFlipped: false,
            parameters: parameters
        });

        document.getElementById('viewport').appendChild(node);

        if (type === 'plot') {
            this.syncPlotPanel();
        }

        // Trigger validation and auto-compilation after node creation
        this.scheduleAutoCompile();

        return nodeId;
    }

    createNodeElement(type, id, pos, parameters) {
        const node = document.createElement('div');
        node.className = `node ${this.getNodeClass(type)}`;
        node.style.left = pos.x + 'px';
        node.style.top = pos.y + 'px';
        node.dataset.nodeId = id;

        // Generate parameter display text
        const paramText = this.getParameterDisplayText(type, parameters);

        node.innerHTML = `
            <div class="node-title">${type}</div>
            <div class="node-params">${paramText}</div>
        `;

        // Add input ports
        const inputs = this.getNodeInputs(type);
        inputs.forEach((input, index) => {
            const port = document.createElement('div');
            port.className = 'port input';
            port.style.top = `${20 + index * 15}px`;
            port.dataset.portType = 'input';
            port.dataset.portIndex = index;
            node.appendChild(port);
        });

        // Add output ports
        const outputs = this.getNodeOutputs(type);
        outputs.forEach((output, index) => {
            const port = document.createElement('div');
            port.className = 'port output';
            port.style.top = `${20 + index * 15}px`;
            port.dataset.portType = 'output';
            port.dataset.portIndex = index;
            node.appendChild(port);
        });

        return node;
    }

    getParameterDisplayText(type, parameters) {
        // Generate parameter display text based on node type
        switch (type) {
            case 'mem':
                return `init: ${parameters.initialValue}`;
            case 'const':
                return `value: ${parameters.value}`;
            case 'plot':
                return `x: ${parameters.signalX}, y: ${parameters.signalY}`;
            case 'param':
                return `${parameters.name}: ${parameters.defaultValue}${parameters.alias ? ` → ${parameters.alias}` : ''}`;
            default:
                return ''; // No parameters to display
        }
    }

    updateNodeParameterDisplay(nodeId) {
        const nodeData = this.nodes.get(nodeId);
        if (!nodeData) return;

        const paramElement = nodeData.element.querySelector('.node-params');
        if (paramElement) {
            const paramText = this.getParameterDisplayText(nodeData.type, nodeData.parameters);
            paramElement.textContent = paramText;
        }
    }

    getNodeClass(type) {
        if (['add', 'sub', 'mul', 'div'].includes(type)) return 'arithmetic';
        if (type === 'mem') return 'memory';
        if (type === 'const') return 'constant';
        if (['gt', 'lt', 'eq', 'gte', 'lte'].includes(type)) return 'comparison';
        if (['input', 'output'].includes(type)) return 'io';
        if (type === 'param') return 'parameter';
        if (type === 'plot') return 'plot';
        return '';
    }

    getNodeInputs(type, nodeData = null) {
        if (['add', 'sub', 'mul', 'div', 'gt', 'lt', 'eq'].includes(type)) return ['a', 'b'];
        if (type === 'mem') return ['signal'];
        if (type === 'output') return ['value'];
        if (type === 'plot') return []; // Plot nodes don't need signal inputs, only params
        if (type === 'param') return []; // Param nodes don't have inputs
        if (type === 'module_instance' && nodeData) return nodeData.inputs || [];
        return [];
    }

    getNodeOutputs(type, nodeData = null) {
        if (type === 'plot') return []; // Plot nodes don't have outputs
        if (type === 'output') return []; // Output nodes don't have outputs
        if (type === 'module_instance' && nodeData) return nodeData.outputs || [];
        return ['out'];
    }

    nodeHasParameters(type) {
        // Define which node types have configurable parameters
        return ['mem', 'const', 'plot', 'param'].includes(type);
    }

    getDefaultParameters(type) {
        switch (type) {
            case 'mem':
                return { initialValue: 0 };
            case 'const':
                return { value: 1 };
            case 'plot':
                return {
                    signalX: 'step',
                    signalY: '',
                    historySize: 1000
                };
            case 'param':
                return {
                    name: 'param1',
                    defaultValue: 0,
                    alias: ''
                };
            default:
                return {};
        }
    }

    onMouseDown(e) {
        if (e.target.classList.contains('port')) {
            this.startConnection(e);
        } else if (e.target.closest('.node')) {
            const node = e.target.closest('.node');

            // Right-click - show context menu
            if (e.button === 2) {
                e.preventDefault();
                this.selectNode(node);
                this.showNodeContextMenu(e, node);
                return;
            }

            this.selectNode(node);
            this.startDrag(e);
        } else {
            // Clicked on empty space - clear selection
            this.clearSelection();
        }
    }

    onMouseMove(e) {
        if (this.isDragging) {
            this.updateDrag(e);
        } else if (this.isConnecting) {
            this.updateTempConnection(e);
        }
    }

    onMouseUp(e) {
        if (this.isConnecting) {
            this.finishConnection(e);
        } else if (this.isDragging) {
            this.finishDrag(e);
        }
    }

    // Touch event handlers
    onTouchStart(e) {
        e.preventDefault(); // Prevent scrolling and zooming

        if (e.touches.length === 2) {
            // Two finger pinch - start zoom
            this.clearLongPressTimer();
            this.startPinchZoom(e);
        } else if (e.touches.length === 1) {
            const touch = e.touches[0];
            const target = document.elementFromPoint(touch.clientX, touch.clientY);

            if (target && target.classList.contains('port')) {
                this.clearLongPressTimer();
                this.startConnectionTouch(touch, target);
            } else if (target && target.closest('.node')) {
                const node = target.closest('.node');
                this.selectNode(node);

                // Start long-press timer for context menu
                this.longPressNode = node;
                this.longPressTimer = setTimeout(() => {
                    // Trigger haptic feedback
                    if ('vibrate' in navigator) {
                        navigator.vibrate(50);
                    }
                    this.showNodeContextMenu(touch, node);
                    this.longPressNode = null;
                }, 500); // 500ms long press

                this.startDragTouch(touch, target);
            } else {
                // Touched empty space - clear selection and start panning
                this.clearLongPressTimer();
                this.clearSelection();
                this.startPan(touch);
            }
        }
    }

    onTouchMove(e) {
        e.preventDefault(); // Prevent scrolling

        // Cancel long press if touch moves
        this.clearLongPressTimer();

        if (e.touches.length === 2) {
            // Two finger pinch - update zoom
            this.updatePinchZoom(e);
        } else if (e.touches.length === 1) {
            const touch = e.touches[0];

            if (this.isDragging) {
                this.updateDragTouch(touch);
            } else if (this.isConnecting) {
                this.updateTempConnectionTouch(touch);
            } else if (this.isPanning) {
                this.updatePan(touch);
            }
        }
    }

    onTouchEnd(e) {
        e.preventDefault();

        if (e.touches.length === 0) {
            // All fingers lifted
            if (this.isConnecting) {
                const touch = e.changedTouches[0];
                const target = document.elementFromPoint(touch.clientX, touch.clientY);
                this.finishConnectionTouch(touch, target);
            } else if (this.isDragging) {
                this.finishDragTouch();
            } else if (this.isPanning) {
                this.finishPan();
            }
        } else if (e.touches.length === 1) {
            // One finger remaining after pinch
            this.finishPinchZoom();
        }
    }

    startDragTouch(touch, target) {
        const node = target.closest('.node');
        if (!node) return;

        this.isDragging = true;
        this.selectedNode = node;

        const rect = node.getBoundingClientRect();
        this.dragOffset = {
            x: touch.clientX - rect.left,
            y: touch.clientY - rect.top
        };

        node.classList.add('dragging');
    }

    updateDragTouch(touch) {
        if (!this.selectedNode) return;

        const nodeEditor = document.getElementById('visual-tab');
        const editorRect = nodeEditor.getBoundingClientRect();

        // Convert screen coordinates to world coordinates
        const screenX = touch.clientX - editorRect.left - this.dragOffset.x;
        const screenY = touch.clientY - editorRect.top - this.dragOffset.y;
        const worldPos = this.screenToWorld(screenX, screenY);

        this.selectedNode.style.left = worldPos.x + 'px';
        this.selectedNode.style.top = worldPos.y + 'px';

        // Update node position in data
        const nodeId = this.selectedNode.dataset.nodeId;
        if (this.nodes.has(nodeId)) {
            this.nodes.get(nodeId).pos = worldPos;
        }

        this.updateConnections();
    }

    finishDragTouch() {
        if (this.selectedNode) {
            this.selectedNode.classList.remove('dragging');
            this.selectedNode = null;
        }
        this.isDragging = false;
    }

    startConnectionTouch(touch, port) {
        const node = port.closest('.node');

        this.isConnecting = true;
        this.connectionStart = {
            nodeId: node.dataset.nodeId,
            portType: port.dataset.portType,
            portIndex: parseInt(port.dataset.portIndex),
            element: port
        };

        // Create temporary connection line
        this.tempConnection = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        this.tempConnection.classList.add('temp-connection');
        document.getElementById('connections').appendChild(this.tempConnection);
    }

    updateTempConnectionTouch(touch) {
        if (!this.tempConnection || !this.connectionStart) return;

        // Get start position in world coordinates
        const startNode = this.nodes.get(this.connectionStart.nodeId);
        if (!startNode) return;

        const startPortY = startNode.pos.y + 20 + this.connectionStart.portIndex * 15 + 6;

        // Port offset from edge
        const portOffset = 6;

        // Account for flipped nodes
        let startX;
        if (this.connectionStart.portType === 'output') {
            // Output port
            if (startNode.isFlipped) {
                // When flipped, output ports are visually on the left
                startX = startNode.pos.x + portOffset;
            } else {
                // Normal: output ports on the right
                startX = startNode.pos.x + startNode.element.offsetWidth - portOffset;
            }
        } else {
            // Input port
            if (startNode.isFlipped) {
                // When flipped, input ports are visually on the right
                startX = startNode.pos.x + startNode.element.offsetWidth - portOffset;
            } else {
                // Normal: input ports on the left
                startX = startNode.pos.x + portOffset;
            }
        }

        const startY = startPortY;

        // Convert touch position to world coordinates
        const editorRect = document.getElementById('visual-tab').getBoundingClientRect();
        const screenEndX = touch.clientX - editorRect.left;
        const screenEndY = touch.clientY - editorRect.top;
        const worldEnd = this.screenToWorld(screenEndX, screenEndY);

        const path = this.createConnectionPath(startX, startY, worldEnd.x, worldEnd.y, startNode, null);
        this.tempConnection.setAttribute('d', path);
    }

    finishConnectionTouch(touch, target) {
        if (!this.isConnecting || !this.connectionStart) return;

        const targetPort = target && target.classList.contains('port') ? target : null;

        if (targetPort && targetPort !== this.connectionStart.element) {
            const targetNode = targetPort.closest('.node');

            if (this.connectionStart.portType !== targetPort.dataset.portType) {
                // Valid connection (input to output or output to input)
                this.createConnection(
                    this.connectionStart,
                    {
                        nodeId: targetNode.dataset.nodeId,
                        portType: targetPort.dataset.portType,
                        portIndex: parseInt(targetPort.dataset.portIndex),
                        element: targetPort
                    }
                );
            }
        }

        // Clean up
        if (this.tempConnection) {
            this.tempConnection.remove();
            this.tempConnection = null;
        }

        this.isConnecting = false;
        this.connectionStart = null;
    }

    // Pan methods
    startPan(touch) {
        this.isPanning = true;
        this.lastPanPosition = { x: touch.clientX, y: touch.clientY };
    }

    updatePan(touch) {
        if (!this.isPanning) return;

        const dx = touch.clientX - this.lastPanPosition.x;
        const dy = touch.clientY - this.lastPanPosition.y;

        this.panX += dx;
        this.panY += dy;

        // Apply pan limits to prevent panning too far
        // Limit upward panning (positive panY values)
        const maxPanY = 100; // Allow only 100px upward pan
        const minPanY = -5000; // Allow panning down
        const maxPanX = 5000; // Allow panning right
        const minPanX = -5000; // Allow panning left

        this.panY = Math.max(minPanY, Math.min(maxPanY, this.panY));
        this.panX = Math.max(minPanX, Math.min(maxPanX, this.panX));

        this.lastPanPosition = { x: touch.clientX, y: touch.clientY };
        this.updateViewportTransform();
        this.updateConnections();
    }

    finishPan() {
        this.isPanning = false;
    }

    // Pinch zoom methods
    startPinchZoom(e) {
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];

        this.initialPinchDistance = this.getDistance(touch1, touch2);
        this.initialZoom = this.zoom;

        // Stop any ongoing operations
        this.isDragging = false;
        this.isConnecting = false;
        this.isPanning = false;

        if (this.selectedNode) {
            this.selectedNode.classList.remove('dragging');
            this.selectedNode = null;
        }

        if (this.tempConnection) {
            this.tempConnection.remove();
            this.tempConnection = null;
        }
    }

    updatePinchZoom(e) {
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];

        const currentDistance = this.getDistance(touch1, touch2);
        const scale = currentDistance / this.initialPinchDistance;

        const newZoom = this.initialZoom * scale;

        // Limit zoom range
        this.zoom = Math.max(0.1, Math.min(5, newZoom));

        this.updateViewportTransform();
        this.updateConnections();
    }

    finishPinchZoom() {
        // Reset initial values
        this.initialPinchDistance = 0;
        this.initialZoom = 1;
    }

    startDrag(e) {
        const node = e.target.closest('.node');
        if (!node) return;

        this.isDragging = true;
        this.selectedNode = node;

        const rect = node.getBoundingClientRect();
        this.dragOffset = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };

        node.classList.add('dragging');
    }

    updateDrag(e) {
        if (!this.selectedNode) return;

        const nodeEditor = document.getElementById('visual-tab');
        const editorRect = nodeEditor.getBoundingClientRect();

        // Convert screen coordinates to world coordinates
        const screenX = e.clientX - editorRect.left - this.dragOffset.x;
        const screenY = e.clientY - editorRect.top - this.dragOffset.y;
        const worldPos = this.screenToWorld(screenX, screenY);

        this.selectedNode.style.left = worldPos.x + 'px';
        this.selectedNode.style.top = worldPos.y + 'px';

        // Update node position in data
        const nodeId = this.selectedNode.dataset.nodeId;
        if (this.nodes.has(nodeId)) {
            this.nodes.get(nodeId).pos = worldPos;
        }

        this.updateConnections();
    }

    finishDrag(e) {
        if (this.selectedNode) {
            this.selectedNode.classList.remove('dragging');
            this.selectedNode = null;
        }
        this.isDragging = false;
    }

    startConnection(e) {
        const port = e.target;
        const node = port.closest('.node');

        this.isConnecting = true;
        this.connectionStart = {
            nodeId: node.dataset.nodeId,
            portType: port.dataset.portType,
            portIndex: parseInt(port.dataset.portIndex),
            element: port
        };

        // Create temporary connection line
        this.tempConnection = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        this.tempConnection.classList.add('temp-connection');
        document.getElementById('connections').appendChild(this.tempConnection);

        e.stopPropagation();
    }

    updateTempConnection(e) {
        if (!this.tempConnection || !this.connectionStart) return;

        // Get start position in world coordinates
        const startNode = this.nodes.get(this.connectionStart.nodeId);
        if (!startNode) return;

        const startPortY = startNode.pos.y + 20 + this.connectionStart.portIndex * 15 + 6;

        // Port offset from edge
        const portOffset = 6;

        // Account for flipped nodes
        let startX;
        if (this.connectionStart.portType === 'output') {
            // Output port
            if (startNode.isFlipped) {
                // When flipped, output ports are visually on the left
                startX = startNode.pos.x + portOffset;
            } else {
                // Normal: output ports on the right
                startX = startNode.pos.x + startNode.element.offsetWidth - portOffset;
            }
        } else {
            // Input port
            if (startNode.isFlipped) {
                // When flipped, input ports are visually on the right
                startX = startNode.pos.x + startNode.element.offsetWidth - portOffset;
            } else {
                // Normal: input ports on the left
                startX = startNode.pos.x + portOffset;
            }
        }

        const startY = startPortY;

        // Convert mouse position to world coordinates
        const editorRect = document.getElementById('visual-tab').getBoundingClientRect();
        const screenEndX = e.clientX - editorRect.left;
        const screenEndY = e.clientY - editorRect.top;
        const worldEnd = this.screenToWorld(screenEndX, screenEndY);

        const path = this.createConnectionPath(startX, startY, worldEnd.x, worldEnd.y, startNode, null);
        this.tempConnection.setAttribute('d', path);
    }

    finishConnection(e) {
        if (!this.isConnecting || !this.connectionStart) return;

        const targetPort = e.target.closest('.port');
        if (targetPort && targetPort !== this.connectionStart.element) {
            const targetNode = targetPort.closest('.node');

            if (this.connectionStart.portType !== targetPort.dataset.portType) {
                // Valid connection (input to output or output to input)
                this.createConnection(
                    this.connectionStart,
                    {
                        nodeId: targetNode.dataset.nodeId,
                        portType: targetPort.dataset.portType,
                        portIndex: parseInt(targetPort.dataset.portIndex),
                        element: targetPort
                    }
                );
            }
        }

        // Clean up
        if (this.tempConnection) {
            this.tempConnection.remove();
            this.tempConnection = null;
        }

        this.isConnecting = false;
        this.connectionStart = null;
    }

    createConnection(from, to) {
        // Ensure proper direction (output to input)
        if (from.portType === 'input') {
            [from, to] = [to, from];
        }

        // Generate unique wire name
        const wireName = this.generateWireName(from.nodeId, to.nodeId);

        const connection = {
            id: `conn_${this.connections.length}`,
            wireName: wireName,  // NEW: Each wire has a unique name
            from: from,
            to: to,
            value: null,
            element: null
        };

        const pathElement = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        pathElement.classList.add('connection-line');
        pathElement.dataset.connectionId = connection.id;

        // Create invisible wider touch area for better touch targeting
        const touchArea = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        touchArea.classList.add('connection-touch-area');
        touchArea.dataset.connectionId = connection.id;
        touchArea.style.stroke = 'transparent';
        touchArea.style.strokeWidth = '20'; // Much wider invisible touch area
        touchArea.style.fill = 'none';
        touchArea.style.cursor = 'pointer';
        touchArea.style.pointerEvents = 'stroke';

        // Add event listeners to both the touch area and visible path
        const addConnectionEvents = (element) => {
            element.addEventListener('click', (e) => this.onConnectionClick(e, connection));
            element.addEventListener('contextmenu', (e) => this.onConnectionRightClick(e, connection));

            // Touch support for mobile devices
            let touchStartTime = 0;
            let touchStartPos = { x: 0, y: 0 };
            let hasMoved = false;

            element.addEventListener('touchstart', (e) => {
                e.preventDefault();
                touchStartTime = Date.now();
                const touch = e.touches[0];
                touchStartPos = { x: touch.clientX, y: touch.clientY };
                hasMoved = false;
            }, { passive: false });

            element.addEventListener('touchmove', (e) => {
                e.preventDefault();
                const touch = e.touches[0];
                const dx = Math.abs(touch.clientX - touchStartPos.x);
                const dy = Math.abs(touch.clientY - touchStartPos.y);

                // If finger moved more than 10px, consider it a move gesture
                if (dx > 10 || dy > 10) {
                    hasMoved = true;
                }
            }, { passive: false });

            element.addEventListener('touchend', (e) => {
                e.preventDefault();
                e.stopPropagation();

                // Don't process if the touch moved (was likely a pan/scroll gesture)
                if (hasMoved) {
                    return;
                }

                const touchDuration = Date.now() - touchStartTime;
                const touch = e.changedTouches[0];

                if (touchDuration > 500) {
                    // Long press - show context menu
                    this.showConnectionContextMenu(touch, connection);
                } else {
                    // Short tap - select and optionally delete
                    this.onConnectionClick(e, connection);
                }
            }, { passive: false });
        };

        // Apply events to both visible line and invisible touch area
        addConnectionEvents(pathElement);
        addConnectionEvents(touchArea);

        const textElement = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        textElement.classList.add('connection-value');
        textElement.textContent = '';

        const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        group.classList.add('connection');
        group.appendChild(touchArea); // Add invisible touch area first (behind visible line)
        group.appendChild(pathElement);
        group.appendChild(textElement);

        connection.element = group;
        connection.pathElement = pathElement;
        connection.touchArea = touchArea;
        connection.textElement = textElement;

        this.connections.push(connection);
        document.getElementById('connections').appendChild(group);

        this.updateConnection(connection);

        // Trigger validation and auto-compilation
        this.scheduleAutoCompile();
    }

    updateConnections() {
        this.connections.forEach(conn => this.updateConnection(conn));
    }

    updateConnection(connection) {
        // Get world positions of the ports
        const fromNode = this.nodes.get(connection.from.nodeId);
        const toNode = this.nodes.get(connection.to.nodeId);

        if (!fromNode || !toNode) return;

        // Calculate port positions in world coordinates
        const fromPortY = fromNode.pos.y + 20 + connection.from.portIndex * 15 + 6; // center of port
        const toPortY = toNode.pos.y + 20 + connection.to.portIndex * 15 + 6;

        // Port offset from edge (ports are positioned at -6px for input, and at width-6px for output)
        const portOffset = 6;

        // Account for flipped nodes
        let startX, endX;

        if (connection.from.portType === 'output') {
            // From node output port
            if (fromNode.isFlipped) {
                // When flipped, output ports are visually on the left
                startX = fromNode.pos.x + portOffset;
            } else {
                // Normal: output ports on the right
                startX = fromNode.pos.x + fromNode.element.offsetWidth - portOffset;
            }
        } else {
            // From node input port
            if (fromNode.isFlipped) {
                // When flipped, input ports are visually on the right
                startX = fromNode.pos.x + fromNode.element.offsetWidth - portOffset;
            } else {
                // Normal: input ports on the left
                startX = fromNode.pos.x + portOffset;
            }
        }

        if (connection.to.portType === 'input') {
            // To node input port
            if (toNode.isFlipped) {
                // When flipped, input ports are visually on the right
                endX = toNode.pos.x + toNode.element.offsetWidth - portOffset;
            } else {
                // Normal: input ports on the left
                endX = toNode.pos.x + portOffset;
            }
        } else {
            // To node output port
            if (toNode.isFlipped) {
                // When flipped, output ports are visually on the left
                endX = toNode.pos.x + portOffset;
            } else {
                // Normal: output ports on the right
                endX = toNode.pos.x + toNode.element.offsetWidth - portOffset;
            }
        }

        const startY = fromPortY;
        const endY = toPortY;

        const path = this.createConnectionPath(startX, startY, endX, endY, fromNode, toNode);
        connection.pathElement.setAttribute('d', path);

        // Update the invisible touch area with the same path
        if (connection.touchArea) {
            connection.touchArea.setAttribute('d', path);
        }

        // Position wire label at midpoint showing "wireName=value"
        const midX = (startX + endX) / 2;
        const midY = (startY + endY) / 2;
        connection.textElement.setAttribute('x', midX);
        connection.textElement.setAttribute('y', midY - 5);

        // Update text content to show wire name and value
        const displayText = connection.value !== null ?
            `${connection.wireName}=${connection.value}` :
            connection.wireName;
        connection.textElement.textContent = displayText;
    }

    createConnectionPath(x1, y1, x2, y2) {
        const midX = (x1 + x2) / 2;
        return `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
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
            this.updateConnection(conn);
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

    getPlotYSignals(nodeData) {
        return (nodeData.parameters.signalY || '')
            .split(',')
            .map(s => s.trim())
            .filter(Boolean);
    }

    /** Rebuild the Plots tab so it has one chart per plot node. */
    syncPlotPanel() {
        const configs = [];
        this.nodes.forEach((nodeData) => {
            if (nodeData.type !== 'plot') return;
            configs.push({
                id: nodeData.id,
                title: nodeData.id,
                xSignal: nodeData.parameters.signalX || 'step',
                ySignals: this.getPlotYSignals(nodeData),
                maxPoints: parseInt(nodeData.parameters.historySize) || 1000
            });
        });
        this.plotPanel.sync(configs);
    }

    updatePlots(signals) {
        this.nodes.forEach((nodeData) => {
            if (nodeData.type !== 'plot') return;

            const ySignals = this.getPlotYSignals(nodeData);
            if (ySignals.length === 0) return;

            const signalX = nodeData.parameters.signalX || 'step';
            let xValue = signalX === 'step' ? this.currentStep : signals[signalX];
            if (typeof xValue !== 'number') xValue = this.currentStep;

            // Missing signals become null, which renders as a gap in the trace
            const yValues = ySignals.map(name => {
                const value = signals[name];
                return typeof value === 'number' && isFinite(value) ? value : null;
            });

            this.plotPanel.appendData(nodeData.id, xValue, yValues);
        });
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

    // Zoom and pan methods
    updateViewportTransform() {
        const viewport = document.getElementById('viewport');
        viewport.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
    }

    getDistance(touch1, touch2) {
        const dx = touch1.clientX - touch2.clientX;
        const dy = touch1.clientY - touch2.clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    getMidpoint(touch1, touch2) {
        return {
            x: (touch1.clientX + touch2.clientX) / 2,
            y: (touch1.clientY + touch2.clientY) / 2
        };
    }

    worldToScreen(worldX, worldY) {
        return {
            x: worldX * this.zoom + this.panX,
            y: worldY * this.zoom + this.panY
        };
    }

    screenToWorld(screenX, screenY) {
        return {
            x: (screenX - this.panX) / this.zoom,
            y: (screenY - this.panY) / this.zoom
        };
    }

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

        // First, collect all module definitions from module instances
        const moduleDefinitions = new Map();
        this.nodes.forEach((nodeData, nodeId) => {
            if (nodeData.type === 'module_instance' && nodeData.moduleDefinition) {
                const moduleName = nodeData.moduleName || 'module';
                if (!moduleDefinitions.has(moduleName)) {
                    moduleDefinitions.set(moduleName, nodeData.moduleDefinition);
                }
            }
        });

        // Generate module definitions first
        let code = '';
        moduleDefinitions.forEach((moduleDef, moduleName) => {
            code += this.generateModuleDefinitionCode(moduleDef, moduleName);
            code += '\n\n';
        });

        code += 'module visual_graph {\n';
        const addedWires = new Set();

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
            } else if (fromNode.type === 'module_instance') {
                // Find input wires to the module instance
                const nodeInputs = this.getNodeInputs(fromNode.type, fromNode);
                const inputWires = [];

                nodeInputs.forEach((inputName, inputIndex) => {
                    const inputConn = this.connections.find(c =>
                        c.to.nodeId === fromNode.id && c.to.portIndex === inputIndex
                    );
                    inputWires[inputIndex] = inputConn ? inputConn.wireName : '0';
                });

                const params = inputWires.join(', ');
                const moduleName = fromNode.moduleName || 'module';
                code += `    ${conn.wireName} = ${moduleName}(${params})\n`;
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

    generateWireName(fromNodeId, toNodeId) {
        // Generate wire name based ONLY on source node and port
        // This ensures multiple connections from the same output share the same wire name
        const fromNode = this.nodes.get(fromNodeId);

        if (!fromNode) {
            return `signal_${this.connections.length}`;
        }

        // Extract numeric ID from node ID
        const fromNum = fromNodeId.split('_')[1] || '1';

        // Generate a descriptive name based on the source node type
        let wireName;

        if (fromNode.type === 'input') {
            wireName = `in_${fromNum}`;
        } else if (fromNode.type === 'param') {
            // Use the parameter name directly
            wireName = fromNode.parameters?.name || `param_${fromNum}`;
        } else if (fromNode.type === 'const') {
            wireName = `const_${fromNum}_out`;
        } else if (fromNode.type === 'mem') {
            wireName = `mem_${fromNum}_out`;
        } else if (['add', 'sub', 'mul', 'div'].includes(fromNode.type)) {
            wireName = `${fromNode.type}_${fromNum}_result`;
        } else if (['gt', 'lt', 'eq', 'gte', 'lte'].includes(fromNode.type)) {
            wireName = `${fromNode.type}_${fromNum}_result`;
        } else {
            wireName = `${fromNode.type}_${fromNum}_out`;
        }

        return wireName;
    }

    getVariableName(nodeId, portIndex) {
        const nodeData = this.nodes.get(nodeId);
        if (!nodeData) return 'unknown';

        // Clean up node ID for variable names
        const cleanId = nodeId.replace(/[^a-zA-Z0-9_]/g, '_');
        let suffix = cleanId.split('_')[1] || '1';

        // Ensure suffix doesn't start with a number - prefix with 'n' if it does
        if (/^\d/.test(suffix)) {
            suffix = 'n' + suffix;
        }

        // Ensure variable names start with a letter and are valid identifiers
        if (nodeData.type === 'const') {
            return `const_${suffix}`;
        }

        return `${nodeData.type}_${suffix}`;
    }

    scheduleAutoCompile() {
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

    // Connection deletion methods
    onConnectionClick(e, connection) {
        e.stopPropagation();
        e.preventDefault();

        // Provide haptic feedback on touch devices
        if ('vibrate' in navigator) {
            navigator.vibrate(50); // Brief vibration for feedback
        }

        // Clear node selection first (but preserve connection selection)
        if (this.selectedNodeForHighlight) {
            this.selectedNodeForHighlight.classList.remove('selected');
            this.selectedNodeForHighlight = null;
        }

        // Select the connection
        this.selectConnection(connection);

        // Disable node-specific buttons, enable delete button
        document.getElementById('params-node-btn').disabled = true;
        document.getElementById('flip-node-btn').disabled = true;
        document.getElementById('delete-btn').disabled = false;
    }

    onConnectionRightClick(e, connection) {
        e.preventDefault();
        e.stopPropagation();

        // Show context menu for connection
        this.showConnectionContextMenu(e, connection);
    }

    deleteConnection(connection) {
        // Remove from connections array
        const index = this.connections.indexOf(connection);
        if (index > -1) {
            this.connections.splice(index, 1);
        }

        // Remove DOM element
        if (connection.element && connection.element.parentNode) {
            connection.element.parentNode.removeChild(connection.element);
        }

        // Trigger validation and auto-compilation
        this.scheduleAutoCompile();
    }

    showConnectionContextMenu(e, connection) {
        // Remove any existing connection menu
        const existingMenu = document.getElementById('connection-menu');
        if (existingMenu) {
            existingMenu.remove();
        }

        // Create context menu
        const menu = document.createElement('div');
        menu.id = 'connection-menu';
        menu.className = 'connection-menu';
        menu.innerHTML = `
            <div class="connection-menu-item" data-action="rename">✏️ Rename Wire</div>
            <div class="connection-menu-item" data-action="delete">🗑 Delete Connection</div>
            <div class="connection-menu-item" data-action="info">ℹ Connection Info</div>
        `;

        // Position menu at touch/mouse location
        const clientX = e.clientX || e.pageX || 0;
        const clientY = e.clientY || e.pageY || 0;

        menu.style.left = clientX + 'px';
        menu.style.top = clientY + 'px';
        menu.style.position = 'fixed';
        menu.style.zIndex = '10000';

        // Add to document
        document.body.appendChild(menu);

        // Ensure menu stays within viewport
        setTimeout(() => {
            const menuRect = menu.getBoundingClientRect();
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;

            if (menuRect.right > viewportWidth) {
                menu.style.left = (clientX - menuRect.width) + 'px';
            }
            if (menuRect.bottom > viewportHeight) {
                menu.style.top = (clientY - menuRect.height) + 'px';
            }
        }, 0);

        // Add event listeners
        menu.addEventListener('click', (menuE) => {
            const action = menuE.target.dataset.action;
            if (action === 'rename') {
                this.renameWire(connection);
            } else if (action === 'delete') {
                this.deleteConnection(connection);
            } else if (action === 'info') {
                this.showConnectionInfo(connection);
            }
            menu.remove();
        });

        // Add touch event listeners for mobile
        menu.addEventListener('touchend', (menuE) => {
            menuE.preventDefault();
            const action = menuE.target.dataset.action;
            if (action === 'rename') {
                this.renameWire(connection);
            } else if (action === 'delete') {
                this.deleteConnection(connection);
            } else if (action === 'info') {
                this.showConnectionInfo(connection);
            }
            menu.remove();
        });

        // Remove menu when clicking/touching elsewhere
        const removeMenu = (event) => {
            if (!menu.contains(event.target)) {
                menu.remove();
                document.removeEventListener('click', removeMenu);
                document.removeEventListener('touchstart', removeMenu);
            }
        };

        setTimeout(() => {
            document.addEventListener('click', removeMenu);
            document.addEventListener('touchstart', removeMenu);
        }, 10);
    }

    renameWire(connection) {
        const currentName = connection.wireName;
        const newName = prompt(`Rename wire "${currentName}" to:`, currentName);

        if (newName && newName.trim() !== '' && newName !== currentName) {
            // Validate wire name (must be valid identifier)
            const validName = newName.trim().replace(/[^a-zA-Z0-9_]/g, '_');

            if (validName !== newName.trim()) {
                alert(`Invalid wire name. Using sanitized name: ${validName}`);
            }

            // Check for duplicate wire names
            const duplicateExists = this.connections.some(c => c.wireName === validName && c !== connection);
            if (duplicateExists) {
                alert(`Wire name "${validName}" already exists. Please choose a different name.`);
                return;
            }

            // Update wire name
            connection.wireName = validName;

            // Update visual display
            this.updateConnection(connection);

            // Trigger recompilation
            this.scheduleAutoCompile();
        }
    }

    showConnectionInfo(connection) {
        const fromNode = this.nodes.get(connection.from.nodeId);
        const toNode = this.nodes.get(connection.to.nodeId);

        const info = `Connection Info:
Wire Name: ${connection.wireName}
From: ${fromNode?.type || 'unknown'} (${connection.from.nodeId})
To: ${toNode?.type || 'unknown'} (${connection.to.nodeId})
Current Value: ${connection.value !== null ? connection.value : 'none'}`;

        alert(info);
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

    onKeyDown(e) {
        // Delete key - delete selected node or connection
        if (e.key === 'Delete' || e.key === 'Backspace') {
            e.preventDefault();
            this.deleteSelected();
        }

        // Escape key - clear selections
        if (e.key === 'Escape') {
            this.clearSelection();
            this.hideNodeContextMenu();
        }
    }

    deleteSelected() {
        if (this.selectedNode) {
            const nodeId = this.selectedNode.dataset.nodeId;
            const nodeData = this.nodes.get(nodeId);

            // If deleting a param node, remove all bindings to it
            if (nodeData && nodeData.type === 'param') {
                this.removeParameterBindings(nodeId);
            }

            // Remove the node's connections
            this.connections = this.connections.filter(conn => {
                if (conn.from.nodeId === nodeId || conn.to.nodeId === nodeId) {
                    if (conn.element && conn.element.parentNode) {
                        conn.element.parentNode.removeChild(conn.element);
                    }
                    return false;
                }
                return true;
            });

            // Remove the node element
            if (nodeData && nodeData.element && nodeData.element.parentNode) {
                nodeData.element.parentNode.removeChild(nodeData.element);
            }

            // Remove from nodes map
            this.nodes.delete(nodeId);
            this.syncPlotPanel();

            this.selectedNode = null;
            this.updateToolbarButtonStates();
            this.scheduleAutoCompile();
        } else if (this.selectedConnection) {
            // Delete connection
            const connIndex = this.connections.indexOf(this.selectedConnection);
            if (connIndex !== -1) {
                if (this.selectedConnection.element && this.selectedConnection.element.parentNode) {
                    this.selectedConnection.element.parentNode.removeChild(this.selectedConnection.element);
                }
                this.connections.splice(connIndex, 1);
            }
            this.selectedConnection = null;
            this.scheduleAutoCompile();
        }
    }

    removeParameterBindings(paramNodeId) {
        // Find all nodes that have bindings to this param node and remove them
        this.nodes.forEach((nodeData, nodeId) => {
            if (nodeData.parameterBindings) {
                Object.keys(nodeData.parameterBindings).forEach(paramKey => {
                    if (nodeData.parameterBindings[paramKey] === paramNodeId) {
                        delete nodeData.parameterBindings[paramKey];
                        this.updateParameterBindingBadge(nodeId);
                    }
                });
            }
        });
    }

    // Node Context Menu Methods

    clearLongPressTimer() {
        if (this.longPressTimer) {
            clearTimeout(this.longPressTimer);
            this.longPressTimer = null;
        }
        this.longPressNode = null;
    }

    showNodeContextMenu(event, nodeElement) {
        // Cancel any ongoing drag
        if (this.isDragging) {
            this.isDragging = false;
            if (this.selectedNode) {
                this.selectedNode.classList.remove('dragging');
            }
        }

        const nodeId = nodeElement.dataset.nodeId;
        const nodeData = this.nodes.get(nodeId);

        if (!nodeData) return;

        const menu = document.getElementById('node-context-menu');
        menu.innerHTML = '';

        // Get exportable parameters for this node type
        const exportableParams = this.getExportableParameters(nodeData.type);

        if (exportableParams.length === 0) {
            menu.innerHTML = '<div class="node-context-menu-item disabled">No exportable parameters</div>';
        } else {
            exportableParams.forEach(param => {
                const item = document.createElement('div');
                item.className = 'node-context-menu-item';
                item.innerHTML = `📤 Export "${param.label}" parameter`;
                item.dataset.paramKey = param.key;
                item.dataset.nodeId = nodeId;

                item.addEventListener('click', () => this.exportParameter(nodeId, param.key));
                item.addEventListener('touchend', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.exportParameter(nodeId, param.key);
                });

                menu.appendChild(item);
            });
        }

        // Position menu at click/touch location
        const clientX = event.clientX || event.pageX || (event.touches && event.touches[0].clientX) || 0;
        const clientY = event.clientY || event.pageY || (event.touches && event.touches[0].clientY) || 0;

        menu.style.left = clientX + 'px';
        menu.style.top = clientY + 'px';
        menu.style.position = 'fixed';
        menu.classList.remove('hidden');

        // Adjust position if menu goes off screen
        setTimeout(() => {
            const menuRect = menu.getBoundingClientRect();
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;

            if (menuRect.right > viewportWidth) {
                menu.style.left = (clientX - menuRect.width) + 'px';
            }
            if (menuRect.bottom > viewportHeight) {
                menu.style.top = (clientY - menuRect.height) + 'px';
            }
        }, 0);

        // Close menu when clicking elsewhere
        const closeMenu = (e) => {
            if (!menu.contains(e.target)) {
                this.hideNodeContextMenu();
                document.removeEventListener('click', closeMenu);
                document.removeEventListener('touchstart', closeMenu);
            }
        };

        setTimeout(() => {
            document.addEventListener('click', closeMenu);
            document.addEventListener('touchstart', closeMenu);
        }, 10);
    }

    hideNodeContextMenu() {
        const menu = document.getElementById('node-context-menu');
        menu.classList.add('hidden');
    }

    getExportableParameters(nodeType) {
        // Define which parameters can be exported for each node type
        const exportable = {
            'const': [{ key: 'value', label: 'value' }],
            'mem': [{ key: 'initialValue', label: 'initial value' }],
            'plot': [
                { key: 'signalX', label: 'X signal' },
                { key: 'signalY', label: 'Y signal' },
                { key: 'historySize', label: 'history size' }
            ]
        };

        return exportable[nodeType] || [];
    }

    exportParameter(nodeId, paramKey) {
        const nodeData = this.nodes.get(nodeId);
        if (!nodeData) return;

        // Close the context menu
        this.hideNodeContextMenu();

        // Create a param node near the original node
        const offset = { x: 150, y: -50 };
        const paramPos = {
            x: nodeData.pos.x + offset.x,
            y: nodeData.pos.y + offset.y
        };

        // Generate parameter name based on node type and param key
        const paramName = `${nodeData.type}_${paramKey}_${nodeId.split('_')[1] || '1'}`;

        // Get current parameter value as default
        const currentValue = nodeData.parameters[paramKey] || 0;

        // Create param node
        const paramNodeId = this.createNode('param', paramPos);
        const paramNodeData = this.nodes.get(paramNodeId);

        if (paramNodeData) {
            paramNodeData.parameters.name = paramName;
            paramNodeData.parameters.defaultValue = currentValue;
            paramNodeData.parameters.alias = '';

            // Store binding metadata (no wires!)
            if (!nodeData.parameterBindings) {
                nodeData.parameterBindings = {};
            }
            nodeData.parameterBindings[paramKey] = paramNodeId;

            // Update param node display
            this.updateNodeParameterDisplay(paramNodeId);

            // Add visual badge to the original node
            this.updateParameterBindingBadge(nodeId);

            this.addOutput(`Exported parameter "${paramKey}" as "${paramName}"\n`);

            // Trigger auto-compile
            this.scheduleAutoCompile();
        }
    }

    updateParameterBindingBadge(nodeId) {
        const nodeData = this.nodes.get(nodeId);
        if (!nodeData) return;

        const nodeElement = nodeData.element;

        // Remove existing badge
        const existingBadge = nodeElement.querySelector('.param-binding-badge');
        if (existingBadge) {
            existingBadge.remove();
        }

        // Count bound parameters
        const bindingCount = nodeData.parameterBindings ? Object.keys(nodeData.parameterBindings).length : 0;

        if (bindingCount > 0) {
            const badge = document.createElement('div');
            badge.className = 'param-binding-badge';
            badge.textContent = bindingCount;
            nodeElement.appendChild(badge);
        }
    }

    // Save/Load/Module Methods

    serializeGraph() {
        const nodesArray = [];
        this.nodes.forEach((nodeData, nodeId) => {
            // Plot data lives in the plot panel now; drop the legacy
            // plotData field so saved files stay small
            const parameters = { ...(nodeData.parameters || {}) };
            delete parameters.plotData;

            nodesArray.push({
                id: nodeId,
                type: nodeData.type,
                pos: { x: nodeData.pos.x, y: nodeData.pos.y },
                isFlipped: nodeData.isFlipped || false,
                parameters: parameters,
                parameterBindings: nodeData.parameterBindings || {},
                moduleName: nodeData.moduleName || null,
                moduleDefinition: nodeData.moduleDefinition || null
            });
        });

        const connectionsArray = this.connections.map(conn => ({
            id: conn.id,
            wireName: conn.wireName,
            from: {
                nodeId: conn.from.nodeId,
                portType: conn.from.portType,
                portIndex: conn.from.portIndex
            },
            to: {
                nodeId: conn.to.nodeId,
                portType: conn.to.portType,
                portIndex: conn.to.portIndex
            }
        }));

        const graphData = {
            version: "1.0",
            metadata: {
                name: this.graphName || "untitled",
                description: "",
                created: this.createdTimestamp || new Date().toISOString(),
                modified: new Date().toISOString()
            },
            viewport: {
                zoom: this.zoom,
                panX: this.panX,
                panY: this.panY
            },
            nodes: nodesArray,
            connections: connectionsArray,
            compiledCode: this.generateCodeFromGraph(),
            executionSettings: {
                maxSteps: parseInt(document.getElementById('max-steps-input').value) || 10
            }
        };

        return graphData;
    }

    saveGraph() {
        const graphData = this.serializeGraph();

        // Prompt for filename
        const filename = prompt("Enter filename:", this.graphName || "graph") || "graph";
        this.graphName = filename;

        // Convert to JSON
        const jsonString = JSON.stringify(graphData, null, 2);

        // Create blob and download
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename.endsWith('.mmgraph') ? filename : filename + '.mmgraph';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        this.addOutput(`Graph saved as ${a.download}\n`);
    }

    newGraph() {
        // Confirm before clearing
        if (this.nodes.size > 0) {
            const confirm = window.confirm('Create a new graph? This will clear the current graph.');
            if (!confirm) return;
        }

        // Clear the graph
        this.clearGraph();

        // Reset graph metadata
        this.graphName = 'untitled';
        this.createdTimestamp = new Date().toISOString();

        // Reset viewport
        this.zoom = 1;
        this.panX = 0;
        this.panY = 0;
        this.updateViewportTransform();

        // Reset execution settings
        document.getElementById('max-steps-input').value = 10;

        this.addOutput('New graph created\n');
    }

    loadGraph() {
        // Trigger file input
        this.isLoadingAsModule = false;
        document.getElementById('file-input').click();
    }

    insertModule() {
        // Trigger file input for module insertion
        this.isLoadingAsModule = true;
        document.getElementById('file-input').click();
    }

    handleFileSelect(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const graphData = JSON.parse(e.target.result);

                if (this.isLoadingAsModule) {
                    // Insert as module instance
                    const nodeEditor = document.getElementById('visual-tab');
                    const editorRect = nodeEditor.getBoundingClientRect();
                    const centerX = editorRect.width / 2;
                    const centerY = editorRect.height / 2;
                    const pos = this.screenToWorld(centerX, centerY);

                    this.loadGraphAsModuleInstance(graphData, pos);
                } else {
                    // Load as full graph replacement
                    this.loadGraphFromFile(graphData);
                }

                // Reset file input
                event.target.value = '';
            } catch (error) {
                this.addOutput(`Error loading file: ${error.message}\n`);
                console.error('Error loading graph:', error);
            }
        };
        reader.readAsText(file);
    }

    loadGraphFromFile(graphData) {
        // Clear existing graph
        this.clearGraph();

        // Restore metadata
        this.graphName = graphData.metadata?.name || "untitled";
        this.createdTimestamp = graphData.metadata?.created || new Date().toISOString();

        // Restore viewport
        if (graphData.viewport) {
            this.zoom = graphData.viewport.zoom || 1;
            this.panX = graphData.viewport.panX || 0;
            this.panY = graphData.viewport.panY || 0;
            this.updateViewportTransform();
        }

        // Restore nodes
        const nodeIdMap = new Map(); // Old ID -> New ID mapping
        graphData.nodes.forEach(nodeData => {
            const newNodeId = this.createNode(nodeData.type, nodeData.pos);
            nodeIdMap.set(nodeData.id, newNodeId);

            // Restore parameters
            const newNodeData = this.nodes.get(newNodeId);
            if (newNodeData) {
                newNodeData.parameters = nodeData.parameters || {};
                newNodeData.parameterBindings = nodeData.parameterBindings || {};
                newNodeData.isFlipped = nodeData.isFlipped || false;
                newNodeData.moduleName = nodeData.moduleName || null;
                newNodeData.moduleDefinition = nodeData.moduleDefinition || null;

                // Update visual appearance
                if (newNodeData.isFlipped) {
                    newNodeData.element.classList.add('flipped');
                }
                this.updateNodeParameterDisplay(newNodeId);

                // Restore parameter binding badges
                if (Object.keys(newNodeData.parameterBindings).length > 0) {
                    this.updateParameterBindingBadge(newNodeId);
                }
            }
        });

        // Restore connections
        graphData.connections.forEach(connData => {
            const fromNodeId = nodeIdMap.get(connData.from.nodeId);
            const toNodeId = nodeIdMap.get(connData.to.nodeId);

            if (fromNodeId && toNodeId) {
                const fromNode = this.nodes.get(fromNodeId);
                const toNode = this.nodes.get(toNodeId);

                if (fromNode && toNode) {
                    const fromPort = fromNode.element.querySelectorAll('.port.output')[connData.from.portIndex];
                    const toPort = toNode.element.querySelectorAll('.port.input')[connData.to.portIndex];

                    if (fromPort && toPort) {
                        const connection = {
                            nodeId: fromNodeId,
                            portType: connData.from.portType,
                            portIndex: connData.from.portIndex,
                            element: fromPort
                        };

                        const targetConnection = {
                            nodeId: toNodeId,
                            portType: connData.to.portType,
                            portIndex: connData.to.portIndex,
                            element: toPort
                        };

                        this.createConnection(connection, targetConnection);

                        // Restore wire name
                        const lastConn = this.connections[this.connections.length - 1];
                        if (lastConn && connData.wireName) {
                            lastConn.wireName = connData.wireName;
                        }
                    }
                }
            }
        });

        // Restore execution settings
        if (graphData.executionSettings) {
            document.getElementById('max-steps-input').value = graphData.executionSettings.maxSteps || 10;
        }

        // Plot node parameters were restored after node creation
        this.syncPlotPanel();

        // Trigger auto-compile
        this.scheduleAutoCompile();

        this.addOutput(`Graph loaded: ${this.graphName}\n`);
    }

    clearGraph() {
        // Remove all connections
        this.connections.forEach(conn => {
            if (conn.element && conn.element.parentNode) {
                conn.element.parentNode.removeChild(conn.element);
            }
        });
        this.connections = [];

        // Remove all nodes
        this.nodes.forEach((nodeData, nodeId) => {
            if (nodeData.element && nodeData.element.parentNode) {
                nodeData.element.parentNode.removeChild(nodeData.element);
            }
        });
        this.nodes.clear();
        this.syncPlotPanel();

        // Reset state
        this.nextNodeId = 1;
        this.clearSelection();
    }

    loadGraphAsModuleInstance(graphData, position) {
        // Analyze the graph to determine inputs, outputs, and parameters
        const inputNodes = [];
        const outputNodes = [];
        const paramNodes = [];

        graphData.nodes.forEach(nodeData => {
            if (nodeData.type === 'input') {
                inputNodes.push(nodeData);
            } else if (nodeData.type === 'output') {
                outputNodes.push(nodeData);
            } else if (nodeData.type === 'const' && nodeData.parameters?.isParam) {
                paramNodes.push(nodeData);
            }
        });

        // Create module instance node ID
        const moduleName = graphData.metadata?.name || 'module';
        const nodeId = `${moduleName}_${this.nextNodeId++}`;

        // Create custom node inputs/outputs based on the graph
        const inputs = inputNodes.map((node, idx) => `in_${idx}`);
        const outputs = outputNodes.map((node, idx) => `out_${idx}`);

        // Create module instance node
        const parameters = {
            modulePath: moduleName + '.mmgraph',
            ...graphData.executionSettings
        };

        const node = this.createModuleInstanceElement(moduleName, nodeId, position, parameters, inputs, outputs);

        this.nodes.set(nodeId, {
            id: nodeId,
            type: 'module_instance',
            element: node,
            pos: position,
            inputs: inputs,
            outputs: outputs,
            value: null,
            isFlipped: false,
            parameters: parameters,
            moduleName: moduleName,
            moduleDefinition: graphData // Store the entire graph definition
        });

        document.getElementById('viewport').appendChild(node);

        // Trigger validation and auto-compilation
        this.scheduleAutoCompile();

        this.addOutput(`Module instance created: ${moduleName}\n`);
    }

    createModuleInstanceElement(moduleName, id, pos, parameters, inputs, outputs) {
        const node = document.createElement('div');
        node.className = 'node module-instance';
        node.style.left = pos.x + 'px';
        node.style.top = pos.y + 'px';
        node.dataset.nodeId = id;

        node.innerHTML = `
            <div class="node-title">📦 ${moduleName}</div>
            <div class="node-params">${inputs.length} in, ${outputs.length} out</div>
        `;

        // Add input ports
        inputs.forEach((input, index) => {
            const port = document.createElement('div');
            port.className = 'port input';
            port.style.top = `${20 + index * 15}px`;
            port.dataset.portType = 'input';
            port.dataset.portIndex = index;
            node.appendChild(port);
        });

        // Add output ports
        outputs.forEach((output, index) => {
            const port = document.createElement('div');
            port.className = 'port output';
            port.style.top = `${20 + index * 15}px`;
            port.dataset.portType = 'output';
            port.dataset.portIndex = index;
            node.appendChild(port);
        });

        return node;
    }

    generateModuleDefinitionCode(graphData, moduleName) {
        // Generate code for a module definition from a saved graph
        let code = `module ${moduleName} {\n`;
        const addedWires = new Set();

        // Find input, output, and param nodes to generate declarations
        const inputNodes = graphData.nodes.filter(n => n.type === 'input');
        const outputNodes = graphData.nodes.filter(n => n.type === 'output');
        const paramNodes = graphData.nodes.filter(n => n.type === 'param');

        // Generate param declarations first
        paramNodes.forEach((paramNode) => {
            const paramName = paramNode.parameters?.name || 'param1';
            const defaultValue = paramNode.parameters?.defaultValue || 0;
            const alias = paramNode.parameters?.alias || '';

            if (alias) {
                // This param is an alias for another internal param
                code += `    param ${paramName} = ${defaultValue}  // alias for ${alias}\n`;
            } else {
                code += `    param ${paramName} = ${defaultValue}\n`;
            }
        });

        // Generate input declarations
        inputNodes.forEach((inputNode, idx) => {
            code += `    input in_${idx}\n`;
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

        // Generate output statements
        outputNodes.forEach((outputNode, idx) => {
            const connection = graphData.connections.find(c => c.to.nodeId === outputNode.id);
            if (connection) {
                code += `    output out_${idx} ${connection.wireName}\n`;
            }
        });

        code += '}';

        return code;
    }
}

// Initialize the editor when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new NodeEditor();
});
