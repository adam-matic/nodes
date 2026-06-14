/**
 * Node palette sidebar: click an entry to add a node at the center of the
 * canvas, or drag it onto the canvas to place it exactly. Replaces the old
 * "Add Node" popup menu.
 *
 * Primitive nodes are listed statically in index.html (data-type); library
 * nodes (stdlib modules — see editor/library.js) are generated from
 * NodeLibrary.REGISTRY into #library-sections and carry data-library.
 */
applyEditorMixin(class {
    setupPalette() {
        const palette = document.getElementById('node-palette');
        if (!palette) return;

        this.buildLibraryPalette();

        palette.querySelectorAll('.palette-item').forEach(item => {
            const type = item.dataset.type;
            const libraryName = item.dataset.library;

            // Click: add at the center of the visible canvas
            item.addEventListener('click', () => {
                const rect = this.canvasEl.getBoundingClientRect();
                const pos = this.screenToWorld(rect.width / 2, rect.height / 2);
                if (libraryName) {
                    this.createLibraryNode(libraryName, pos);
                } else if (type) {
                    this.createNode(type, pos);
                }
            });

            // Drag onto the canvas to place at the drop position
            item.addEventListener('dragstart', (e) => {
                if (libraryName) {
                    e.dataTransfer.setData('text/x-library-name', libraryName);
                } else if (type) {
                    e.dataTransfer.setData('text/x-node-type', type);
                }
                e.dataTransfer.effectAllowed = 'copy';
            });
        });

        this.canvasEl.addEventListener('dragover', (e) => {
            const types = e.dataTransfer.types;
            if (types.includes('text/x-node-type') || types.includes('text/x-library-name')) {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
            }
        });

        this.canvasEl.addEventListener('drop', (e) => {
            const type = e.dataTransfer.getData('text/x-node-type');
            const libraryName = e.dataTransfer.getData('text/x-library-name');
            if (!type && !libraryName) return;
            e.preventDefault();
            const rect = this.canvasEl.getBoundingClientRect();
            const pos = this.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
            if (libraryName) {
                this.createLibraryNode(libraryName, pos);
            } else {
                this.createNode(type, pos);
            }
        });

        // Palette search: filter items and section headings by query
        const searchInput = document.getElementById('palette-search');
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                const q = searchInput.value.trim().toLowerCase();
                palette.querySelectorAll('.palette-section').forEach(section => {
                    const items = section.querySelectorAll('.palette-item');
                    let anyVisible = false;
                    items.forEach(item => {
                        const text = (
                            item.textContent + ' ' +
                            (item.dataset.library || '') + ' ' +
                            (item.dataset.type || '')
                        ).toLowerCase();
                        const visible = !q || text.includes(q);
                        item.style.display = visible ? '' : 'none';
                        if (visible) anyVisible = true;
                    });
                    section.style.display = anyVisible ? '' : 'none';
                });
            });
        }
    }

    /** Populate #library-sections with one button per NodeLibrary entry,
     *  grouped by category in registry order. */
    buildLibraryPalette() {
        const container = document.getElementById('library-sections');
        if (!container || typeof NodeLibrary === 'undefined') return;

        container.innerHTML = '';
        let currentCategory = null;
        let sectionEl = null;

        NodeLibrary.REGISTRY.forEach(entry => {
            if (entry.category !== currentCategory) {
                currentCategory = entry.category;
                sectionEl = document.createElement('div');
                sectionEl.className = 'palette-section';
                const heading = document.createElement('div');
                heading.className = 'palette-heading';
                heading.textContent = currentCategory;
                sectionEl.appendChild(heading);
                container.appendChild(sectionEl);
            }

            const btn = document.createElement('button');
            btn.className = 'palette-item library';
            btn.draggable = true;
            btn.dataset.library = entry.name;
            btn.textContent = entry.label;
            btn.title = entry.name;
            sectionEl.appendChild(btn);
        });
    }
});
