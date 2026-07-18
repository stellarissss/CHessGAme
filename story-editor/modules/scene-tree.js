/* ═══════════════════════════════════════════════════════════════
   Scene Tree - 场景树面板
   ═══════════════════════════════════════════════════════════════ */

const SceneTree = (() => {

    let container = null;
    let app = null;

    function init(appRef) {
        app = appRef;
        container = document.getElementById('scene-tree');

        document.getElementById('btn-add-scene').addEventListener('click', () => {
            const scene = StorySchema.createScene(`场景 ${app.state.story.scenes.length + 1}`);
            app.state.story.scenes.push(scene);
            app.state.currentSceneId = scene.id;
            app.render();
            app.markDirty();
        });
    }

    function render() {
        if (!container) return;
        const story = app.state.story;
        const currentId = app.state.currentSceneId;

        container.innerHTML = '';

        story.scenes.forEach((scene, index) => {
            const item = document.createElement('div');
            item.className = 'scene-item' + (scene.id === currentId ? ' active' : '');
            item.dataset.sceneId = scene.id;

            const drag = document.createElement('span');
            drag.className = 'scene-drag';
            drag.textContent = '⋮⋮';
            drag.title = '拖拽排序';

            const name = document.createElement('span');
            name.className = 'scene-name';
            name.textContent = scene.name;
            name.title = '双击重命名';

            const actions = document.createElement('div');
            actions.className = 'scene-actions';

            const renameBtn = document.createElement('button');
            renameBtn.className = 'btn-icon';
            renameBtn.textContent = '✎';
            renameBtn.title = '重命名';
            renameBtn.onclick = (e) => {
                e.stopPropagation();
                startRename(item, scene);
            };

            const delBtn = document.createElement('button');
            delBtn.className = 'btn-icon';
            delBtn.textContent = '✕';
            delBtn.title = '删除场景';
            delBtn.onclick = (e) => {
                e.stopPropagation();
                deleteScene(scene.id);
            };

            actions.appendChild(renameBtn);
            actions.appendChild(delBtn);

            item.appendChild(drag);
            item.appendChild(name);
            item.appendChild(actions);

            item.addEventListener('click', () => {
                app.selectScene(scene.id);
            });

            item.addEventListener('dblclick', (e) => {
                if (e.target === name || e.target === item) {
                    startRename(item, scene);
                }
            });

            container.appendChild(item);
        });
    }

    function startRename(item, scene) {
        const nameEl = item.querySelector('.scene-name');
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'scene-rename-input';
        input.value = scene.name;
        nameEl.replaceWith(input);
        input.focus();
        input.select();

        const finish = (save) => {
            if (save && input.value.trim()) {
                scene.name = input.value.trim();
                app.markDirty();
            }
            app.render();
        };

        input.addEventListener('blur', () => finish(true));
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                input.blur();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                finish(false);
            }
        });
    }

    function deleteScene(sceneId) {
        const scenes = app.state.story.scenes;
        if (scenes.length <= 1) {
            app.toast('至少保留一个场景', 'error');
            return;
        }
        if (!confirm('确定删除此场景吗？此操作不可撤销。')) return;

        const idx = scenes.findIndex(s => s.id === sceneId);
        if (idx >= 0) {
            scenes.splice(idx, 1);
            if (app.state.currentSceneId === sceneId) {
                app.state.currentSceneId = scenes[Math.max(0, idx - 1)].id;
            }
            app.render();
            app.markDirty();
        }
    }

    return { init, render };

})();
