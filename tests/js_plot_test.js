#!/usr/bin/env node
/**
 * Unit tests for the plot panel's pure logic (web_interface/assets/plot.js):
 * tick generation, tick label formatting, autoscaling, and history trimming.
 * The canvas rendering and DOM wiring are exercised manually in the browser.
 *
 * Usage: node tests/js_plot_test.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PROJECT_ROOT = path.dirname(__dirname);
const PLOT_JS = path.join(PROJECT_ROOT, 'web_interface', 'assets', 'plot.js');

// plot.js is a plain browser script (no exports); evaluate it in a sandbox
// and pull the class out. DOM access only happens inside constructors.
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(PLOT_JS, 'utf8') + '\nthis.PlotView = PlotView;', sandbox);
const PlotView = sandbox.PlotView;

let passed = 0;
let failed = 0;

function check(name, condition, detail) {
    if (condition) {
        passed++;
    } else {
        failed++;
        console.log(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
    }
}

function approxEqual(a, b, tol = 1e-9) {
    return Math.abs(a - b) <= tol;
}

function arraysApproxEqual(a, b) {
    return a.length === b.length && a.every((v, i) => approxEqual(v, b[i]));
}

// A PlotView without DOM: just the data fields the logic methods need.
function bareView(config) {
    const view = Object.create(PlotView.prototype);
    view.config = Object.assign({ id: 't', title: 't', xSignal: 'step', ySignals: ['y'], maxPoints: 0 }, config);
    view.xData = [];
    view.yData = view.config.ySignals.map(() => []);
    view.view = null;
    view.requestRender = () => {}; // no rendering in node
    return view;
}

// --- niceTicks ---------------------------------------------------------

{
    const t = PlotView.niceTicks(0, 10, 5);
    check('niceTicks 0..10 step', approxEqual(t.step, 2), `step=${t.step}`);
    check('niceTicks 0..10 values', arraysApproxEqual(t.values, [0, 2, 4, 6, 8, 10]),
        JSON.stringify(t.values));
}
{
    const t = PlotView.niceTicks(-1.3, 2.7, 8);
    check('niceTicks -1.3..2.7 step', approxEqual(t.step, 0.5), `step=${t.step}`);
    check('niceTicks -1.3..2.7 endpoints',
        approxEqual(t.values[0], -1) && approxEqual(t.values[t.values.length - 1], 2.5),
        JSON.stringify(t.values));
}
{
    const t = PlotView.niceTicks(0, 0.00037, 4);
    check('niceTicks tiny range step', approxEqual(t.step, 0.0001), `step=${t.step}`);
}
{
    const t = PlotView.niceTicks(5, 5, 4);
    check('niceTicks degenerate range', t.values.length === 0, JSON.stringify(t.values));
}
{
    // Tick count stays near the requested density
    const t = PlotView.niceTicks(-123456, 654321, 6);
    check('niceTicks large range count', t.values.length >= 3 && t.values.length <= 8,
        `count=${t.values.length}`);
}

// --- formatTick --------------------------------------------------------

check('formatTick zero', PlotView.formatTick(0, 0.5) === '0');
check('formatTick integer', PlotView.formatTick(2, 0.5) === '2',
    PlotView.formatTick(2, 0.5));
check('formatTick decimal', PlotView.formatTick(0.25, 0.05) === '0.25',
    PlotView.formatTick(0.25, 0.05));
check('formatTick trims trailing zeros', PlotView.formatTick(1.5, 0.01) === '1.5',
    PlotView.formatTick(1.5, 0.01));
check('formatTick large exponential', PlotView.formatTick(1500000, 500000) === '1.5e+6',
    PlotView.formatTick(1500000, 500000));
check('formatTick small exponential', PlotView.formatTick(0.00002, 0.00001) === '2.0e-5',
    PlotView.formatTick(0.00002, 0.00001));
check('formatTick negative', PlotView.formatTick(-2.5, 0.5) === '-2.5',
    PlotView.formatTick(-2.5, 0.5));

// --- autoView ----------------------------------------------------------

{
    const view = bareView({ ySignals: ['a', 'b'] });
    view.xData = [0, 1, 2];
    view.yData = [[10, 20, 30], [5, null, 15]];
    const auto = view.autoView();
    check('autoView x padding', approxEqual(auto.xMin, -0.1) && approxEqual(auto.xMax, 2.1),
        JSON.stringify(auto));
    check('autoView y bounds with nulls', approxEqual(auto.yMin, 5 - 1.25) && approxEqual(auto.yMax, 30 + 1.25),
        JSON.stringify(auto));
}
{
    const view = bareView({});
    const auto = view.autoView();
    check('autoView no data defaults', auto.xMin === 0 && auto.xMax === 10 && auto.yMin === -1 && auto.yMax === 1,
        JSON.stringify(auto));
}
{
    // Constant signal: range must not collapse to zero height
    const view = bareView({});
    view.xData = [0, 1, 2];
    view.yData = [[7, 7, 7]];
    const auto = view.autoView();
    check('autoView constant signal', auto.yMax > auto.yMin, JSON.stringify(auto));
}

// --- appendPoint / trim --------------------------------------------------

{
    const view = bareView({ ySignals: ['a', 'b'], maxPoints: 5 });
    for (let i = 1; i <= 10; i++) {
        view.appendPoint(i, [i * 10, i * 100]);
    }
    check('trim keeps maxPoints', view.xData.length === 5 && view.yData[0].length === 5,
        `lengths=${view.xData.length},${view.yData[0].length}`);
    check('trim drops oldest', view.xData[0] === 6 && view.yData[1][0] === 600,
        JSON.stringify(view.xData));
}
{
    // Mismatched arity (config out of sync) must be ignored, not corrupt data
    const view = bareView({ ySignals: ['a'], maxPoints: 0 });
    view.appendPoint(1, [10]);
    view.appendPoint(2, [20, 30]);
    check('appendPoint arity guard', view.xData.length === 1, JSON.stringify(view.xData));
}

// --- Summary -------------------------------------------------------------

console.log('\n=== Test Summary ===');
console.log(`Passed: ${passed}/${passed + failed}`);
if (failed > 0) {
    process.exit(1);
}
console.log('All plot tests passed!');
