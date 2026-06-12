/**
 * Wire routing: orthogonal, rounded paths between node ports.
 *
 * Pure geometry, no DOM (unit-tested in tests/js_routing_test.js). Wires
 * always leave and enter horizontally on the side a port faces (so flipped
 * nodes are handled by the caller passing the right direction). The router
 * generates a small set of candidate orthogonal routes — a vertical riser
 * between the ports at varying x, and horizontal channels above/below for
 * backward (feedback) connections — and picks the one that crosses the
 * fewest node boxes, then has the fewest bends, then is shortest.
 */
const WireRouter = (() => {
    const STUB = 20;    // straight run out of a port before any bend
    const MARGIN = 8;   // clearance kept around node boxes
    const CORNER = 8;   // bend rounding radius
    const OFFSETS = [40, 80, 120, 160, 240, 320]; // candidate detour distances

    function inflate(r, m) {
        return { x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.h + 2 * m };
    }

    // Axis-aligned segment vs rect overlap. Open comparisons: running along
    // a rect's edge does not count as a crossing.
    function hSegHitsRect(y, xa, xb, r) {
        const lo = Math.min(xa, xb), hi = Math.max(xa, xb);
        return y > r.y && y < r.y + r.h && hi > r.x && lo < r.x + r.w;
    }
    function vSegHitsRect(x, ya, yb, r) {
        const lo = Math.min(ya, yb), hi = Math.max(ya, yb);
        return x > r.x && x < r.x + r.w && hi > r.y && lo < r.y + r.h;
    }

    /**
     * Count node-box crossings of a raw 6-point candidate, ignoring the two
     * port stubs (first and last segment), which by construction only run
     * perpendicularly out of their own node.
     */
    function countCrossings(points, rects) {
        let crossings = 0;
        for (let i = 1; i + 2 < points.length; i++) {
            const a = points[i], b = points[i + 1];
            for (const r of rects) {
                const hit = (a.y === b.y)
                    ? hSegHitsRect(a.y, a.x, b.x, r)
                    : vSegHitsRect(a.x, a.y, b.y, r);
                if (hit) crossings++;
            }
        }
        return crossings;
    }

    /** Drop zero-length segments and merge collinear runs. */
    function simplify(points) {
        const out = [points[0]];
        for (let i = 1; i < points.length; i++) {
            const p = points[i];
            const last = out[out.length - 1];
            if (p.x === last.x && p.y === last.y) continue;
            out.push(p);
        }
        for (let i = out.length - 2; i > 0; i--) {
            const a = out[i - 1], b = out[i], c = out[i + 1];
            if ((a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y)) {
                out.splice(i, 1);
            }
        }
        return out;
    }

    function pathLength(points) {
        let len = 0;
        for (let i = 0; i + 1 < points.length; i++) {
            len += Math.abs(points[i + 1].x - points[i].x) +
                   Math.abs(points[i + 1].y - points[i].y);
        }
        return len;
    }

    function stepToward(from, to, dist) {
        const len = Math.hypot(to.x - from.x, to.y - from.y);
        if (len === 0) return { x: from.x, y: from.y };
        const t = dist / len;
        return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
    }

    /** SVG path for a polyline with rounded corners. */
    function toPath(points) {
        let d = `M ${points[0].x} ${points[0].y}`;
        for (let i = 1; i < points.length - 1; i++) {
            const a = points[i - 1], b = points[i], c = points[i + 1];
            const r = Math.min(CORNER,
                Math.hypot(b.x - a.x, b.y - a.y) / 2,
                Math.hypot(c.x - b.x, c.y - b.y) / 2);
            const pIn = stepToward(b, a, r);
            const pOut = stepToward(b, c, r);
            d += ` L ${pIn.x} ${pIn.y} Q ${b.x} ${b.y} ${pOut.x} ${pOut.y}`;
        }
        const end = points[points.length - 1];
        d += ` L ${end.x} ${end.y}`;
        return d;
    }

    /** Midpoint of the longest segment, preferring horizontal ones so the
     *  wire label sits along the wire rather than across it. */
    function labelPoint(points) {
        let best = points[0];
        let bestScore = -1;
        for (let i = 0; i + 1 < points.length; i++) {
            const a = points[i], b = points[i + 1];
            const len = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
            const score = a.y === b.y ? len * 2 : len;
            if (score > bestScore) {
                bestScore = score;
                best = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
            }
        }
        return best;
    }

    /**
     * Candidate routes between two stubbed ports. Each candidate is a raw
     * 6-point polyline [port1, stub1, bend, bend, stub2, port2].
     */
    function candidates(start, end) {
        const p1 = { x: start.x, y: start.y };
        const p2 = { x: end.x, y: end.y };
        const s1 = { x: start.x + start.dir * STUB, y: start.y };
        const s2 = { x: end.x + end.dir * STUB, y: end.y };
        const routes = [];

        // Vertical riser between the stubs at varying x. Only valid when the
        // riser sits on the open side of both ports (otherwise the wire would
        // have to double back through a port).
        const baseMx = (s1.x + s2.x) / 2;
        const mxs = [baseMx];
        for (const off of OFFSETS) {
            mxs.push(baseMx - off, baseMx + off);
        }
        for (const mx of mxs) {
            if ((mx - s1.x) * start.dir >= 0 && (mx - s2.x) * end.dir >= 0) {
                routes.push([p1, s1, { x: mx, y: s1.y }, { x: mx, y: s2.y }, s2, p2]);
            }
        }

        // Horizontal channel above or below, reached straight from each stub.
        // This is the shape that routes feedback wires around the nodes.
        const top = Math.min(p1.y, p2.y);
        const bottom = Math.max(p1.y, p2.y);
        for (const off of OFFSETS) {
            for (const cy of [top - off, bottom + off]) {
                routes.push([p1, s1, { x: s1.x, y: cy }, { x: s2.x, y: cy }, s2, p2]);
            }
        }

        return routes;
    }

    /**
     * Route a wire.
     * @param {Object} spec
     * @param {{x:number,y:number,dir:number}} spec.start - source port anchor;
     *        dir is the horizontal direction the port faces (+1 right, -1 left)
     * @param {{x:number,y:number,dir:number}} spec.end - destination port anchor
     * @param {Array<{x:number,y:number,w:number,h:number}>} [spec.obstacles]
     *        node bounding boxes to route around
     * @returns {{points: Array, path: string, label: {x:number,y:number}}}
     */
    function route({ start, end, obstacles = [] }) {
        const rects = obstacles.map(r => inflate(r, MARGIN));

        let best = null;
        let bestScore = Infinity;
        for (const cand of candidates(start, end)) {
            const crossings = countCrossings(cand, rects);
            const pts = simplify(cand);
            const bends = pts.length - 2;
            const score = crossings * 10000 + bends * 30 + pathLength(pts);
            if (score < bestScore) {
                bestScore = score;
                best = pts;
            }
        }

        return { points: best, path: toPath(best), label: labelPoint(best) };
    }

    return { route, STUB, MARGIN };
})();

// Export for Node-based unit tests
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { WireRouter };
}
