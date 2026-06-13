#!/usr/bin/env node
/**
 * Unit tests for the node library introspection
 * (web_interface/assets/editor/library.js, NodeLibrary) against the real
 * stdlib (web_interface/assets/solver/stdlib.js).
 *
 * Usage: node tests/js_library_test.js
 */

const path = require('path');

const ASSETS = path.join(path.dirname(__dirname), 'web_interface', 'assets');
const { NodeLibrary } = require(path.join(ASSETS, 'editor', 'library.js'));
const { parseString } = require(path.join(ASSETS, 'solver', 'parser.js'));
const { MODULE_LIBRARY } = require(path.join(ASSETS, 'solver', 'stdlib.js'));

const deps = { parseString, library: MODULE_LIBRARY };

let passed = 0;
let failed = 0;
function check(name, condition, detail) {
    if (condition) {
        passed++;
    } else {
        failed++;
        console.error(`FAIL: ${name}${detail ? ' — ' + detail : ''}`);
    }
}

// --- every registry entry introspects without throwing ---
NodeLibrary.REGISTRY.forEach(entry => {
    let spec = null;
    try {
        spec = NodeLibrary.introspect(entry.name, deps);
    } catch (e) {
        check(`introspect ${entry.name}`, false, e.message);
        return;
    }
    check(`introspect ${entry.name}`, !!spec);
    check(`${entry.name}: name matches`, spec.name === entry.name);
    check(`${entry.name}: has exactly one output (v1 scope)`, spec.outputs.length === 1,
        `outputs=${JSON.stringify(spec.outputs)}`);
    check(`${entry.name}: every input is a non-empty name`,
        spec.inputs.every(n => typeof n === 'string' && n.length > 0));
    check(`${entry.name}: every param has a name`,
        spec.params.every(p => typeof p.name === 'string' && p.name.length > 0));
});

// --- specific, known shapes ---
{
    const lp = NodeLibrary.introspect('low_pass_filter', deps);
    check('low_pass_filter: input is [signal]',
        JSON.stringify(lp.inputs) === JSON.stringify(['signal']));
    check('low_pass_filter: output is [output_val]',
        JSON.stringify(lp.outputs) === JSON.stringify(['output_val']));
    const alpha = lp.params.find(p => p.name === 'alpha');
    check('low_pass_filter: alpha default 0.1', alpha && Math.abs(alpha.defaultValue - 0.1) < 1e-9,
        JSON.stringify(lp.params));
}
{
    const pid = NodeLibrary.introspect('pid_controller', deps);
    check('pid_controller: two inputs',
        JSON.stringify(pid.inputs) === JSON.stringify(['setpoint', 'process_variable']),
        JSON.stringify(pid.inputs));
    const names = pid.params.map(p => p.name).sort().join(',');
    check('pid_controller: has kp/ki/kd/dt params', names === 'dt,kd,ki,kp', names);
}
{
    const sine = NodeLibrary.introspect('sine_wave_generator', deps);
    check('sine_wave_generator: no inputs', sine.inputs.length === 0);
    const freq = sine.params.find(p => p.name === 'frequency');
    check('sine_wave_generator: frequency default 1', freq && freq.defaultValue === 1);
}

// --- evalConstExpr handles negation and rejects complex expressions ---
{
    check('evalConstExpr: number literal',
        NodeLibrary.evalConstExpr({ kind: 'NumberLiteral', value: 5 }) === 5);
    check('evalConstExpr: negation 0 - 3',
        NodeLibrary.evalConstExpr({
            kind: 'BinaryOperation', operator: '-',
            left: { kind: 'NumberLiteral', value: 0 },
            right: { kind: 'NumberLiteral', value: 3 }
        }) === -3);
    check('evalConstExpr: null for missing default',
        NodeLibrary.evalConstExpr(null) === null);
    check('evalConstExpr: null for identifier',
        NodeLibrary.evalConstExpr({ kind: 'Identifier', name: 'x' }) === null);
}

// --- unknown module throws ---
{
    let threw = false;
    try { NodeLibrary.introspect('does_not_exist', deps); } catch (e) { threw = true; }
    check('introspect: unknown module throws', threw);
}

console.log(`\n=== Test Summary ===`);
console.log(`Passed: ${passed}/${passed + failed}`);
if (failed > 0) {
    console.error(`${failed} library test(s) failed!`);
    process.exit(1);
}
console.log('All library tests passed!');
