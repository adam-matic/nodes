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
                moduleDefinition: nodeData.moduleDefinition || null,
                isLibrary: nodeData.isLibrary || false,
                libraryName: nodeData.libraryName || null,
                moduleSource: nodeData.moduleSource || null
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

        // Clear the graph (undoable)
        this.checkpoint();
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
                    const editorRect = this.canvasEl.getBoundingClientRect();
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
        // Replacing the current graph is undoable
        this.checkpoint();

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

        // Rebuild without recording per-node/per-connection undo entries
        this.history.suspend(() => {
            this.clearGraph();
            this.restoreGraphData(graphData);
        });

        // Restore execution settings
        if (graphData.executionSettings) {
            document.getElementById('max-steps-input').value = graphData.executionSettings.maxSteps || 10;
        }

        this.addOutput(`Graph loaded: ${this.graphName}\n`);
    }

    /**
     * Rebuild nodes and connections from serialized graph data, preserving
     * the original node ids (so parameter bindings and module references
     * stay valid). Used by file loading and undo/redo restores; the caller
     * is responsible for clearing the graph first.
     */
    restoreGraphData(graphData) {
        // Restore nodes
        graphData.nodes.forEach(nodeData => {
            let nodeId;
            if (nodeData.type === 'module_instance' && nodeData.isLibrary) {
                nodeId = this.createLibraryNode(
                    nodeData.libraryName, nodeData.pos, nodeData.id);
            } else if (nodeData.type === 'module_instance' && nodeData.moduleDefinition) {
                nodeId = this.createModuleInstanceNode(
                    nodeData.moduleDefinition, nodeData.pos, nodeData.id);
            } else {
                nodeId = this.createNode(nodeData.type, nodeData.pos, { id: nodeData.id });
            }
            if (nodeId === null) return; // library introspection failed; skip

            // Restore parameters
            const newNodeData = this.nodes.get(nodeId);
            if (newNodeData) {
                newNodeData.parameters = nodeData.parameters || {};
                newNodeData.parameterBindings = nodeData.parameterBindings || {};
                newNodeData.isFlipped = nodeData.isFlipped || false;
                newNodeData.moduleName = nodeData.moduleName || newNodeData.moduleName || null;
                newNodeData.moduleDefinition = nodeData.moduleDefinition || newNodeData.moduleDefinition || null;

                // Update visual appearance
                if (newNodeData.isFlipped) {
                    newNodeData.element.classList.add('flipped');
                }
                this.updateNodeParameterDisplay(nodeId);

                // Restore parameter binding badges
                if (Object.keys(newNodeData.parameterBindings).length > 0) {
                    this.updateParameterBindingBadge(nodeId);
                }
            }
        });

        // Restore connections
        graphData.connections.forEach(connData => {
            const fromNode = this.nodes.get(connData.from.nodeId);
            const toNode = this.nodes.get(connData.to.nodeId);
            if (!fromNode || !toNode) return;

            const fromPort = fromNode.element.querySelectorAll('.port.output')[connData.from.portIndex];
            const toPort = toNode.element.querySelectorAll('.port.input')[connData.to.portIndex];
            if (!fromPort || !toPort) return;

            this.createConnection(
                {
                    nodeId: connData.from.nodeId,
                    portType: connData.from.portType,
                    portIndex: connData.from.portIndex,
                    element: fromPort
                },
                {
                    nodeId: connData.to.nodeId,
                    portType: connData.to.portType,
                    portIndex: connData.to.portIndex,
                    element: toPort
                }
            );

            // Restore wire name
            const lastConn = this.connections[this.connections.length - 1];
            if (lastConn && connData.wireName) {
                lastConn.wireName = connData.wireName;
                this.updateConnection(lastConn);
            }
        });

        // Plot node parameters were restored after node creation
        this.syncPlotPanel();

        // Trigger auto-compile
        this.scheduleAutoCompile();
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
        this.checkpoint();
        const nodeId = this.createModuleInstanceNode(graphData, position);
        const moduleName = this.nodes.get(nodeId).moduleName;
        this.addOutput(`Module instance created: ${moduleName}\n`);
    }

    /** Create a module-instance node from a saved graph definition.
     *  Pass an explicit id when restoring a serialized state. */
    createModuleInstanceNode(graphData, position, id = null) {
        const inputNodes = [];
        const outputNodes = [];
        const paramNodes = [];

        graphData.nodes.forEach(nodeData => {
            if (nodeData.type === 'input') {
                inputNodes.push(nodeData);
            } else if (nodeData.type === 'output') {
                outputNodes.push(nodeData);
            } else if (nodeData.type === 'param') {
                paramNodes.push(nodeData);
            }
        });

        // Create module instance node ID (reuse the given one when restoring)
        const moduleName = graphData.metadata?.name || 'module';
        let nodeId;
        if (id) {
            nodeId = id;
            const num = parseInt(id.split('_').pop(), 10);
            if (!isNaN(num)) {
                this.nextNodeId = Math.max(this.nextNodeId, num + 1);
            }
        } else {
            nodeId = `${moduleName}_${this.nextNodeId++}`;
        }

        // Use port names from the input/output nodes, falling back to in_N / out_N
        const inputs = inputNodes.map((node, idx) =>
            (node.parameters?.name || '').trim() || `in_${idx}`);
        const outputs = outputNodes.map((node, idx) =>
            (node.parameters?.name || '').trim() || `out_${idx}`);

        // Collect param specs so the parameter panel can show editable fields
        const paramSpecs = paramNodes.map(n => ({
            name: n.parameters?.name || 'param',
            defaultValue: n.parameters?.defaultValue ?? 0
        }));

        const parameters = {
            modulePath: moduleName + '.mmgraph',
            paramSpecs,
            paramOverrides: {},
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

        return nodeId;
    }
});
