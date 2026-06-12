/**
 * Undo/redo for the node editor.
 *
 * UndoHistory is a small, DOM-free snapshot stack (unit-tested in
 * tests/js_history_test.js). The editor takes a checkpoint of the
 * serialized graph *before* each mutation; undo restores the most recent
 * snapshot that differs from the current state, so harmless checkpoints
 * (e.g. a click that starts a drag but never moves) never burn an undo
 * press.
 */
class UndoHistory {
    /**
     * @param {Object} options
     * @param {() => string} options.capture - returns the current state as a string
     * @param {(state: string) => void} options.restore - applies a captured state
     * @param {number} [options.limit] - max undo depth
     * @param {() => void} [options.onChange] - called whenever the stacks change
     */
    constructor({ capture, restore, limit = 100, onChange = null }) {
        this.capture = capture;
        this.restoreFn = restore;
        this.limit = limit;
        this.onChange = onChange;
        this.undoStack = [];
        this.redoStack = [];
        this.suspended = false;
    }

    get canUndo() {
        return this.undoStack.length > 0;
    }

    get canRedo() {
        return this.redoStack.length > 0;
    }

    /** Record the current state as an undo point. No-op while suspended
     *  (during restores) or when the state matches the latest undo point. */
    checkpoint() {
        if (this.suspended) return;
        const state = this.capture();
        if (this.undoStack.length && this.undoStack[this.undoStack.length - 1] === state) {
            return;
        }
        this.undoStack.push(state);
        if (this.undoStack.length > this.limit) {
            this.undoStack.shift();
        }
        this.redoStack = [];
        this._notify();
    }

    undo() {
        const current = this.capture();
        // Drop checkpoints identical to the current state (mutation that
        // followed them never happened, or was itself undone)
        while (this.undoStack.length &&
               this.undoStack[this.undoStack.length - 1] === current) {
            this.undoStack.pop();
        }
        if (!this.undoStack.length) {
            this._notify();
            return false;
        }
        this.redoStack.push(current);
        this._restore(this.undoStack.pop());
        this._notify();
        return true;
    }

    redo() {
        const current = this.capture();
        while (this.redoStack.length &&
               this.redoStack[this.redoStack.length - 1] === current) {
            this.redoStack.pop();
        }
        if (!this.redoStack.length) {
            this._notify();
            return false;
        }
        this.undoStack.push(current);
        this._restore(this.redoStack.pop());
        this._notify();
        return true;
    }

    /** Run fn without recording checkpoints (used while rebuilding the graph). */
    suspend(fn) {
        const previous = this.suspended;
        this.suspended = true;
        try {
            return fn();
        } finally {
            this.suspended = previous;
        }
    }

    /** Forget everything (e.g. after initial setup). */
    reset() {
        this.undoStack = [];
        this.redoStack = [];
        this._notify();
    }

    _restore(state) {
        this.suspend(() => this.restoreFn(state));
    }

    _notify() {
        if (this.onChange) this.onChange();
    }
}

// NodeEditor glue (skipped when loaded in Node for unit tests)
if (typeof applyEditorMixin !== 'undefined') {
    applyEditorMixin(class {
        /** Record an undo point of the current graph. Call before mutating.
         *  Cheap to call defensively: duplicates are deduped by UndoHistory. */
        checkpoint() {
            this.history.checkpoint();
        }

        /** Serialize the undoable graph state (not viewport/pan/zoom). */
        captureState() {
            const data = this.serializeGraph();
            return JSON.stringify({
                nodes: data.nodes,
                connections: data.connections
            });
        }

        restoreState(state) {
            const data = JSON.parse(state);
            this.clearGraph();
            this.restoreGraphData(data);
        }

        undo() {
            this.history.undo();
        }

        redo() {
            this.history.redo();
        }

        updateUndoRedoButtons() {
            const undoBtn = document.getElementById('undo-btn');
            const redoBtn = document.getElementById('redo-btn');
            if (undoBtn) undoBtn.disabled = !this.history.canUndo;
            if (redoBtn) redoBtn.disabled = !this.history.canRedo;
        }
    });
}

// Export for Node-based unit tests
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { UndoHistory };
}
