/**
 * Plot panel for the visual editor (roadmap Phase 2).
 *
 * Hand-rolled canvas plotting: no dependencies and no build step, so the
 * page stays fully static. The "Plots" tab holds one PlotView per plot
 * node in the graph; PlotPanel keeps the views in sync with the graph and
 * receives data points as the simulation steps.
 *
 * Interaction: mouse wheel zooms around the cursor, dragging pans,
 * double-click (or the Fit button) returns to autoscale. While autoscale
 * is active the view follows incoming data, so plots update live during
 * runs. Each plot can export its data as CSV or its image as PNG.
 */

const PLOT_COLORS = [
    '#2196F3', '#F44336', '#4CAF50', '#FF9800',
    '#9C27B0', '#00BCD4', '#795548', '#607D8B'
];

const PLOT_MARGIN      = { top: 14, right: 14, bottom: 28, left: 58 };
const PLOT_MARGIN_COMPACT = { top: 6, right: 6, bottom: 20, left: 42 };

class PlotView {
    constructor(parent, config) {
        this.config = { id: '', title: '', xSignal: 'step', ySignals: [], maxPoints: 1000 };
        this.xData = [];
        this.yData = []; // one array per Y signal, aligned with xData
        this.view = null; // null = autoscale; otherwise {xMin, xMax, yMin, yMax}
        this.renderQueued = false;

        this.root = document.createElement('div');
        this.root.className = 'plot-card';
        this.root.innerHTML = `
            <div class="plot-card-header">
                <span class="plot-card-title"></span>
                <span class="plot-card-info"></span>
                <span class="plot-card-spacer"></span>
                <button class="btn btn-secondary plot-btn-fit" title="Reset zoom to fit the data (or double-click the plot)">Fit</button>
                <button class="btn btn-secondary plot-btn-csv" title="Download the data as CSV">CSV</button>
                <button class="btn btn-secondary plot-btn-png" title="Download the image as PNG">PNG</button>
            </div>
            <div class="plot-card-body">
                <canvas></canvas>
                <div class="plot-card-hint hidden"></div>
            </div>
        `;
        parent.appendChild(this.root);

        this.canvas = this.root.querySelector('canvas');
        this.body = this.root.querySelector('.plot-card-body');
        this.hint = this.root.querySelector('.plot-card-hint');

        this.root.querySelector('.plot-btn-fit').addEventListener('click', () => this.fitView());
        this.root.querySelector('.plot-btn-csv').addEventListener('click', () => this.exportCSV());
        this.root.querySelector('.plot-btn-png').addEventListener('click', () => this.exportPNG());

        this.canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
        this.canvas.addEventListener('mousedown', (e) => this.onPanStart(e));
        this.canvas.addEventListener('dblclick', () => this.fitView());

        this.resizeObserver = new ResizeObserver(() => this.requestRender());
        this.resizeObserver.observe(this.body);

        this.setConfig(config);
    }

    setConfig(config) {
        const signalsChanged =
            JSON.stringify(config.ySignals) !== JSON.stringify(this.config.ySignals) ||
            config.xSignal !== this.config.xSignal;

        this.config = config;

        this.root.querySelector('.plot-card-title').textContent = config.title;
        this.root.querySelector('.plot-card-info').textContent =
            config.ySignals.length ? `${config.ySignals.join(', ')}  vs  ${config.xSignal}` : '';

        if (config.ySignals.length === 0) {
            this.hint.textContent = 'No Y signal configured — set "Y Signals" in the plot node’s parameters.';
            this.hint.classList.remove('hidden');
        } else {
            this.hint.classList.add('hidden');
        }

        if (signalsChanged) {
            this.clearData();
        } else {
            this.trim();
            this.requestRender();
        }
    }

    clearData() {
        this.xData = [];
        this.yData = this.config.ySignals.map(() => []);
        this.requestRender();
    }

    appendPoint(x, ys) {
        if (ys.length !== this.yData.length) return; // stale config, sync pending
        this.xData.push(x);
        ys.forEach((y, i) => this.yData[i].push(y));
        this.trim();
        this.requestRender();
    }

