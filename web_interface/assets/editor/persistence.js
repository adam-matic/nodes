/**
 * Persistence: graph serialization, save/load, and module instances.
 *
 * Part of the NodeEditor split (see docs/ROADMAP.md, Phase 3). Methods are
 * defined in a plain class expression and copied onto NodeEditor.prototype
 * by applyEditorMixin() (defined in app.js). Load after app.js.
 */
applyEditorMixin(class {
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
});
