/**
 * Local project library: the "My Projects" panel and its glue to the editor
 * (roadmap Phase 5). Storage goes through ProjectStorage (editor/storage.js);
 * this file is the UI + editor integration only.
 *
 * Mixin: methods are copied onto NodeEditor.prototype by applyEditorMixin().
 * Load after app.js and storage.js.
 */
applyEditorMixin(class {
    setupProjects() {
        document.getElementById('projects-btn')
            .addEventListener('click', () => this.openProjectsPanel());
        document.getElementById('close-projects-btn')
            .addEventListener('click', () => this.hideProjectsPanel());
        document.getElementById('save-to-library-btn')
            .addEventListener('click', () => this.saveCurrentToLibrary());
    }

    openProjectsPanel() {
        document.getElementById('projects-panel').classList.remove('hidden');
        this.renderProjectList();
    }

    hideProjectsPanel() {
        document.getElementById('projects-panel').classList.add('hidden');
    }

    async renderProjectList() {
        const listEl = document.getElementById('projects-list');
        const currentEl = document.getElementById('projects-current');

        if (!this.projectStore) {
            await (this.projectStoreReady || Promise.resolve());
        }
        if (!this.projectStore) {
            listEl.innerHTML = '<p class="projects-empty">Project storage is unavailable in this browser.</p>';
            return;
        }

        currentEl.textContent = this.currentProjectId
            ? `Editing: ${this.graphName || 'untitled'}`
            : 'Unsaved graph — “Save current graph” to add it to your library.';

        const projects = await this.projectStore.list();
        if (projects.length === 0) {
            listEl.innerHTML = '<p class="projects-empty">No saved projects yet.</p>';
            return;
        }

        listEl.innerHTML = '';
        projects.forEach(p => {
            const row = document.createElement('div');
            row.className = 'project-row' + (p.id === this.currentProjectId ? ' current' : '');

            const info = document.createElement('div');
            info.className = 'project-info';
            const name = document.createElement('div');
            name.className = 'project-name';
            name.textContent = p.name || 'untitled';
            const meta = document.createElement('div');
            meta.className = 'project-meta';
            meta.textContent = this.formatProjectTimestamp(p.modified);
            info.appendChild(name);
            info.appendChild(meta);
            row.appendChild(info);

            const actions = document.createElement('div');
            actions.className = 'project-actions';
            [
                { label: 'Open', handler: () => this.openProject(p.id) },
                { label: 'Rename', handler: () => this.renameProject(p.id) },
                { label: 'Duplicate', handler: () => this.duplicateProject(p.id) },
                { label: 'Delete', handler: () => this.deleteProject(p.id), danger: true },
            ].forEach(({ label, handler, danger }) => {
                const btn = document.createElement('button');
                btn.className = 'btn btn-small' + (danger ? ' btn-danger' : '');
                btn.textContent = label;
                btn.addEventListener('click', handler);
                actions.appendChild(btn);
            });
            row.appendChild(actions);

            listEl.appendChild(row);
        });
    }

    formatProjectTimestamp(iso) {
        if (!iso) return '';
        const d = new Date(iso);
        return isNaN(d) ? '' : `modified ${d.toLocaleString()}`;
    }

    /** Save the current graph. First save names it and creates a record;
     *  later saves update the currently open project in place. */
    async saveCurrentToLibrary() {
        if (!this.projectStore) await (this.projectStoreReady || Promise.resolve());
        if (!this.projectStore) {
            this.addOutput('Project storage is unavailable in this browser.\n');
            return;
        }

        if (this.currentProjectId) {
            const existing = await this.projectStore.get(this.currentProjectId);
            if (existing) {
                existing.data = this.serializeGraph();
                existing.name = this.graphName || existing.name;
                existing.modified = new Date().toISOString();
                await this.projectStore.put(existing);
                this.addOutput(`Saved “${existing.name}” to library\n`);
                this.renderProjectList();
                return;
            }
            this.currentProjectId = null; // record vanished; fall through to new
        }

        const name = (prompt('Save project as:', this.graphName || 'untitled') || '').trim();
        if (!name) return;

        const now = new Date().toISOString();
        const project = {
            id: ProjectStorage.newId(),
            name,
            data: this.serializeGraph(),
            created: now,
            modified: now,
        };
        await this.projectStore.put(project);
        this.currentProjectId = project.id;
        this.graphName = name;
        this.addOutput(`Saved “${name}” to library\n`);
        this.renderProjectList();
    }

    async openProject(id) {
        if (!this.projectStore) return;
        const record = await this.projectStore.get(id);
        if (!record) {
            this.addOutput('That project could not be found.\n');
            this.renderProjectList();
            return;
        }

        // Reuse the file-load path, then tag the graph as this library project
        this.currentProjectId = null; // avoid autosaving mid-load
        this.loadGraphFromFile(record.data);
        this.currentProjectId = id;
        this.graphName = record.name;
        this.hideProjectsPanel();
        this.addOutput(`Opened “${record.name}”\n`);
    }

    async renameProject(id) {
        if (!this.projectStore) return;
        const record = await this.projectStore.get(id);
        if (!record) return;
        const name = (prompt('Rename project:', record.name) || '').trim();
        if (!name || name === record.name) return;
        record.name = name;
        record.modified = new Date().toISOString();
        await this.projectStore.put(record);
        if (id === this.currentProjectId) this.graphName = name;
        this.renderProjectList();
    }

    async duplicateProject(id) {
        if (!this.projectStore) return;
        const record = await this.projectStore.get(id);
        if (!record) return;
        const now = new Date().toISOString();
        await this.projectStore.put({
            id: ProjectStorage.newId(),
            name: `${record.name} copy`,
            data: record.data,
            created: now,
            modified: now,
        });
        this.renderProjectList();
    }

    async deleteProject(id) {
        if (!this.projectStore) return;
        const record = await this.projectStore.get(id);
        const label = record ? `“${record.name}”` : 'this project';
        if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return;
        await this.projectStore.remove(id);
        if (id === this.currentProjectId) this.currentProjectId = null;
        this.renderProjectList();
    }

    /** Debounced autosave of the open project. Triggered by edits (via
     *  scheduleAutoCompile); a no-op until a project has been saved/opened. */
    scheduleLibraryAutosave() {
        if (!this.projectStore || !this.currentProjectId) return;
        clearTimeout(this.librarySaveTimeout);
        this.librarySaveTimeout = setTimeout(() => this.autosaveCurrentProject(), 800);
    }

    async autosaveCurrentProject() {
        if (!this.projectStore || !this.currentProjectId) return;
        const record = await this.projectStore.get(this.currentProjectId);
        if (!record) { this.currentProjectId = null; return; }
        record.data = this.serializeGraph();
        record.name = this.graphName || record.name;
        record.modified = new Date().toISOString();
        await this.projectStore.put(record);
    }
});
