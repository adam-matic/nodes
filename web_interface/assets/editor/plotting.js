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
});
