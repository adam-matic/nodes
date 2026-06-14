/**
 * Plot panel integration: keeps the Plots tab in sync with plot nodes.
 *
 * Part of the NodeEditor split (see docs/ROADMAP.md, Phase 3). Methods are
 * defined in a plain class expression and copied onto NodeEditor.prototype
 * by applyEditorMixin() (defined in app.js). Load after app.js.
 */
applyEditorMixin(class {
    getPlotYSignals(nodeData) {
        return (nodeData.parameters.signalY || '')
            .split(',')
            .map(s => s.trim())
            .filter(Boolean);
    }

    /** Rebuild the Plots tab and the inline node charts to match current plot nodes. */
    syncPlotPanel() {
        const configs = [];
        this.nodes.forEach((nodeData) => {
            if (nodeData.type !== 'plot') return;
            const config = {
                id: nodeData.id,
                title: nodeData.id,
                xSignal: nodeData.parameters.signalX || 'step',
                ySignals: this.getPlotYSignals(nodeData),
                maxPoints: parseInt(nodeData.parameters.historySize) || 1000
            };
            configs.push(config);
            this._syncInlinePlotView(nodeData, config);
        });

        this.plotPanel.sync(configs);

        // Destroy inline views whose plot node no longer exists
        if (this._inlinePlotViews) {
            const activeIds = new Set(configs.map(c => c.id));
            for (const [id, view] of this._inlinePlotViews) {
                if (!activeIds.has(id)) {
                    view.destroy();
                    this._inlinePlotViews.delete(id);
                }
            }
        }
    }

    /** Create or update the PlotView embedded in the plot node's DOM element. */
    _syncInlinePlotView(nodeData, config) {
        if (!this._inlinePlotViews) this._inlinePlotViews = new Map();

        const container = nodeData.element.querySelector('.node-inline-chart');
        if (!container) return;

        const inlineConfig = { ...config, compact: true };
        const existing = this._inlinePlotViews.get(nodeData.id);
        if (existing) {
            existing.setConfig(inlineConfig);
        } else {
            this._inlinePlotViews.set(nodeData.id, new PlotView(container, inlineConfig));
        }
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

            // Also push to the inline chart embedded in the node
            if (this._inlinePlotViews) {
                const inlineView = this._inlinePlotViews.get(nodeData.id);
                if (inlineView) inlineView.appendPoint(xValue, yValues);
            }
        });
    }

    /** Clear data from both the Plots tab and all inline node charts. */
    clearAllPlotData() {
        this.plotPanel.clearData();
        if (this._inlinePlotViews) {
            for (const view of this._inlinePlotViews.values()) view.clearData();
        }
    }
});
