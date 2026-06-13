#!/usr/bin/env node
/**
 * Unit tests for the project storage layer
 * (web_interface/assets/editor/storage.js, ProjectStorage).
 *
 * Tests the MemoryProjectStore — which defines the async contract shared with
 * the IndexedDB implementation — plus the createProjectStore() fallback and
 * newId(). IndexedDB itself is a browser API and isn't exercised here.
 *
 * Usage: node tests/js_storage_test.js
 */

const path = require('path');
const ProjectStorage = require(path.join(
    path.dirname(__dirname), 'web_interface', 'assets', 'editor', 'storage.js'));

let passed = 0, failed = 0;
function check(name, cond, detail) {
    if (cond) { passed++; } else { failed++; console.error(`FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

function project(id, name, modified, data = { nodes: [] }) {
    return { id, name, data, created: modified, modified };
}

(async () => {
    // --- MemoryProjectStore contract ---
    {
        const store = new ProjectStorage.MemoryProjectStore();
        await store.init();

        check('empty store lists nothing', (await store.list()).length === 0);
        check('get on missing id returns null', (await store.get('nope')) === null);

        await store.put(project('a', 'Alpha', '2026-01-01T00:00:00Z'));
        await store.put(project('b', 'Beta', '2026-03-01T00:00:00Z'));
        await store.put(project('c', 'Gamma', '2026-02-01T00:00:00Z'));

        const list = await store.list();
        check('list returns all projects', list.length === 3);
        check('list is newest-modified first',
            list.map(p => p.id).join(',') === 'b,c,a', list.map(p => p.id).join(','));
        check('list entries are summaries (no data field)',
            list.every(p => !('data' in p)));

        const a = await store.get('a');
        check('get returns the full record including data',
            a && a.name === 'Alpha' && a.data && Array.isArray(a.data.nodes));

        // put with an existing id updates in place
        await store.put(project('a', 'Alpha 2', '2026-04-01T00:00:00Z'));
        check('put updates existing record', (await store.get('a')).name === 'Alpha 2');
        check('update does not add a duplicate', (await store.list()).length === 3);
        check('updated record re-sorts to the front',
            (await store.list())[0].id === 'a');

        await store.remove('b');
        check('remove deletes the record', (await store.get('b')) === null);
        check('remove shrinks the list', (await store.list()).length === 2);
    }

    // --- stored records are independent copies (no aliasing) ---
    {
        const store = new ProjectStorage.MemoryProjectStore();
        await store.init();
        const data = { nodes: [{ id: 'n1' }] };
        await store.put(project('x', 'X', '2026-01-01T00:00:00Z', data));
        data.nodes.push({ id: 'n2' }); // mutate the original after storing
        const got = await store.get('x');
        check('stored data is a snapshot, not a live reference',
            got.data.nodes.length === 1, `len=${got.data.nodes.length}`);
        got.data.nodes.push({ id: 'n3' }); // mutate the returned copy
        check('returned data is a copy too',
            (await store.get('x')).data.nodes.length === 1);
    }

    // --- createProjectStore falls back to memory when IndexedDB is absent ---
    {
        const store = await ProjectStorage.createProjectStore({ indexedDB: null });
        check('createProjectStore({indexedDB:null}) yields a MemoryProjectStore',
            store instanceof ProjectStorage.MemoryProjectStore);
        await store.put(project('z', 'Z', '2026-01-01T00:00:00Z'));
        check('fallback store is usable', (await store.list()).length === 1);
    }

    // --- newId ---
    {
        const ids = new Set();
        for (let i = 0; i < 1000; i++) ids.add(ProjectStorage.newId());
        check('newId is unique across many calls', ids.size === 1000);
        check('newId looks like an identifier', /^p_[a-z0-9_]+$/.test(ProjectStorage.newId()));
    }

    console.log(`\n=== Test Summary ===`);
    console.log(`Passed: ${passed}/${passed + failed}`);
    if (failed > 0) {
        console.error(`${failed} storage test(s) failed!`);
        process.exit(1);
    }
    console.log('All storage tests passed!');
})();