    trim() {
        const maxPoints = this.config.maxPoints;
        if (!maxPoints || maxPoints <= 0) return;
        while (this.xData.length > maxPoints) {
            this.xData.shift();
            this.yData.forEach(arr => arr.shift());
        }
    }

    fitView() {
        this.view = null;
        this.requestRender();
    }

    // --- View math ---------------------------------------------------------

    autoView() {
        let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
        for (let i = 0; i < this.xData.length; i++) {
            const x = this.xData[i];
            if (!Number.isFinite(x)) continue;
            for (const series of this.yData) {
                const y = series[i];
                if (!Number.isFinite(y)) continue;
                if (x < xMin) xMin = x;
                if (x > xMax) xMax = x;
                if (y < yMin) yMin = y;
                if (y > yMax) yMax = y;
            }
        }
        if (!Number.isFinite(xMin) || !Number.isFinite(yMin)) {
            return { xMin: 0, xMax: 10, yMin: -1, yMax: 1 };
        }
        let xSpan = xMax - xMin;
        if (xSpan === 0) xSpan = Math.abs(xMax) || 1;
        let ySpan = yMax - yMin;
        if (ySpan === 0) ySpan = Math.abs(yMax) || 1;
        return {
            xMin: xMin - xSpan * 0.05,
            xMax: xMax + xSpan * 0.05,
            yMin: yMin - ySpan * 0.05,
            yMax: yMax + ySpan * 0.05
        };
    }

    currentView() {
        return this.view || this.autoView();
    }

    plotRect() {
        const m = this.config.compact ? PLOT_MARGIN_COMPACT : PLOT_MARGIN;
        return {
            x: m.left,
            y: m.top,
            w: this.body.clientWidth  - m.left - m.right,
            h: this.body.clientHeight - m.top  - m.bottom
        };
    }

    // --- Interaction -------------------------------------------------------

    onWheel(e) {
        e.preventDefault();
        const v = this.currentView();
        const rect = this.canvas.getBoundingClientRect();
        const area = this.plotRect();
        if (area.w <= 0 || area.h <= 0) return;

        const fx = Math.min(1, Math.max(0, (e.clientX - rect.left - area.x) / area.w));
        const fy = Math.min(1, Math.max(0, (e.clientY - rect.top - area.y) / area.h));
        const dataX = v.xMin + fx * (v.xMax - v.xMin);
        const dataY = v.yMax - fy * (v.yMax - v.yMin);

        const factor = e.deltaY < 0 ? 0.8 : 1.25;
        this.view = {
            xMin: dataX - (dataX - v.xMin) * factor,
            xMax: dataX + (v.xMax - dataX) * factor,
            yMin: dataY - (dataY - v.yMin) * factor,
            yMax: dataY + (v.yMax - dataY) * factor
        };
        this.requestRender();
    }

    onPanStart(e) {
        if (e.button !== 0) return;
        e.preventDefault();
        const start = { x: e.clientX, y: e.clientY };
        const startView = { ...this.currentView() };
        const area = this.plotRect();
        if (area.w <= 0 || area.h <= 0) return;

        this.canvas.classList.add('panning');

        const onMove = (me) => {
            const dx = (me.clientX - start.x) / area.w * (startView.xMax - startView.xMin);
            const dy = (me.clientY - start.y) / area.h * (startView.yMax - startView.yMin);
            this.view = {
                xMin: startView.xMin - dx,
                xMax: startView.xMax - dx,
                yMin: startView.yMin + dy,
                yMax: startView.yMax + dy
            };
            this.requestRender();
        };
        const onUp = () => {
            this.canvas.classList.remove('panning');
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    }

    // --- Rendering ---------------------------------------------------------

    requestRender() {
        if (this.renderQueued) return;
        this.renderQueued = true;
        requestAnimationFrame(() => {
            this.renderQueued = false;
            this.render();
        });
    }

    render() {
        const w = this.body.clientWidth;
        const h = this.body.clientHeight;
        if (w === 0 || h === 0) return; // tab is hidden

        const dpr = window.devicePixelRatio || 1;
        if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
            this.canvas.width = Math.round(w * dpr);
            this.canvas.height = Math.round(h * dpr);
        }

        const ctx = this.canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);

