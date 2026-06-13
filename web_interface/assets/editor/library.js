/**
 * Node library: surfaces the existing stdlib modules (assets/solver/stdlib.js)
 * as droppable nodes, rather than adding new VM primitives.
 *
 * Pure logic, no DOM (unit-tested in tests/js_library_test.js). A stdlib entry
 * is module *source text*; introspect() parses it and pulls out the building
 * block's input/output ports and parameters (with defaults) by walking the AST
 * the in-browser parser already produces. The editor turns that spec into a
 * module-instance node and the code generator emits `import <name>` plus a
 * named-argument call (the VM requires named args for module instantiation).
 */
const NodeLibrary = (() => {
    /**
     * Curated list of reusable, single-output building blocks to expose, by
     * category. Each name is a key in MODULE_LIBRARY whose source defines a
     * module of the same name. (range/time_module are omitted from v1: their
     * params are required and their HALT behavior is confusing as a dropped
     * node.) Ports and parameter defaults are introspected from the source —
     * only the name/category/label live here.
     */
    const REGISTRY = [
        { name: 'sine_wave_generator', category: 'Sources', label: 'sine' },
        { name: 'square_wave_generator', category: 'Sources', label: 'square' },
        { name: 'triangle_wave_generator', category: 'Sources', label: 'triangle' },
        { name: 'sawtooth_wave_generator', category: 'Sources', label: 'sawtooth' },
        { name: 'pulse_generator', category: 'Sources', label: 'pulse' },
        { name: 'exponential_decay', category: 'Sources', label: 'decay' },
        { name: 'logistic_map', category: 'Sources', label: 'logistic' },
        { name: 'accumulator', category: 'Sources', label: 'accumulator' },

        { name: 'absolute_value', category: 'Math', label: 'abs' },
        { name: 'min', category: 'Math', label: 'min' },

        { name: 'low_pass_filter', category: 'Filters', label: 'low-pass' },
        { name: 'high_pass_filter', category: 'Filters', label: 'high-pass' },
        { name: 'band_pass_filter', category: 'Filters', label: 'band-pass' },

        { name: 'euler_integrator', category: 'Control', label: 'integrator' },
        { name: 'differentiator', category: 'Control', label: 'differentiator' },
        { name: 'pid_controller', category: 'Control', label: 'PID' },
        { name: 'toggle_switch', category: 'Control', label: 'toggle' },
    ];

    /** Evaluate the simple constant default expressions params use
     *  (number literals and unary negation like `0 - n`). Returns null for
     *  anything more complex or for params declared without a default. */
    function evalConstExpr(expr) {
        if (!expr) return null;
        if (expr.kind === 'NumberLiteral') return expr.value;
        // The parser desugars unary minus to (0 - operand)
        if (expr.kind === 'BinaryOperation' && expr.operator === '-' &&
            expr.left.kind === 'NumberLiteral' && expr.left.value === 0) {
            const inner = evalConstExpr(expr.right);
            return inner === null ? null : -inner;
        }
        return null;
    }

    function resolveDeps(deps) {
        const parse = deps.parseString ||
            (typeof parseString !== 'undefined' ? parseString : null);
        const library = deps.library ||
            (typeof MODULE_LIBRARY !== 'undefined' ? MODULE_LIBRARY : null);
        return { parse, library };
    }

    /**
     * Introspect a library module's source.
     * @param {string} moduleName - a REGISTRY name / MODULE_LIBRARY key
     * @param {Object} [deps] - { parseString, library } for tests; defaults to
     *        the in-browser globals
     * @returns {{name, source, inputs: string[], outputs: string[],
     *            params: Array<{name, defaultValue}>}}
     */
    function introspect(moduleName, deps = {}) {
        const { parse, library } = resolveDeps(deps);
        if (!parse || !library) {
            throw new Error('NodeLibrary.introspect: parser/library unavailable');
        }
        const source = library[moduleName];
        if (source === undefined) {
            throw new Error(`Unknown library module: ${moduleName}`);
        }

        const program = parse(source);
        // A source entry may define several modules (a building block plus an
        // *_example wrapper); pick the one whose name matches the key.
        const def = program.modules.find(m => m.name === moduleName);
        if (!def) {
            throw new Error(`Module "${moduleName}" not defined in its own source`);
        }

        const inputs = [];
        const outputs = [];
        const params = [];
        for (const stmt of def.body) {
            if (stmt.kind === 'InputDeclaration') {
                inputs.push(stmt.name);
            } else if (stmt.kind === 'OutputDeclaration') {
                outputs.push(stmt.name);
            } else if (stmt.kind === 'ParameterDeclaration') {
                params.push({ name: stmt.name, defaultValue: evalConstExpr(stmt.defaultValue) });
            }
        }

        return { name: moduleName, source, inputs, outputs, params };
    }

    return { REGISTRY, introspect, evalConstExpr };
})();

// Export for Node-based unit tests
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { NodeLibrary };
}
