#!/usr/bin/env node
/**
 * Unit tests for the wire router
 * (web_interface/assets/editor/routing.js, WireRouter).
 *
 * Usage: node tests/js_routing_test.js
 */

const path = require('path');

const { WireRouter } = require(path.join(
    path.dirname(__dirname), 'web_interface', 'assets', 'editor', 'routing.js'));

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

/** Does an axis-aligned segment cross the interior of a rect? */
function segCrossesRect(a, b, r) {
    if (a.y === b.y) {
        const lo = Math.min(a.x, b.x), hi = Math.max(a.x, b.x);
        return a.y > r.y && a.y < r.y + r.h && hi > r.x && lo < r.x + r.w;
    }
    const lo = Math.min(a.y, b.y), hi = Math.max(a.y, b.y);
    return a.x > r.x && a.x < r.x + r.w && hi > r.y && lo < r.y + r.h;
}

/** Crossings of the route body (all segments except the two port stubs). */
function bodyCrossings(points, rects) {
    let n = 0;
    for (let i = 1; i + 2 < points.length; i++) {
        for (const r of rects) {
            if (segCrossesRect(points[i], points[i + 1], r)) n++;
        }
    }
    return n;
}

function isOrthogonal(points) {
    for (let i = 0; i + 1 < points.length; i++) {
        const a = points[i], b = points[i + 1];
        if (a.x !== b.x && a.y !== b.y) return false;
    }
    return true;
}

// --- straight forward connection ---
{
    const route = WireRouter.route({
        start: { x: 100, y: 50, dir: 1 },
        end: { x: 300, y: 50, dir: -1 },
    });
    check('straight: collapses to a single segment', route.points.length === 2,
        `${route.points.length} points`);
    check('straight: starts at the source port',
        route.points[0].x === 100 && route.points[0].y === 50);
    check('straight: ends at the destination port',
        route.points[1].x === 300 && route.points[1].y === 50);
    check('straight: label is on the wire',
        route.label.y === 50 && route.label.x > 100 && route.label.x < 300);
}

// --- ports at different heights: exits and entries are horizontal ---
{
    const start = { x: 100, y: 50, dir: 1 };
    const end = { x: 400, y: 200, dir: -1 };
    const route = WireRouter.route({ start, end });
    const pts = route.points;

    check('step: route is orthogonal', isOrthogonal(pts));

    const first = { a: pts[0], b: pts[1] };
    check('step: leaves the source horizontally', first.a.y === first.b.y);
    check('step: leaves in the direction the port faces',
        (first.b.x - first.a.x) * start.dir >= WireRouter.STUB,
        `first run ${first.b.x - first.a.x}`);

    const last = { a: pts[pts.length - 2], b: pts[pts.length - 1] };
    check('step: enters the destination horizontally', last.a.y === last.b.y);
    check('step: enters against the direction the port faces',
        (last.b.x - last.a.x) * end.dir <= -WireRouter.STUB,
        `last run ${last.b.x - last.a.x}`);
}

// --- flipped destination: port faces right, wire must come from the right ---
{
    const start = { x: 100, y: 50, dir: 1 };
    const end = { x: 300, y: 150, dir: 1 }; // input on a flipped node
    const route = WireRouter.route({ start, end });
    const pts = route.points;
    const last = { a: pts[pts.length - 2], b: pts[pts.length - 1] };
    check('flipped: enters from the right side',
        last.a.y === last.b.y && last.a.x - last.b.x >= WireRouter.STUB,
        `last run ${last.b.x - last.a.x}`);
}

// --- feedback: destination behind the source, route around both nodes ---
{
    const rects = [
        { x: 100, y: 74, w: 120, h: 52 },  // destination node (input at x=100)
        { x: 380, y: 74, w: 120, h: 52 },  // source node (output at x=500)
    ];
    const route = WireRouter.route({
        start: { x: 500, y: 100, dir: 1 },
        end: { x: 100, y: 100, dir: -1 },
        obstacles: rects,
    });
    check('feedback: route is orthogonal', isOrthogonal(route.points));
    check('feedback: route avoids both node boxes',
        bodyCrossings(route.points, rects) === 0);
    check('feedback: still leaves to the right',
        route.points[1].x > 500);
    check('feedback: still enters from the left',
        route.points[route.points.length - 2].x < 100);
}

// --- node sitting on the direct path is detoured around ---
{
    const blocker = { x: 300, y: 80, w: 120, h: 60 };
    const route = WireRouter.route({
        start: { x: 220, y: 107, dir: 1 },
        end: { x: 600, y: 107, dir: -1 },
        obstacles: [blocker],
    });
    check('detour: route avoids the blocking node',
        bodyCrossings(route.points, [blocker]) === 0,
        JSON.stringify(route.points));
    check('detour: route has bends', route.points.length > 2);
}

// --- rounded corners appear in the SVG path ---
{
    const route = WireRouter.route({
        start: { x: 100, y: 50, dir: 1 },
        end: { x: 400, y: 200, dir: -1 },
    });
    check('path: starts with a move command', route.path.startsWith('M 100 50'));
    check('path: bends are rounded with quadratics', route.path.includes('Q'));
}

console.log(`\n=== Test Summary ===`);
console.log(`Passed: ${passed}/${passed + failed}`);
if (failed > 0) {
    console.error(`${failed} routing test(s) failed!`);
    process.exit(1);
}
console.log('All routing tests passed!');