        const area = this.plotRect();
        if (area.w < 10 || area.h < 10) return;

        const v = this.currentView();
        const sx = (x) => area.x + (x - v.xMin) / (v.xMax - v.xMin) * area.w;
        const sy = (y) => area.y + (v.yMax - y) / (v.yMax - v.yMin) * area.h;

        this.drawAxes(ctx, v, area, sx, sy);
        this.drawTraces(ctx, area, sx, sy);
        this.drawLegend(ctx, area);

        if (this.xData.length === 0 && this.config.ySignals.length > 0) {
            ctx.fillStyle = '#999';
            ctx.font = '13px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('No data yet — run the simulation', area.x + area.w / 2, area.y + area.h / 2);
        }
    }

    drawAxes(ctx, v, area, sx, sy) {
        const xTicks = PlotView.niceTicks(v.xMin, v.xMax, Math.max(2, Math.floor(area.w / 80)));
        const yTicks = PlotView.niceTicks(v.yMin, v.yMax, Math.max(2, Math.floor(area.h / 45)));

        ctx.lineWidth = 1;
        ctx.font = '11px Arial';

        // Grid lines and tick labels
        xTicks.values.forEach(t => {
            const px = sx(t);
            ctx.strokeStyle = '#e8e8e8';
            ctx.beginPath();
            ctx.moveTo(px, area.y);
            ctx.lineTo(px, area.y + area.h);
            ctx.stroke();
            ctx.fillStyle = '#666';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText(PlotView.formatTick(t, xTicks.step), px, area.y + area.h + 6);
        });
        yTicks.values.forEach(t => {
            const py = sy(t);
            ctx.strokeStyle = '#e8e8e8';
            ctx.beginPath();
            ctx.moveTo(area.x, py);
            ctx.lineTo(area.x + area.w, py);
            ctx.stroke();
            ctx.fillStyle = '#666';
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            ctx.fillText(PlotView.formatTick(t, yTicks.step), area.x - 7, py);
        });

        // Zero lines, slightly darker than the grid
        ctx.strokeStyle = '#bbb';
        if (v.yMin < 0 && v.yMax > 0) {
            const py = sy(0);
            ctx.beginPath();
            ctx.moveTo(area.x, py);
            ctx.lineTo(area.x + area.w, py);
            ctx.stroke();
        }
        if (v.xMin < 0 && v.xMax > 0) {
            const px = sx(0);
            ctx.beginPath();
            ctx.moveTo(px, area.y);
            ctx.lineTo(px, area.y + area.h);
            ctx.stroke();
        }

        // Border around the plot area
        ctx.strokeStyle = '#999';
        ctx.strokeRect(area.x + 0.5, area.y + 0.5, area.w - 1, area.h - 1);
    }

    drawTraces(ctx, area, sx, sy) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(area.x, area.y, area.w, area.h);
        ctx.clip();

        const drawMarkers = this.xData.length <= 60;

        this.yData.forEach((series, si) => {
            const color = PLOT_COLORS[si % PLOT_COLORS.length];
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.5;
            ctx.lineJoin = 'round';
            ctx.beginPath();
            let started = false;
            for (let i = 0; i < this.xData.length; i++) {
                const x = this.xData[i];
                const y = series[i];
                if (!Number.isFinite(x) || !Number.isFinite(y)) {
                    started = false; // break the line at gaps
                    continue;
                }
                if (started) {
                    ctx.lineTo(sx(x), sy(y));
                } else {
                    ctx.moveTo(sx(x), sy(y));
                    started = true;
                }
            }
            ctx.stroke();

            if (drawMarkers) {
                ctx.fillStyle = color;
                for (let i = 0; i < this.xData.length; i++) {
                    const x = this.xData[i];
                    const y = series[i];
                    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
                    ctx.beginPath();
                    ctx.arc(sx(x), sy(y), 2, 0, 2 * Math.PI);
                    ctx.fill();
                }
            }
        });

        ctx.restore();
    }

    drawLegend(ctx, area) {
        if (this.config.ySignals.length < 2) return; // single trace is described in the header

        ctx.font = '11px Arial';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';

        const entries = this.config.ySignals.map((name, i) => ({
            name,
            color: PLOT_COLORS[i % PLOT_COLORS.length],
            width: 18 + ctx.measureText(name).width + 12
        }));
        const totalWidth = entries.reduce((sum, e) => sum + e.width, 0);

        let x = area.x + 8;
        const y = area.y + 12;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.fillRect(x - 4, y - 9, totalWidth + 4, 18);

        entries.forEach(entry => {
            ctx.strokeStyle = entry.color;
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + 14, y);
            ctx.stroke();
            ctx.fillStyle = '#333';
            ctx.fillText(entry.name, x + 18, y);
            x += entry.width;
        });
    }

    static niceTicks(min, max, maxCount) {
        const span = max - min;
        if (!(span > 0) || !Number.isFinite(span)) return { values: [], step: 1 };

        const rawStep = span / Math.max(1, maxCount);
        const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
        const normalized = rawStep / magnitude;
        let step;
        if (normalized <= 1.5) step = 1;
        else if (normalized <= 3.5) step = 2;
        else if (normalized <= 7.5) step = 5;
        else step = 10;
        step *= magnitude;

        const values = [];
        const first = Math.ceil(min / step);
        const last = Math.floor(max / step + 1e-9);
        for (let i = first; i <= last; i++) {
            values.push(i * step);
        }
        return { values, step };
    }

    static formatTick(value, step) {
        if (value === 0) return '0';
        const abs = Math.abs(value);
        if (abs >= 1e6 || abs < 1e-4) return value.toExponential(1);
        const decimals = Math.min(6, Math.max(0, -Math.floor(Math.log10(step))));
        let text = value.toFixed(decimals);
        if (text.indexOf('.') >= 0) {
            text = text.replace(/0+$/, '').replace(/\.$/, '');
        }
        return text;
    }

    // --- Export ------------------------------------------------------------

    exportCSV() {
        const header = [this.config.xSignal, ...this.config.ySignals];
        const lines = [header.join(',')];
        for (let i = 0; i < this.xData.length; i++) {
            const row = [this.xData[i]];
            this.yData.forEach(series => {
                row.push(Number.isFinite(series[i]) ? series[i] : '');
            });
            lines.push(row.join(','));
        }
        const blob = new Blob([lines.join('\n') + '\n'], { type: 'text/csv' });
        PlotView.download(URL.createObjectURL(blob), `${this.config.id}.csv`, true);
    }

    exportPNG() {
        this.render(); // make sure the canvas is current
        if (this.canvas.width === 0) return;
        PlotView.download(this.canvas.toDataURL('image/png'), `${this.config.id}.png`, false);
    }

    static download(url, filename, revoke) {
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        if (revoke) URL.revokeObjectURL(url);
    }

    destroy() {
        this.resizeObserver.disconnect();
        this.root.remove();
    }
}

