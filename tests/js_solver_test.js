#!/usr/bin/env node
/**
 * Fixture test runner for the JavaScript solver.
 *
 * Runs the same JSON test cases as tests/test_runner.py against the JS port
 * in web_interface/assets/solver/ and compares results. The fixtures are the
 * contract: the JS solver must reproduce the Python VM's outputs exactly
 * (within tolerance).
 *
 * Usage: node tests/js_solver_test.js [--filter pattern] [--verbose]
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.dirname(__dirname);
const SOLVER_DIR = path.join(PROJECT_ROOT, 'web_interface', 'assets', 'solver');

const { AST, parseString } = require(path.join(SOLVER_DIR, 'parser.js'));
const { VirtualMachine } = require(path.join(SOLVER_DIR, 'vm.js'));

const SEARCH_PATHS = [
    path.join(PROJECT_ROOT, 'examples', 'basic'),
    path.join(PROJECT_ROOT, 'examples', 'control_systems'),
    path.join(PROJECT_ROOT, 'examples', 'advanced'),
    path.join(PROJECT_ROOT, 'examples'),
];

/**
 * Filesystem-based module source resolver, mirroring the Python
 * ModuleResolver: explicit path relative to the importing file's directory,
 * falling back to the example search paths by module name.
 */
function fsResolveSource(moduleName, modulePath, context) {
    if (modulePath) {
        const baseDir = context || PROJECT_ROOT;
        const candidate = path.isAbsolute(modulePath) ? modulePath : path.join(baseDir, modulePath);
        if (fs.existsSync(candidate)) {
            return { source: fs.readFileSync(candidate, 'utf8'), context: path.dirname(candidate) };
        }
    }

    for (const searchPath of SEARCH_PATHS) {
        const candidate = path.join(searchPath, `${moduleName}.txt`);
        if (fs.existsSync(candidate)) {
            return { source: fs.readFileSync(candidate, 'utf8'), context: path.dirname(candidate) };
        }
    }

    throw new Error(`Module ${moduleName} not found in search paths`);
}

/** Port of test_runner.py's run_single_test. */
function runSingleTest(testCase) {
    let moduleFile = testCase.module_file;
    if (!moduleFile.startsWith('/')) {
        moduleFile = path.join(PROJECT_ROOT, moduleFile);
    }

    const source = fs.readFileSync(moduleFile, 'utf8');
    let ast = parseString(source);

    if ('module_name' in testCase && 'parameters' in testCase) {
        const targetModule = ast.modules.find((m) => m.name === testCase.module_name);
        if (!targetModule) {
            throw new Error(`Module '${testCase.module_name}' not found in ${moduleFile}`);
        }

        let modifiedModule = targetModule;
        if (Object.keys(testCase.parameters).length > 0) {
            const newBody = targetModule.body.map((stmt) => {
                if (stmt.kind === 'ParameterDeclaration' && stmt.name in testCase.parameters) {
                    const paramValue = testCase.parameters[stmt.name];
                    if (paramValue === '$step') {
                        return AST.parameterDeclaration(stmt.name, null);
                    }
                    return AST.parameterDeclaration(stmt.name, AST.numberLiteral(parseFloat(paramValue)));
                }
                if (stmt.kind === 'InputDeclaration' && stmt.name in testCase.parameters) {
                    const paramValue = testCase.parameters[stmt.name];
                    if (paramValue === '$step') {
                        return AST.assignment(stmt.name, AST.stepVariable());
                    }
                    return AST.assignment(stmt.name, AST.numberLiteral(parseFloat(paramValue)));
                }
                return stmt;
            });
            modifiedModule = AST.moduleDefinition(targetModule.name, newBody);
        }

        const saveSignals = Object.keys(testCase.expected_output || {});
        const saveExpressions = saveSignals.length > 0
            ? saveSignals.map((s) => (s === '$step' ? AST.stepVariable() : AST.identifier(s)))
            : null;
        const execution = AST.executionBlock(testCase.max_steps ?? 10, null, saveExpressions, null);

        const allModules = ast.modules.map((m) => (m.name === targetModule.name ? modifiedModule : m));
        ast = AST.program(ast.imports, allModules, execution);
    }

    const vm = new VirtualMachine(fsResolveSource);
    vm.loadProgram(ast, path.dirname(moduleFile));

    if ('max_steps' in testCase) {
        vm.maxSteps = testCase.max_steps;
    }

    return vm.run();
}

function compareResults(expected, actual, tolerance = 0.001) {
    for (const [signalName, expectedValues] of Object.entries(expected)) {
        if (!(signalName in actual)) {
            return [false, `Missing signal '${signalName}' in actual results`];
        }

        const actualValues = actual[signalName];

        if (expectedValues.length !== actualValues.length) {
            return [false, `Signal '${signalName}': expected ${expectedValues.length} values, got ${actualValues.length}`];
        }

        for (let i = 0; i < expectedValues.length; i++) {
            if (Math.abs(expectedValues[i] - actualValues[i]) > tolerance) {
                return [false, `Signal '${signalName}' at step ${i}: expected ${expectedValues[i]}, got ${actualValues[i]}`];
            }
        }
    }

    return [true, ''];
}

function main() {
    const args = process.argv.slice(2);
    const verbose = args.includes('--verbose') || args.includes('-v');
    const filterIdx = args.indexOf('--filter');
    const filterPattern = filterIdx !== -1 ? args[filterIdx + 1] : null;

    const testDir = path.join(PROJECT_ROOT, 'tests');
    let testFiles = fs.readdirSync(testDir)
        .filter((f) => f.endsWith('.json'))
        .sort();

    if (filterPattern) {
        testFiles = testFiles.filter((f) => f.includes(filterPattern));
    }

    console.log(`Running ${testFiles.length} test cases against the JS solver...\n`);

    let passed = 0;

    for (const testFile of testFiles) {
        const testCase = JSON.parse(fs.readFileSync(path.join(testDir, testFile), 'utf8'));
        const testName = testCase.test_name || testFile;

        try {
            const actualResults = runSingleTest(testCase);
            const expectedOutput = testCase.expected_output || {};
            const tolerance = testCase.tolerance ?? 0.001;
            const [match, compareError] = compareResults(expectedOutput, actualResults, tolerance);

            if (match) {
                passed += 1;
                console.log(`✓ ${testName}`);
                if (verbose) console.log(`  Results: ${JSON.stringify(actualResults)}`);
            } else {
                console.log(`✗ ${testName}\n  Error: ${compareError}`);
                console.log(`  Expected: ${JSON.stringify(expectedOutput)}`);
                console.log(`  Actual:   ${JSON.stringify(actualResults)}`);
            }
        } catch (e) {
            console.log(`✗ ${testName}\n  Error: ${e.message}`);
        }
    }

    const total = testFiles.length;
    console.log('\n=== Test Summary ===');
    console.log(`Passed: ${passed}/${total}`);
    if (total > 0) {
        console.log(`Success Rate: ${(100 * passed / total).toFixed(1)}%`);
    }

    if (passed === total) {
        console.log('🎉 All tests passed!');
    } else {
        console.log(`❌ ${total - passed} tests failed`);
        process.exitCode = 1;
    }
}

main();
