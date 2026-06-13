#!/usr/bin/env node
/**
 * Structural tests for the split NodeEditor (web_interface/assets/app.js +
 * assets/editor/*.js). The editor is DOM-heavy, so instead of executing it we
 * load all scripts in a sandbox and verify that the mixin split is complete:
 * every `this.method(...)` call site in the sources must resolve to a method
 * on NodeEditor.prototype. This catches methods lost or duplicated when code
 * moves between modules.
 *
 * Usage: node tests/js_editor_test.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PROJECT_ROOT = path.dirname(__dirname);
const ASSETS = path.join(PROJECT_ROOT, 'web_interface', 'assets');

// Load order must match the <script> tags in index.html
const SOURCES = [
    'app.js',
    'editor/history.js',
    'editor/routing.js',
    'editor/library.js',
    'editor/storage.js',
    'editor/graph.js',
    'editor/interaction.js',
    'editor/codegen.js',
    'editor/plotting.js',
    'editor/persistence.js',
    'editor/palette.js',
    'editor/projects.js',
].map(rel => path.join(ASSETS, rel));

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

// Minimal stubs: the scripts only touch the DOM at runtime, except for the
// DOMContentLoaded registration at the bottom of app.js.
const sandbox = {
    document: { addEventListener: () => {} },
    window: {},
    navigator: {},
    console,
};
vm.createContext(sandbox);

for (const file of SOURCES) {
    try {
        vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file });
        check(`load ${path.basename(file)}`, true);
    } catch (err) {
        check(`load ${path.basename(file)}`, false, err.message);
    }
}

const NodeEditor = vm.runInContext('NodeEditor', sandbox);
check('NodeEditor class is defined', typeof NodeEditor === 'function');

const methods = new Set(
    Object.getOwnPropertyNames(NodeEditor.prototype).filter(n => n !== 'constructor')
);
check('prototype has a substantial method set', methods.size > 80,
    `only ${methods.size} methods`);

// Every `this.someName(` in the sources must be a prototype method.
// (Calls through instance properties like `this.plotPanel.sync(...)` don't
// match this pattern, so they are not flagged.)
const UndoHistory = vm.runInContext('UndoHistory', sandbox);
check('UndoHistory class is defined', typeof UndoHistory === 'function');
// ProjectStorage's store classes (storage.js) have their own `this` methods
// (e.g. this._store/this._await); they are not editor-prototype methods.
const ProjectStorage = vm.runInContext('ProjectStorage', sandbox);
check('ProjectStorage is defined', typeof ProjectStorage === 'object');
const allowed = new Set([
    ...methods,
    // UndoHistory methods and its function-valued constructor options
    ...Object.getOwnPropertyNames(UndoHistory.prototype),
    'capture', 'restoreFn', 'onChange',
    // Project store internal methods (own classes, not the editor prototype)
    ...Object.getOwnPropertyNames(ProjectStorage.IndexedDbProjectStore.prototype),
    ...Object.getOwnPropertyNames(ProjectStorage.MemoryProjectStore.prototype),
]);

const allSource = SOURCES.map(f => fs.readFileSync(f, 'utf8')).join('\n');
const callSites = new Set();
for (const match of allSource.matchAll(/this\.(\w+)\(/g)) {
    callSites.add(match[1]);
}
check('found this.method() call sites to verify', callSites.size > 50,
    `only ${callSites.size} call sites`);

for (const name of callSites) {
    check(`this.${name}() resolves to a known method`, allowed.has(name));
}

console.log(`\n=== Test Summary ===`);
console.log(`Passed: ${passed}/${passed + failed}`);
if (failed > 0) {
    console.error(`${failed} editor structure test(s) failed!`);
    process.exit(1);
}
console.log('All editor structure tests passed!');