class PlotPanel {
    constructor(container) {
        this.container = container;
        this.views = new Map(); // plot node id -> PlotView

        this.emptyHint = document.createElement('div');
        this.emptyHint.className = 'plots-empty-hint';
        this.emptyHint.textContent =
            'No plot nodes in the graph. Add a "plot" node in the visual editor ' +
            'and set its Y signal(s) to see traces here.';
        this.container.appendChild(this.emptyHint);
    }

    /** Reconcile the panel with the plot nodes currently in the graph. */
    sync(configs) {
        const seen = new Set();
        configs.forEach(config => {
            seen.add(config.id);
            const existing = this.views.get(config.id);
            if (existing) {
                existing.setConfig(config);
            } else {
                this.views.set(config.id, new PlotView(this.container, config));
            }
        });
        this.views.forEach((view, id) => {
            if (!seen.has(id)) {
                view.destroy();
                this.views.delete(id);
            }
        });
        this.emptyHint.classList.toggle('hidden', this.views.size > 0);
    }

    appendData(id, x, ys) {
        const view = this.views.get(id);
        if (view) view.appendPoint(x, ys);
    }

    clearData() {
        this.views.forEach(view => view.clearData());
    }

    renderAll() {
        this.views.forEach(view => view.requestRender());
    }
}
