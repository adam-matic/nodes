#!/usr/bin/env node
/**
 * Regression test for module-instance code generation
 * (web_interface/assets/editor/codegen.js, generateModuleDefinitionCode).
 *
 * The saved-graph-as-module-instance path previously emitted two forms the
 * language doesn't accept: a two-token `output name wire` declaration, and
 * positional module-call arguments. This test loads the real (pure)
 * generateModuleDefinitionCode in a sandbox, then parses and runs its output
 * through the solver to guard the contract.
 *
 * Usage: node tests/js_module_instance_test.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.dirname(__dirname);
const ASSETS = path.join(ROOT, 'web_interface', 'assets');
const SOLVER = path.join(ASSETS, 'solver');

const { parseString } = require(path.join(SOLVER, 'parser.js'));
const { VirtualMachine } = require(path.join(SOLVER, 'vm.js'));
const { MODULE_LIBRARY } = require(path.join(SOLVER, 'stdlib.js'));
global.MODULE_LIBRARY = MODULE_LIBRARY;

let passed = 0, failed = 0;
function check(name, cond, detail) {
    if (cond) { passed++; } else { failed++; console.error(`FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

// --- Load the real generateModuleDefinitionCode from codegen.js -------------
// codegen.js is a mixin (applyEditorMixin(class {...})). Provide a stub that
// captures the methods so we can call generateModuleDefinitionCode directly;
// it is a pure function of its arguments (no this.* calls).
const captured = {};
const sandbox = {
    applyEditorMixin(cls) {
        for (const n of Object.getOwnPropertyNames(cls.prototype)) {
            if (n !== 'constructor') captured[n] = cls.prototype[n];
        }
    },
    document: { getElementById: () => null },
    console,
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ASSETS, 'editor', 'codegen.js'), 'utf8'), sandbox,
    { filename: 'codegen.js' });

check('generateModuleDefinitionCode is defined',
    typeof captured.generateModuleDefinitionCode === 'function');

const genDef = (graphData, name, overrides) =>
    captured.generateModuleDefinitionCode.call({}, graphData, name, overrides || {});

// --- A saved graph: input in_0 -> add(in_0, in_0) -> output -----------------
// Plus a param `gain` exported and applied as a multiplier, to exercise
// param declarations and overrides.
const graphData = {
    nodes: [
        { id: 'input_1', type: 'input', parameters: { name: 'in_0' } },
        { id: 'add_2', type: 'add', parameters: {} },
        { id: 'param_3', type: 'param', parameters: { name: 'gain', defaultValue: 2 } },
        { id: 'mul_4', type: 'mul', parameters: {} },
        { id: 'output_5', type: 'output', parameters: { name: 'result' } },
    ],
    connections: [
        // in_0 -> add ports 0 and 1
        { wireName: 'in_0', from: { nodeId: 'input_1', portIndex: 0 }, to: { nodeId: 'add_2', portIndex: 0 } },
        { wireName: 'in_0', from: { nodeId: 'input_1', portIndex: 0 }, to: { nodeId: 'add_2', portIndex: 1 } },
        // add -> mul port 0
        { wireName: 'add_2_result', from: { nodeId: 'add_2', portIndex: 0 }, to: { nodeId: 'mul_4', portIndex: 0 } },
        // gain -> mul port 1
        { wireName: 'gain', from: { nodeId: 'param_3', portIndex: 0 }, to: { nodeId: 'mul_4', portIndex: 1 } },
        // mul -> output
        { wireName: 'mul_4_result', from: { nodeId: 'mul_4', portIndex: 0 }, to: { nodeId: 'output_5', portIndex: 0 } },
    ],
};

const defCode = genDef(graphData, 'my_mod');

// --- The emitted module definition must be valid grammar --------------------
check('output declaration is single-token (no "output name wire")',
    !/^\s*output[ \t]+\S+[ \t]+\S+/m.test(defCode), defCode);
check('module definition parses on its own',
    (() => { try { parseString(defCode + '\n\nexecution { max_steps: 1 }'); return true; }
             catch (e) { return false; } })(), defCode);

// --- Full program: instantiate with a named-argument call, run it -----------
function runInstance(callArgs, overrides, expected, label) {
    const code = `${genDef(graphData, 'my_mod', overrides)}

module visual_graph {
    src = const(value=5)
    my_mod_9_out = my_mod(${callArgs})
    output my_mod_9_out
}

execution {
    max_steps: 2
    save: [my_mod_9_out]
}`;
    try {
        const machine = new VirtualMachine();
        machine.loadProgram(parseString(code));
        machine.step();
        const got = machine.signals['my_mod_9_out'].getValue(0);
        check(label, Math.abs(got - expected) < 1e-9, `got ${got}, expected ${expected}, code:\n${code}`);
    } catch (e) {
        check(label, false, e.message);
    }
}

// (5 + 5) * gain(default 2) = 20
runInstance('in_0=src', null, 20, 'named-arg call with default param → 20');
// (5 + 5) * gain(override 3) = 30
runInstance('in_0=src', { gain: 3 }, 30, 'named-arg call with param override → 30');

// --- A positional call must still be rejected (documents the requirement) ---
{
    let threw = false;
    try { parseString(`${genDef(graphData, 'my_mod')}

module visual_graph {
    src = const(value=5)
    my_mod_9_out = my_mod(src)
    output my_mod_9_out
}

execution { max_steps: 1 }`); } catch (e) { threw = true; }
    check('positional module call is rejected by the parser', threw);
}

// --- multi-output: getModuleInstanceOutputDeclNames maps ports to the
//     internal wires feeding each output node, in port order ---
check('getModuleInstanceOutputDeclNames is defined',
    typeof captured.getModuleInstanceOutputDeclNames === 'function');
{
    const multiNode = {
        isLibrary: false,
        outputs: ['result', 'extra'],
        moduleDefinition: {
            nodes: [
                { id: 'in_1', type: 'input', parameters: { name: 'x' } },
                { id: 'a_2', type: 'add', parameters: {} },
                { id: 'm_3', type: 'mul', parameters: {} },
                { id: 'o_4', type: 'output', parameters: { name: 'result' } },
                { id: 'o_5', type: 'output', parameters: { name: 'extra' } },
            ],
            connections: [
                { wireName: 'a_2_result', from: { nodeId: 'a_2', portIndex: 0 }, to: { nodeId: 'o_4', portIndex: 0 } },
                { wireName: 'm_3_result', from: { nodeId: 'm_3', portIndex: 0 }, to: { nodeId: 'o_5', portIndex: 0 } },
            ],
        },
    };
    const decl = captured.getModuleInstanceOutputDeclNames.call({}, multiNode);
    check('multi-output decl names map in port order',
        JSON.stringify(decl) === JSON.stringify(['a_2_result', 'm_3_result']), JSON.stringify(decl));

    // An unconnected output node keeps its slot as null so indices stay aligned
    const withGap = JSON.parse(JSON.stringify(multiNode));
    withGap.moduleDefinition.connections.pop(); // drop the wire into o_5
    const decl2 = captured.getModuleInstanceOutputDeclNames.call({}, withGap);
    check('unconnected output keeps an aligned null slot',
        JSON.stringify(decl2) === JSON.stringify(['a_2_result', null]), JSON.stringify(decl2));
}
{
    const lib = { isLibrary: true, outputs: ['output_val'] };
    const decl = captured.getModuleInstanceOutputDeclNames.call({}, lib);
    check('library output decl names equal its outputs',
        JSON.stringify(decl) === JSON.stringify(['output_val']));
}

console.log(`\n=== Test Summary ===`);
console.log(`Passed: ${passed}/${passed + failed}`);
if (failed > 0) {
    console.error(`${failed} module-instance test(s) failed!`);
    process.exit(1);
}
console.log('All module-instance tests passed!');
