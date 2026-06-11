#!/usr/bin/env node
/**
 * Generates web_interface/assets/solver/stdlib.js: a registry mapping module
 * names to their source text, so the in-browser solver can resolve imports
 * without a filesystem. Scans every .txt file under examples/.
 *
 * Run after adding or changing library modules:
 *   node tools/build_stdlib.js
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.dirname(__dirname);
const EXAMPLES_DIR = path.join(PROJECT_ROOT, 'examples');
const OUTPUT_FILE = path.join(PROJECT_ROOT, 'web_interface', 'assets', 'solver', 'stdlib.js');

function collectTxtFiles(dir) {
    const files = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...collectTxtFiles(fullPath));
        } else if (entry.name.endsWith('.txt')) {
            files.push(fullPath);
        }
    }
    return files;
}

const registry = {};

for (const file of collectTxtFiles(EXAMPLES_DIR).sort()) {
    const source = fs.readFileSync(file, 'utf8');
    const moduleNames = [...source.matchAll(/^\s*module\s+(\w+)/gm)].map((m) => m[1]);

    for (const name of moduleNames) {
        if (name in registry) {
            console.warn(`Warning: module '${name}' in ${path.relative(PROJECT_ROOT, file)} ` +
                `already registered from another file; keeping the first definition`);
            continue;
        }
        registry[name] = source;
    }
}

const header = `/**
 * Module library for the in-browser solver — GENERATED FILE, do not edit.
 * Regenerate with: node tools/build_stdlib.js
 *
 * Maps module names to the source text of the example file defining them,
 * so imports resolve in the browser without a filesystem.
 */
`;

const body = `const MODULE_LIBRARY = ${JSON.stringify(registry, null, 2)};\n\n` +
    `if (typeof module !== 'undefined' && module.exports) {\n` +
    `    module.exports = { MODULE_LIBRARY };\n` +
    `}\n`;

fs.writeFileSync(OUTPUT_FILE, header + body);
console.log(`Wrote ${Object.keys(registry).length} modules to ${path.relative(PROJECT_ROOT, OUTPUT_FILE)}`);
