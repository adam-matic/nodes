/**
 * Graph model: node and connection creation, deletion, and metadata.
 *
 * Part of the NodeEditor split (see docs/ROADMAP.md, Phase 3). Methods are
 * defined in a plain class expression and copied onto NodeEditor.prototype
 * by applyEditorMixin() (defined in app.js). Load after app.js.
 */
applyEditorMixin(class {
    deleteSelectedNode() {
        if (!this.selectedNodeForHighlight) return;

        this.checkpoint();

        const nodeId = this.selectedNodeForHighlight.dataset.nodeId;
        const nodeData = this.nodes.get(nodeId);

        // If deleting a param node, remove all bindings to it
        if (nodeData && nodeData.type === 'param') {
            this.removeParameterBindings(nodeId);
        }

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
        this.hideNodeActions();
        this.updateToolbarButtonStates();

        // Trigger validation and auto-compilation
        this.scheduleAutoCompile();
    }
    flipSelectedNode() {
        if (!this.selectedNodeForHighlight) return;

        const nodeId = this.selectedNodeForHighlight.dataset.nodeId;
        const nodeData = this.nodes.get(nodeId);

        if (!nodeData) return;

        this.checkpoint();

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
    duplicateSelectedNode() {
        if (!this.selectedNodeForHighlight) return;

        const nodeId = this.selectedNodeForHighlight.dataset.nodeId;
        const nodeData = this.nodes.get(nodeId);
        if (!nodeData) return;

        const pos = { x: nodeData.pos.x + 40, y: nodeData.pos.y + 40 };

        let newId;
        if (nodeData.type === 'module_instance' && nodeData.moduleDefinition) {
            this.checkpoint();
            newId = this.createModuleInstanceNode(nodeData.moduleDefinition, pos);
        } else {
            newId = this.createNode(nodeData.type, pos); // checkpoints internally
            const copy = this.nodes.get(newId);
            copy.parameters = JSON.parse(JSON.stringify(nodeData.parameters || {}));
            copy.isFlipped = !!nodeData.isFlipped;
            if (copy.isFlipped) {
                copy.element.classList.add('flipped');
            }
            this.updateNodeParameterDisplay(newId);
            if (copy.type === 'plot') {
                this.syncPlotPanel(); // pick up the copied plot parameters
            }
        }

        // Select the copy so it can be moved/edited right away
        this.selectNode(this.nodes.get(newId).element);
        this.scheduleAutoCompile();
    }
    createNode(type, pos, options = {}) {
        this.checkpoint();

        let nodeId;
        if (options.id) {
            // Restoring a saved/undo state: keep the original id so
            // references like parameter bindings stay valid
            nodeId = options.id;
            const num = parseInt(nodeId.split('_').pop(), 10);
            if (!isNaN(num)) {
                this.nextNodeId = Math.max(this.nextNodeId, num + 1);
            }
        } else {
            nodeId = `${type}_${this.nextNodeId++}`;
        }
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
    createConnection(from, to) {
        this.checkpoint();

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
        // Obstacle rects are shared by every wire; compute them once
        const obstacles = this.getObstacleRects();
        this.connections.forEach(conn => this.updateConnection(conn, obstacles));
    }

    /**
     * World-space anchor of a port (at the node edge) plus the horizontal
     * direction the port faces (+1 right, -1 left), accounting for flipped
     * nodes.
     */
    getPortAnchor(nodeData, portType, portIndex) {
        const y = nodeData.pos.y + 20 + portIndex * 15 + 6; // center of port
        const onLeft = (portType === 'input') !== !!nodeData.isFlipped;
        return onLeft
            ? { x: nodeData.pos.x, y: y, dir: -1 }
            : { x: nodeData.pos.x + nodeData.element.offsetWidth, y: y, dir: 1 };
    }

    /** Bounding boxes of all nodes, used as wire-routing obstacles. */
    getObstacleRects() {
        const rects = [];
        this.nodes.forEach(nodeData => {
            rects.push({
                x: nodeData.pos.x,
                y: nodeData.pos.y,
                w: nodeData.element.offsetWidth,
                h: nodeData.element.offsetHeight
            });
        });
        return rects;
    }

    updateConnection(connection, obstacles = null) {
        const fromNode = this.nodes.get(connection.from.nodeId);
        const toNode = this.nodes.get(connection.to.nodeId);

        if (!fromNode || !toNode) return;

        // Route the wire so it leaves/enters on the side each port faces
        // and detours around node boxes (see editor/routing.js)
        const route = WireRouter.route({
            start: this.getPortAnchor(fromNode, connection.from.portType, connection.from.portIndex),
            end: this.getPortAnchor(toNode, connection.to.portType, connection.to.portIndex),
            obstacles: obstacles || this.getObstacleRects()
        });

        connection.pathElement.setAttribute('d', route.path);

        // Update the invisible touch area with the same path
        if (connection.touchArea) {
            connection.touchArea.setAttribute('d', route.path);
        }

        // Wire label on the longest run of the wire, showing "wireName=value"
        connection.textElement.setAttribute('x', route.label.x);
        connection.textElement.setAttribute('y', route.label.y - 5);

        // Update text content to show wire name and value
        const displayText = connection.value !== null ?
            `${connection.wireName}=${connection.value}` :
            connection.wireName;
        connection.textElement.textContent = displayText;
    }

    /** Simple bezier for the temporary wire while dragging a new connection;
     *  finished wires are routed by WireRouter (see updateConnection). */
    createConnectionPath(x1, y1, x2, y2, dir = 1) {
        const reach = Math.max(40, Math.abs(x2 - x1) / 2);
        return `M ${x1} ${y1} C ${x1 + dir * reach} ${y1}, ${(x1 + x2) / 2} ${y2}, ${x2} ${y2}`;
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
    deleteConnection(connection) {
        this.checkpoint();

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
            this.checkpoint();
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

    deleteSelected() {
        if (this.selectedConnection) {
            this.deleteConnection(this.selectedConnection);
            this.selectedConnection = null;
            this.updateToolbarButtonStates();
            return;
        }

        if (this.selectedNodeForHighlight) {
            this.deleteSelectedNode();
        }
    }
});
