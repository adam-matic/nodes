#!/usr/bin/env node
/**
 * Browser smoke test for the web interface (desktop UI):
 * loads the real page in headless Chromium and exercises the palette,
 * undo/redo, keyboard shortcuts, space-drag pan, wheel zoom, and a full run.
 *
 * Requires Playwright with a Chromium download. Skips (exit 0) when not
 * available so it can sit in the default test set.
 *
 * Usage: node tests/js_ui_smoke_test.js
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const WEB_ROOT = path.join(path.dirname(__dirname), 'web_interface');

// --- locate playwright (local, global, or known container path) ---
let chromium = null;
for (const spec of ['playwright', '/opt/node22/lib/node_modules/playwright']) {
    try {
        ({ chromium } = require(spec));
        break;
    } catch (err) { /* try next */ }
}
if (!chromium) {
    console.log('SKIP: playwright is not installed; smoke test not run.');
    process.exit(0);
}
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync('/opt/pw-browsers')) {
    process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
}

const MIME = {
    '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
};

function serveStatic() {
    return new Promise(resolve => {
        const server = http.createServer((req, res) => {
            const urlPath = req.url.split('?')[0];
            const file = path.join(WEB_ROOT, urlPath === '/' ? 'index.html' : urlPath);
            if (!file.startsWith(WEB_ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
                res.writeHead(404).end('not found');
                return;
            }
            res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
            res.end(fs.readFileSync(file));
        });
        server.listen(0, '127.0.0.1', () => resolve(server));
    });
}

let failed = 0;
function fail(msg) {
    failed++;
    console.error('FAIL: ' + msg);
}

(async () => {
    const server = await serveStatic();
    const base = `http://127.0.0.1:${server.address().port}`;

    let browser;
    try {
        browser = await chromium.launch();
    } catch (err) {
        console.log(`SKIP: could not launch Chromium (${err.message.split('\n')[0]})`);
        server.close();
        process.exit(0);
    }

    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    const errors = [];
    page.on('pageerror', err => errors.push('pageerror: ' + err.message));
    page.on('console', msg => {
        if (msg.type() === 'error') errors.push('console.error: ' + msg.text());
    });

    await page.goto(base + '/index.html');
    await page.waitForTimeout(400); // sample graph connections appear after 100ms

    // --- initial state ---
    const nodeCount = await page.locator('.node').count();
    if (nodeCount !== 4) fail(`expected 4 sample nodes, got ${nodeCount}`);
    const connCount = await page.locator('#connections g.connection').count();
    if (connCount !== 4) fail(`expected 4 sample connections, got ${connCount}`);
    if (await page.locator('#node-palette .palette-item').count() !== 13)
        fail('expected 13 palette items');
    if (!await page.locator('#undo-btn').isDisabled())
        fail('undo should be disabled after init (history reset)');

    // --- palette click adds a node, undo removes it, redo restores it ---
    await page.locator('.palette-item[data-type="mul"]').click();
    if (await page.locator('.node').count() !== 5) fail('palette click did not add node');
    if (await page.locator('#undo-btn').isDisabled()) fail('undo should enable after add');

    await page.keyboard.press('Control+z');
    if (await page.locator('.node').count() !== 4) fail('Ctrl+Z did not remove added node');
    await page.keyboard.press('Control+Shift+z');
    if (await page.locator('.node').count() !== 5) fail('Ctrl+Shift+Z did not restore node');
    await page.locator('#undo-btn').click();
    if (await page.locator('.node').count() !== 4) fail('undo button did not work');

    // --- select a node, delete it with the Del key, undo brings it + wires back ---
    // click near the top edge: connection wires (drawn above nodes) cross the center
    await page.locator('.node', { hasText: 'mem' }).first().click({ position: { x: 40, y: 6 } });
    await page.keyboard.press('Delete');
    if (await page.locator('.node').count() !== 3) fail('Delete key did not delete node');
    if (await page.locator('#connections g.connection').count() !== 1)
        fail('deleting mem should remove its 3 connections');
    await page.keyboard.press('Control+z');
    if (await page.locator('.node').count() !== 4) fail('undo did not restore deleted node');
    if (await page.locator('#connections g.connection').count() !== 4)
        fail('undo did not restore deleted connections');

    // --- drag a node, undo returns it ---
    const node = page.locator('.node', { hasText: 'add' }).first();
    const before = await node.boundingBox();
    await node.hover({ position: { x: 40, y: 6 } });
    await page.mouse.down();
    await page.mouse.move(before.x + 120, before.y + 80, { steps: 5 });
    await page.mouse.up();
    const after = await node.boundingBox();
    if (Math.abs(after.x - before.x) < 50) fail('drag did not move node');
    await page.keyboard.press('Control+z');
    const restored = await node.boundingBox();
    if (Math.abs(restored.x - before.x) > 2) fail('undo did not restore node position');

    // --- space-drag pan ---
    const transformBefore = await page.locator('#viewport').evaluate(el => el.style.transform);
    await page.keyboard.down('Space');
    await page.mouse.move(700, 400);
    await page.mouse.down();
    await page.mouse.move(640, 360, { steps: 3 });
    await page.mouse.up();
    await page.keyboard.up('Space');
    const transformAfter = await page.locator('#viewport').evaluate(el => el.style.transform);
    if (transformBefore === transformAfter) fail('space-drag did not pan viewport');

    // --- wheel zoom ---
    await page.mouse.move(700, 400);
    await page.mouse.wheel(0, -240);
    await page.waitForTimeout(100);
    const zoom = await page.evaluate(() => {
        const t = document.getElementById('viewport').style.transform;
        return parseFloat((t.match(/scale\(([\d.]+)\)/) || [])[1] || '1');
    });
    if (!(zoom > 1)) fail(`wheel zoom did not zoom in (scale=${zoom})`);

    // --- Ctrl+R runs the compiled program ---
    await page.waitForTimeout(800); // let auto-compile settle
    await page.keyboard.press('Control+r');
    await page.waitForTimeout(800);
    const stepText = await page.locator('#toolbar-step-counter').textContent();
    if (!/Step: 10/.test(stepText)) fail(`Ctrl+R run did not reach step 10 (got "${stepText}")`);

    // --- drag from palette onto canvas (run auto-switched to the Output tab) ---
    await page.locator('.tab[data-tab="visual"]').click();
    const item = page.locator('.palette-item[data-type="const"]');
    const canvas = page.locator('#editor-canvas');
    const cb = await canvas.boundingBox();
    await item.dragTo(canvas, { targetPosition: { x: cb.width - 200, y: 150 } });
    if (await page.locator('.node').count() !== 5) fail('palette drag-drop did not add node');

    // --- typing in the code editor is not hijacked ---
    await page.locator('.tab[data-tab="code"]').click();
    await page.locator('#code-editor').click();
    await page.keyboard.press('End');
    await page.keyboard.type('x');
    await page.keyboard.press('Backspace');
    const editorOk = await page.locator('#code-editor').evaluate(el => !el.value.endsWith('x'));
    if (!editorOk) fail('Backspace did not work inside the code editor');
    if (await page.locator('.node').count() !== 5)
        fail('Backspace in code editor deleted a graph node');

    for (const e of errors) fail(e);

    await browser.close();
    server.close();

    console.log(failed ? `\n${failed} smoke check(s) failed!` : 'All UI smoke checks passed!');
    process.exit(failed ? 1 : 0);
})().catch(err => { console.error(err); process.exit(1); });
