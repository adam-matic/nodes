/**
 * Canvas interaction: mouse/touch input, dragging, panning, zooming, context menus.
 *
 * Part of the NodeEditor split (see docs/ROADMAP.md, Phase 3). Methods are
 * defined in a plain class expression and copied onto NodeEditor.prototype
 * by applyEditorMixin() (defined in app.js). Load after app.js.
 */
applyEditorMixin(class {
    onMouseDown(e) {
        // Space-drag or middle-button drag pans the canvas
        if (this.spaceDown || e.button === 1) {
            e.preventDefault();
            this.mousePanning = true;
            this.startPan(e);
            return;
        }

        if (e.target.classList.contains('port')) {
            this.startConnection(e);
        } else if (e.target.closest('.node')) {
            const node = e.target.closest('.node');

            // Right-click - show context menu
            if (e.button === 2) {
                e.preventDefault();
                if (!this.selectedNodes.has(node.dataset.nodeId)) {
                    this.selectNode(node);
                }
                this.showNodeContextMenu(e, node);
                return;
            }

            this.selectNode(node, e.shiftKey);
            if (!e.shiftKey) {
                this.startDrag(e);
            }
        } else {
            // Clicked on empty space: start marquee selection
            if (!e.shiftKey) this.clearSelection();
            this.startMarquee(e);
        }
    }

    onMouseMove(e) {
        if (this.mousePanning) {
            this.updatePan(e);
        } else if (this.isDragging) {
            this.updateDrag(e);
        } else if (this.isConnecting) {
            this.updateTempConnection(e);
        } else if (this.isMarqueeSelecting) {
            this.updateMarquee(e);
        }
    }

    onMouseUp(e) {
        if (this.mousePanning) {
            this.mousePanning = false;
            this.finishPan();
        } else if (this.isConnecting) {
            this.finishConnection(e);
        } else if (this.isDragging) {
            this.finishDrag(e);
        } else if (this.isMarqueeSelecting) {
            this.finishMarquee(e);
        }
    }

    // Mouse-wheel zoom centered on the cursor
    onWheel(e) {
        e.preventDefault();

        const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
        const newZoom = Math.max(0.1, Math.min(5, this.zoom * factor));
        if (newZoom === this.zoom) return;

        // Keep the world point under the cursor fixed while zooming
        const rect = this.canvasEl.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;
        const world = this.screenToWorld(screenX, screenY);

        this.zoom = newZoom;
        this.panX = screenX - world.x * this.zoom;
        this.panY = screenY - world.y * this.zoom;
        this.clampPan();

        this.updateViewportTransform();
        this.updateConnections();
    }

    clampPan() {
        // Same limits as touch panning: a little headroom up, lots elsewhere
        this.panY = Math.max(-5000, Math.min(100, this.panY));
        this.panX = Math.max(-5000, Math.min(5000, this.panX));
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

        const nodeId = node.dataset.nodeId;
        if (!this.selectedNodes.has(nodeId)) {
            this.selectNode(node);
        }

        this.checkpoint();
        this.isDragging = true;
        this.selectedNode = node;

        const rect = node.getBoundingClientRect();
        this.dragOffset = {
            x: touch.clientX - rect.left,
            y: touch.clientY - rect.top
        };

        const nodeData = this.nodes.get(nodeId);
        this.dragStartPos = nodeData ? { x: nodeData.pos.x, y: nodeData.pos.y } : null;
        this.dragStartPositions = new Map();
        for (const selId of this.selectedNodes) {
            const selData = this.nodes.get(selId);
            if (selData) {
                this.dragStartPositions.set(selId, { x: selData.pos.x, y: selData.pos.y });
                selData.element.classList.add('dragging');
            }
        }
    }

    updateDragTouch(touch) {
        if (!this.selectedNode || !this.dragStartPos || !this.dragStartPositions) return;

        const nodeEditor = this.canvasEl;
        const editorRect = nodeEditor.getBoundingClientRect();

        const screenX = touch.clientX - editorRect.left - this.dragOffset.x;
        const screenY = touch.clientY - editorRect.top - this.dragOffset.y;
        const worldPos = this.screenToWorld(screenX, screenY);

        const dx = worldPos.x - this.dragStartPos.x;
        const dy = worldPos.y - this.dragStartPos.y;

        for (const [selId, startPos] of this.dragStartPositions) {
            const selData = this.nodes.get(selId);
            if (!selData) continue;
            const newPos = { x: startPos.x + dx, y: startPos.y + dy };
            selData.element.style.left = newPos.x + 'px';
            selData.element.style.top = newPos.y + 'px';
            selData.pos = newPos;
        }

        this.updateConnections();
    }

    finishDragTouch() {
        if (this.selectedNode) {
            for (const selId of this.selectedNodes) {
                const selData = this.nodes.get(selId);
                if (selData) selData.element.classList.remove('dragging');
            }
            this.selectedNode = null;
        }
        this.isDragging = false;
        this.dragStartPos = null;
        this.dragStartPositions = null;
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
        // Same logic as the mouse version; both only use clientX/clientY
        this.updateTempConnection(touch);
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
        this.clampPan();

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

        const nodeId = node.dataset.nodeId;
        // If dragging a node not in the current selection, switch selection to it
        if (!this.selectedNodes.has(nodeId)) {
            this.selectNode(node);
        }

        this.checkpoint();
        this.isDragging = true;
        this.selectedNode = node;

        const rect = node.getBoundingClientRect();
        this.dragOffset = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };

        // Record world start positions for all selected nodes (for multi-drag)
        const nodeData = this.nodes.get(nodeId);
        this.dragStartPos = nodeData ? { x: nodeData.pos.x, y: nodeData.pos.y } : null;
        this.dragStartPositions = new Map();
        for (const selId of this.selectedNodes) {
            const selData = this.nodes.get(selId);
            if (selData) {
                this.dragStartPositions.set(selId, { x: selData.pos.x, y: selData.pos.y });
                selData.element.classList.add('dragging');
            }
        }
    }

    updateDrag(e) {
        if (!this.selectedNode || !this.dragStartPos || !this.dragStartPositions) return;

        const nodeEditor = this.canvasEl;
        const editorRect = nodeEditor.getBoundingClientRect();

        const screenX = e.clientX - editorRect.left - this.dragOffset.x;
        const screenY = e.clientY - editorRect.top - this.dragOffset.y;
        const worldPos = this.screenToWorld(screenX, screenY);

        // Delta from primary node's starting world position
        const dx = worldPos.x - this.dragStartPos.x;
        const dy = worldPos.y - this.dragStartPos.y;

        // Move all selected nodes by the same delta
        for (const [selId, startPos] of this.dragStartPositions) {
            const selData = this.nodes.get(selId);
            if (!selData) continue;
            const newPos = { x: startPos.x + dx, y: startPos.y + dy };
            selData.element.style.left = newPos.x + 'px';
            selData.element.style.top = newPos.y + 'px';
            selData.pos = newPos;
        }

        this.updateConnections();
    }

    finishDrag(e) {
        if (this.selectedNode) {
            for (const selId of this.selectedNodes) {
                const selData = this.nodes.get(selId);
                if (selData) selData.element.classList.remove('dragging');
            }
            this.selectedNode = null;
        }
        this.isDragging = false;
        this.dragStartPos = null;
        this.dragStartPositions = null;
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

        const anchor = this.getPortAnchor(startNode,
            this.connectionStart.portType, this.connectionStart.portIndex);

        // Convert pointer position to world coordinates
        const editorRect = this.canvasEl.getBoundingClientRect();
        const worldEnd = this.screenToWorld(
            e.clientX - editorRect.left, e.clientY - editorRect.top);

        const path = this.createConnectionPath(
            anchor.x, anchor.y, worldEnd.x, worldEnd.y, anchor.dir);
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
        this.updateToolbarButtonStates();
    }

    onConnectionRightClick(e, connection) {
        e.preventDefault();
        e.stopPropagation();

        // Show context menu for connection
        this.showConnectionContextMenu(e, connection);
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

    // ── Marquee (rubber-band) selection ───────────────────────────────────

    startMarquee(e) {
        const rect = this.canvasEl.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;

        this.isMarqueeSelecting = true;
        this.marqueeStartScreen = { x: sx, y: sy };

        this.marqueeEl = document.createElement('div');
        this.marqueeEl.className = 'marquee-rect';
        this.marqueeEl.style.left = sx + 'px';
        this.marqueeEl.style.top  = sy + 'px';
        this.marqueeEl.style.width  = '0px';
        this.marqueeEl.style.height = '0px';
        this.canvasEl.appendChild(this.marqueeEl);
    }

    updateMarquee(e) {
        if (!this.isMarqueeSelecting || !this.marqueeEl) return;

        const rect = this.canvasEl.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;

        const x1 = Math.min(sx, this.marqueeStartScreen.x);
        const y1 = Math.min(sy, this.marqueeStartScreen.y);
        const x2 = Math.max(sx, this.marqueeStartScreen.x);
        const y2 = Math.max(sy, this.marqueeStartScreen.y);

        this.marqueeEl.style.left   = x1 + 'px';
        this.marqueeEl.style.top    = y1 + 'px';
        this.marqueeEl.style.width  = (x2 - x1) + 'px';
        this.marqueeEl.style.height = (y2 - y1) + 'px';

        // Live-update which nodes are inside the rect
        const w1 = this.screenToWorld(x1, y1);
        const w2 = this.screenToWorld(x2, y2);

        for (const [id, data] of this.nodes) {
            const nx = data.pos.x;
            const ny = data.pos.y;
            const nw = data.element.offsetWidth  || 120;
            const nh = data.element.offsetHeight || 60;
            const inside = nx < w2.x && nx + nw > w1.x && ny < w2.y && ny + nh > w1.y;

            if (inside) {
                if (!this.selectedNodes.has(id)) {
                    this.selectedNodes.add(id);
                    data.element.classList.add('selected');
                }
            } else {
                if (this.selectedNodes.has(id)) {
                    this.selectedNodes.delete(id);
                    data.element.classList.remove('selected');
                }
            }
        }
        this.updateToolbarButtonStates();
    }

    finishMarquee(e) {
        if (!this.isMarqueeSelecting) return;

        if (this.marqueeEl) {
            this.marqueeEl.remove();
            this.marqueeEl = null;
        }
        this.isMarqueeSelecting = false;
        this.marqueeStartScreen = null;

        // Set selectedNodeForHighlight to one of the selected nodes (or null)
        if (this.selectedNodes.size === 1) {
            const id = Array.from(this.selectedNodes)[0];
            this.selectedNodeForHighlight = this.nodes.get(id)?.element || null;
        } else {
            this.selectedNodeForHighlight = null;
        }

        if (this.selectedNodes.size === 1) {
            this.showNodeActions(this.selectedNodeForHighlight);
        } else {
            this.hideNodeActions();
        }
        this.updateToolbarButtonStates();
    }

    // ── Zoom to fit ──────────────────────────────────────────────────────

    zoomToFit() {
        if (this.nodes.size === 0) return;

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const [, data] of this.nodes) {
            const x = data.pos.x;
            const y = data.pos.y;
            const w = data.element.offsetWidth  || 120;
            const h = data.element.offsetHeight || 60;
            if (x       < minX) minX = x;
            if (y       < minY) minY = y;
            if (x + w   > maxX) maxX = x + w;
            if (y + h   > maxY) maxY = y + h;
        }

        const PAD = 60;
        const contentW = maxX - minX;
        const contentH = maxY - minY;
        const canvasRect = this.canvasEl.getBoundingClientRect();
        const cW = canvasRect.width;
        const cH = canvasRect.height;

        const zoom = Math.min(
            (cW - 2 * PAD) / (contentW || 1),
            (cH - 2 * PAD) / (contentH || 1),
            2
        );
        this.zoom = Math.max(0.1, zoom);
        this.panX = (cW - contentW * this.zoom) / 2 - minX * this.zoom;
        this.panY = (cH - contentH * this.zoom) / 2 - minY * this.zoom;

        this.updateViewportTransform();
        this.updateConnections();
    }
});
