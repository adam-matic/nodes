#!/usr/bin/env node
/**
 * Unit tests for the editor's undo/redo stack
 * (web_interface/assets/editor/history.js, class UndoHistory).
 *
 * Usage: node tests/js_history_test.js
 */

const path = require('path');

const { UndoHistory } = require(path.join(
    path.dirname(__dirname), 'web_interface', 'assets', 'editor', 'history.js'));

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

/** Build a history wired to a simple mutable string state. */
function makeHistory(options = {}) {
    const box = { state: 'initial' };
    const history = new UndoHistory({
        capture: () => box.state,
        restore: (s) => { box.state = s; },
        ...options
    });
    return { box, history };
}

// --- basic undo/redo ---
{
    const { box, history } = makeHistory();
    check('starts with nothing to undo', !history.canUndo);
    check('starts with nothing to redo', !history.canRedo);

    history.checkpoint();       // snapshot 'initial'
    box.state = 'a';
    history.checkpoint();       // snapshot 'a'
    box.state = 'b';

    check('canUndo after checkpoints', history.canUndo);
    check('undo returns true', history.undo() === true);
    check('undo restores previous state', box.state === 'a', `got ${box.state}`);
    history.undo();
    check('second undo restores initial state', box.state === 'initial');
    check('nothing left to undo', !history.canUndo);
    check('undo on empty stack returns false', history.undo() === false);
    check('state unchanged by failed undo', box.state === 'initial');

    check('redo returns true', history.redo() === true);
    check('redo reapplies state', box.state === 'a');
    history.redo();
    check('second redo reaches final state', box.state === 'b');
    check('nothing left to redo', !history.canRedo);
}

// --- duplicate checkpoints are deduped ---
{
    const { box, history } = makeHistory();
    history.checkpoint();
    history.checkpoint();
    history.checkpoint();
    check('identical checkpoints collapse to one', history.undoStack.length === 1);

    box.state = 'x';
    history.checkpoint();
    check('changed state is recorded', history.undoStack.length === 2);
}

// --- a checkpoint with no following mutation does not burn an undo press ---
{
    const { box, history } = makeHistory();
    history.checkpoint();       // 'initial'
    box.state = 'a';
    history.checkpoint();       // 'a' — but no mutation follows
    check('undo skips the no-op checkpoint', history.undo() && box.state === 'initial');
}

// --- new checkpoint clears the redo stack ---
{
    const { box, history } = makeHistory();
    history.checkpoint();
    box.state = 'a';
    history.undo();             // back to 'initial', redo holds 'a'
    check('redo available after undo', history.canRedo);

    box.state = 'different';
    history.checkpoint();
    check('checkpoint clears redo', !history.canRedo);
}

// --- suspend blocks checkpoints (used during restores/loads) ---
{
    const { box, history } = makeHistory();
    history.suspend(() => {
        box.state = 'a';
        history.checkpoint();
    });
    check('checkpoints are ignored while suspended', history.undoStack.length === 0);
    check('suspension is lifted afterwards', !history.suspended);

    history.checkpoint();
    check('checkpoint works after suspend', history.undoStack.length === 1);
}

// --- restore callbacks never record checkpoints ---
{
    const box = { state: 'initial' };
    const history = new UndoHistory({
        capture: () => box.state,
        restore: (s) => {
            box.state = s;
            history.checkpoint(); // a sloppy restore path must be harmless
        }
    });
    history.checkpoint();
    box.state = 'a';
    history.undo();
    check('checkpoint during restore is ignored', history.undoStack.length === 0);
}

// --- depth limit drops the oldest entries ---
{
    const { box, history } = makeHistory({ limit: 3 });
    for (let i = 0; i < 10; i++) {
        box.state = `s${i}`;
        history.checkpoint();
    }
    check('stack respects the limit', history.undoStack.length === 3);
    check('oldest entries were dropped',
        history.undoStack[0] === 's7', `got ${history.undoStack[0]}`);
}

// --- onChange fires on stack changes ---
{
    let calls = 0;
    const { box, history } = makeHistory({ onChange: () => calls++ });
    history.checkpoint();
    box.state = 'a';
    history.undo();
    history.redo();
    history.reset();
    check('onChange fired for checkpoint/undo/redo/reset', calls === 4, `got ${calls}`);
    check('reset clears both stacks', !history.canUndo && !history.canRedo);
}

console.log(`\n=== Test Summary ===`);
console.log(`Passed: ${passed}/${passed + failed}`);
if (failed > 0) {
    console.error(`${failed} history test(s) failed!`);
    process.exit(1);
}
console.log('All history tests passed!');
