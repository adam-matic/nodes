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

        this.setupEventListeners();
        this.createSampleNodes();

        // API integration
        this.apiClient = window.apiClient;

        // Validation and auto-compilation
        this.validationErrors = [];
        this.autoCompileEnabled = true;
        this.compileTimeout = null;
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

        // Execution controls
        document.getElementById('compile-btn').addEventListener('click', () => this.compileCode());
        document.getElementById('run-btn').addEventListener('click', () => this.toggleRun());
        document.getElementById('step-btn').addEventListener('click', () => this.executeStep());
        document.getElementById('reset-btn').addEventListener('click', () => this.reset());
        document.getElementById('clear-output-btn').addEventListener('click', () => this.clearOutput());
        document.getElementById('copy-output-btn').addEventListener('click', () => this.copyOutput());

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.onKeyDown(e));
    }

    switchTab(tabName) {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

        document.getElementById('visual-tab').classList.toggle('hidden', tabName !== 'visual');
        document.getElementById('code-tab').classList.toggle('hidden', tabName !== 'code');
        document.getElementById('output-tab').classList.toggle('hidden', tabName !== 'output');

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
        }

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
        const node = this.createNodeElement(type, nodeId, pos);

        this.nodes.set(nodeId, {
            id: nodeId,
            type: type,
            element: node,
            pos: pos,
            inputs: this.getNodeInputs(type),
            outputs: this.getNodeOutputs(type),
            value: null,
            isFlipped: false,
            parameters: this.getDefaultParameters(type)
        });

        document.getElementById('viewport').appendChild(node);

        // Trigger validation and auto-compilation after node creation
        this.scheduleAutoCompile();

        return nodeId;
    }

    createNodeElement(type, id, pos) {
        const node = document.createElement('div');
        node.className = `node ${this.getNodeClass(type)}`;
        node.style.left = pos.x + 'px';
        node.style.top = pos.y + 'px';
        node.dataset.nodeId = id;

        node.innerHTML = `
            <div class="node-title">${type}</div>
            <div class="node-id">${id}</div>
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

    getNodeClass(type) {
        if (['add', 'sub', 'mul', 'div'].includes(type)) return 'arithmetic';
        if (type === 'mem') return 'memory';
        if (type === 'const') return 'constant';
        if (['gt', 'lt', 'eq', 'gte', 'lte'].includes(type)) return 'comparison';
        if (['input', 'output'].includes(type)) return 'io';
        return '';
    }

    getNodeInputs(type) {
        if (['add', 'sub', 'mul', 'div', 'gt', 'lt', 'eq'].includes(type)) return ['a', 'b'];
        if (type === 'mem') return ['signal'];
        if (type === 'output') return ['value'];
        return [];
    }

    getNodeOutputs(type) {
        if (type === 'input') return [];
        return ['out'];
    }

    nodeHasParameters(type) {
        // Define which node types have configurable parameters
        return ['mem', 'const'].includes(type);
    }

    getDefaultParameters(type) {
        switch (type) {
            case 'mem':
                return { initialValue: 0 };
            case 'const':
                return { value: 1 };
            default:
                return {};
        }
    }

    onMouseDown(e) {
        if (e.target.classList.contains('port')) {
            this.startConnection(e);
        } else if (e.target.closest('.node')) {
            const node = e.target.closest('.node');
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
            this.startPinchZoom(e);
        } else if (e.touches.length === 1) {
            const touch = e.touches[0];
            const target = document.elementFromPoint(touch.clientX, touch.clientY);

            if (target && target.classList.contains('port')) {
                this.startConnectionTouch(touch, target);
            } else if (target && target.closest('.node')) {
                const node = target.closest('.node');
                this.selectNode(node);
                this.startDragTouch(touch, target);
            } else {
                // Touched empty space - clear selection and start panning
                this.clearSelection();
                this.startPan(touch);
            }
        }
    }

    onTouchMove(e) {
        e.preventDefault(); // Prevent scrolling

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

        // Account for flipped nodes
        let startX;
        if (this.connectionStart.portType === 'output') {
            startX = startNode.isFlipped ?
                startNode.pos.x : // left edge when flipped
                startNode.pos.x + startNode.element.offsetWidth; // right edge when normal
        } else {
            startX = startNode.isFlipped ?
                startNode.pos.x + startNode.element.offsetWidth : // right edge when flipped
                startNode.pos.x; // left edge when normal
        }

        const startY = startPortY;

        // Convert touch position to world coordinates
        const editorRect = document.getElementById('visual-tab').getBoundingClientRect();
        const screenEndX = touch.clientX - editorRect.left;
        const screenEndY = touch.clientY - editorRect.top;
        const worldEnd = this.screenToWorld(screenEndX, screenEndY);

        const path = this.createConnectionPath(startX, startY, worldEnd.x, worldEnd.y);
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

        // Account for flipped nodes
        let startX;
        if (this.connectionStart.portType === 'output') {
            startX = startNode.isFlipped ?
                startNode.pos.x : // left edge when flipped
                startNode.pos.x + startNode.element.offsetWidth; // right edge when normal
        } else {
            startX = startNode.isFlipped ?
                startNode.pos.x + startNode.element.offsetWidth : // right edge when flipped
                startNode.pos.x; // left edge when normal
        }

        const startY = startPortY;

        // Convert mouse position to world coordinates
        const editorRect = document.getElementById('visual-tab').getBoundingClientRect();
        const screenEndX = e.clientX - editorRect.left;
        const screenEndY = e.clientY - editorRect.top;
        const worldEnd = this.screenToWorld(screenEndX, screenEndY);

        const path = this.createConnectionPath(startX, startY, worldEnd.x, worldEnd.y);
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

        const connection = {
            id: `conn_${this.connections.length}`,
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

        // Account for flipped nodes
        let startX, endX;

        if (connection.from.portType === 'output') {
            // From node output port
            startX = fromNode.isFlipped ?
                fromNode.pos.x : // left edge when flipped
                fromNode.pos.x + fromNode.element.offsetWidth; // right edge when normal
        } else {
            // From node input port
            startX = fromNode.isFlipped ?
                fromNode.pos.x + fromNode.element.offsetWidth : // right edge when flipped
                fromNode.pos.x; // left edge when normal
        }

        if (connection.to.portType === 'input') {
            // To node input port
            endX = toNode.isFlipped ?
                toNode.pos.x + toNode.element.offsetWidth : // right edge when flipped
                toNode.pos.x; // left edge when normal
        } else {
            // To node output port
            endX = toNode.isFlipped ?
                toNode.pos.x : // left edge when flipped
                toNode.pos.x + toNode.element.offsetWidth; // right edge when normal
        }

        const startY = fromPortY;
        const endY = toPortY;

        const path = this.createConnectionPath(startX, startY, endX, endY);
        connection.pathElement.setAttribute('d', path);

        // Update the invisible touch area with the same path
        if (connection.touchArea) {
            connection.touchArea.setAttribute('d', path);
        }

        // Position value text at midpoint
        const midX = (startX + endX) / 2;
        const midY = (startY + endY) / 2;
        connection.textElement.setAttribute('x', midX);
        connection.textElement.setAttribute('y', midY - 5);
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

        this.addOutput('Compiling code...\n');

        try {
            const result = await this.apiClient.compileCode(code);

            if (result.success) {
                this.addOutput(`✓ ${result.message}\n`);
                if (result.max_steps) {
                    this.maxSteps = result.max_steps;
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
                this.addOutput('Starting execution...\n');

                this.executionInterval = setInterval(async () => {
                    await this.executeStep();
                    if (this.currentStep >= (this.maxSteps || 10)) {
                        this.stopExecution();
                    }
                }, 500);
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

                // Update connection values with real data from server
                if (result.signals) {
                    this.updateConnectionValues(result.signals);
                }

                this.addOutput(`Step ${this.currentStep} executed\n`);
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
            // Try to match connection to signal by node types
            const fromNodeType = this.nodes.get(conn.from.nodeId)?.type;
            const signalKey = `${fromNodeType}_${conn.from.nodeId.split('_')[1]}_out`;

            let value = signals[signalKey];
            if (value === undefined) {
                // Fallback to index-based or random value
                const signalKeys = Object.keys(signals);
                value = signalKeys[index % signalKeys.length] ? signals[signalKeys[index % signalKeys.length]] : Math.random() * 10;
            }

            conn.value = value;
            conn.textElement.textContent = value.toString();
            conn.element.classList.add('active');
        });

        // Remove active class after a short delay
        setTimeout(() => {
            this.connections.forEach(conn => {
                conn.element.classList.remove('active');
            });
        }, 200);
    }


    async reset() {
        this.stopExecution();

        try {
            const result = await this.apiClient.resetProgram();

            this.currentStep = 0;
            document.getElementById('step-counter').textContent = 'Step: 0';
            document.getElementById('output').textContent = 'Ready to execute...\n';

            // Clear connection values
            this.connections.forEach(conn => {
                conn.value = null;
                conn.textElement.textContent = '';
                conn.element.classList.remove('active');
            });

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

        // Auto-switch to output tab when starting execution
        if (this.isRunning && text.includes('Starting execution')) {
            this.switchTab('output');
        }
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
            if (nodeData.type === 'output' || nodeData.type === 'const') {
                return; // These don't need inputs
            }

            const nodeInputs = this.getNodeInputs(nodeData.type);
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

        let code = 'module visual_graph {\n';
        const addedVariables = new Set();

        // Sort nodes for consistent ordering
        const sortedNodes = Array.from(this.nodes.values()).sort((a, b) => a.id.localeCompare(b.id));

        // Generate assignments for each node
        sortedNodes.forEach(nodeData => {
            if (nodeData.type === 'output') {
                // Find what's connected to this output
                const connection = this.connections.find(conn => conn.to.nodeId === nodeData.id);
                if (connection) {
                    const sourceVar = this.getVariableName(connection.from.nodeId, connection.from.portIndex);
                    code += `    output ${sourceVar}\n`;
                }
                return;
            }

            if (nodeData.type === 'const') {
                const varName = this.getVariableName(nodeData.id, 0);
                const value = nodeData.parameters.value || 1;
                // Ensure the value is a valid number
                const numValue = isNaN(value) ? 1 : Number(value);
                code += `    ${varName} = const(value=${numValue})\n`;
                addedVariables.add(varName);
                return;
            }

            // For other node types, find their inputs
            const nodeInputs = this.getNodeInputs(nodeData.type);
            const inputConnections = [];

            nodeInputs.forEach((inputName, inputIndex) => {
                const connection = this.connections.find(conn =>
                    conn.to.nodeId === nodeData.id && conn.to.portIndex === inputIndex
                );
                if (connection) {
                    inputConnections[inputIndex] = this.getVariableName(connection.from.nodeId, connection.from.portIndex);
                } else {
                    inputConnections[inputIndex] = '0'; // Default value for unconnected inputs
                }
            });

            if (inputConnections.length > 0) {
                const varName = this.getVariableName(nodeData.id, 0);
                if (!addedVariables.has(varName)) {
                    let params = inputConnections.join(', ');

                    // Special handling for mem nodes
                    if (nodeData.type === 'mem') {
                        const initialValue = nodeData.parameters.initialValue || 0;
                        const numInitialValue = isNaN(initialValue) ? 0 : Number(initialValue);
                        params = `${numInitialValue}, ${inputConnections[0] || '0'}`;
                    }

                    code += `    ${varName} = ${nodeData.type}(${params})\n`;
                    addedVariables.add(varName);
                }
            }
        });

        code += '}\n\n';
        code += 'execution {\n';
        code += '    max_steps: 10\n';

        // Add save variables for outputs
        const outputVariables = [];
        this.connections.forEach(conn => {
            const toNode = this.nodes.get(conn.to.nodeId);
            if (toNode && toNode.type === 'output') {
                const sourceVar = this.getVariableName(conn.from.nodeId, conn.from.portIndex);
                outputVariables.push(sourceVar);
            }
        });

        if (outputVariables.length > 0) {
            code += `    save: [${outputVariables.join(', ')}]\n`;
        }

        code += '}';

        return code;
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
            if (action === 'delete') {
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
            if (action === 'delete') {
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

    showConnectionInfo(connection) {
        const fromNode = this.nodes.get(connection.from.nodeId);
        const toNode = this.nodes.get(connection.to.nodeId);

        const info = `Connection Info:
From: ${fromNode?.type || 'unknown'} (${connection.from.nodeId})
To: ${toNode?.type || 'unknown'} (${connection.to.nodeId})
Current Value: ${connection.value || 'none'}`;

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
        }
    }
}

// Initialize the editor when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new NodeEditor();
});
