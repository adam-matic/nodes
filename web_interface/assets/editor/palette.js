/**
 * Node palette sidebar: click an entry to add a node at the center of the
 * canvas, or drag it onto the canvas to place it exactly. Replaces the old
 * "Add Node" popup menu.
 */
applyEditorMixin(class {
    setupPalette() {
        const palette = document.getElementById('node-palette');
        if (!palette) return;

        palette.querySelectorAll('.palette-item').forEach(item => {
            const type = item.dataset.type;

            // Click: add at the center of the visible canvas
            item.addEventListener('click', () => {
                const rect = this.canvasEl.getBoundingClientRect();
                const pos = this.screenToWorld(rect.width / 2, rect.height / 2);
                this.createNode(type, pos);
            });

            // Drag onto the canvas to place at the drop position
            item.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/x-node-type', type);
                e.dataTransfer.effectAllowed = 'copy';
            });
        });

        this.canvasEl.addEventListener('dragover', (e) => {
            if (e.dataTransfer.types.includes('text/x-node-type')) {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
            }
        });

        this.canvasEl.addEventListener('drop', (e) => {
            const type = e.dataTransfer.getData('text/x-node-type');
            if (!type) return;
            e.preventDefault();
            const rect = this.canvasEl.getBoundingClientRect();
            const pos = this.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
            this.createNode(type, pos);
        });
    }
});
