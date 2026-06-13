/**
 * Project storage for the editor's local "My Projects" library
 * (roadmap Phase 5, local-first step).
 *
 * Everything goes through one small async interface so a remote/server
 * backend can be added later without touching the editor:
 *
 *   init()        -> resolves once the store is ready
 *   list()        -> Promise<Array<{id, name, created, modified}>>  (newest first)
 *   get(id)       -> Promise<project | null>   (full record incl. .data)
 *   put(project)  -> Promise<project>          (insert or update by id)
 *   remove(id)    -> Promise<void>
 *
 * A project is { id, name, data, created, modified } where `data` is the
 * editor's serializeGraph() output. Two implementations share the contract:
 * IndexedDbProjectStore (browser) and MemoryProjectStore (fallback + the unit
 * test double). createProjectStore() picks IndexedDB when available.
 *
 * Pure logic / no DOM; the memory store is unit-tested in
 * tests/js_storage_test.js.
 */
const ProjectStorage = (() => {
    const DB_NAME = 'modular-math';
    const DB_VERSION = 1;
    const STORE = 'projects';

    /** Project summary (list view) — the heavy `data` field is omitted. */
    function summarize(p) {
        return { id: p.id, name: p.name, created: p.created, modified: p.modified };
    }

    /** Newest-modified first; stable for equal timestamps. */
    function byModifiedDesc(a, b) {
        return (b.modified || '').localeCompare(a.modified || '');
    }

    class MemoryProjectStore {
        constructor() { this.map = new Map(); }
        async init() { return this; }
        async list() {
            return [...this.map.values()].map(summarize).sort(byModifiedDesc);
        }
        async get(id) {
            const p = this.map.get(id);
            return p ? JSON.parse(JSON.stringify(p)) : null;
        }
        async put(project) {
            this.map.set(project.id, JSON.parse(JSON.stringify(project)));
            return project;
        }
        async remove(id) { this.map.delete(id); }
    }

    class IndexedDbProjectStore {
        constructor(idb) { this.idb = idb; this.db = null; }

        async init() {
            this.db = await new Promise((resolve, reject) => {
                const req = this.idb.open(DB_NAME, DB_VERSION);
                req.onupgradeneeded = () => {
                    const db = req.result;
                    if (!db.objectStoreNames.contains(STORE)) {
                        const os = db.createObjectStore(STORE, { keyPath: 'id' });
                        os.createIndex('modified', 'modified');
                    }
                };
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });
            return this;
        }

        _store(mode) {
            return this.db.transaction(STORE, mode).objectStore(STORE);
        }

        _await(request) {
            return new Promise((resolve, reject) => {
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        }

        async list() {
            const all = await this._await(this._store('readonly').getAll());
            return all.map(summarize).sort(byModifiedDesc);
        }
        async get(id) {
            return (await this._await(this._store('readonly').get(id))) || null;
        }
        async put(project) {
            await this._await(this._store('readwrite').put(project));
            return project;
        }
        async remove(id) {
            await this._await(this._store('readwrite').delete(id));
        }
    }

    /**
     * Build the best available store. Pass { indexedDB } to override (tests
     * pass null to force the in-memory store).
     */
    async function createProjectStore(deps = {}) {
        const idb = 'indexedDB' in deps
            ? deps.indexedDB
            : (typeof indexedDB !== 'undefined' ? indexedDB : null);
        let store;
        if (idb) {
            try {
                store = await new IndexedDbProjectStore(idb).init();
                return store;
            } catch (e) {
                // Private-mode / disabled IndexedDB: fall back to memory
                console.warn('IndexedDB unavailable, using in-memory project store:', e);
            }
        }
        return new MemoryProjectStore().init();
    }

    /** Reasonably unique, sortable-ish project id. */
    function newId() {
        return 'p_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    }

    return { MemoryProjectStore, IndexedDbProjectStore, createProjectStore, newId };
})();

// Export for Node-based unit tests
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ProjectStorage;
}
