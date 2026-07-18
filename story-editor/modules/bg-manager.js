/* ═══════════════════════════════════════════════════════════════
   Background Manager - 背景管理
   ═══════════════════════════════════════════════════════════════ */

const BgManager = (() => {

    let app = null;
    let container = null;

    const PRESET_BGS = [
        { id: 'bg_classroom', name: '教室', color: '#8b7355' },
        { id: 'bg_schoolyard', name: '校园', color: '#4a7c59' },
        { id: 'bg_chess_room', name: '棋社活动室', color: '#6b5b95' },
        { id: 'bg_night_city', name: '夜景城市', color: '#1a1a2e' },
        { id: 'bg_cyberspace', name: '网络空间', color: '#00ff88' },
        { id: 'bg_black', name: '纯黑', color: '#000000' },
        { id: 'bg_white', name: '纯白', color: '#ffffff' },
    ];

    function init(appRef) {
        app = appRef;
        container = document.getElementById('bg-list');

        document.getElementById('btn-add-bg').addEventListener('click', () => {
            showBgMenu();
        });
    }

    function showBgMenu() {
        const menu = document.createElement('div');
        menu.className = 'node-type-menu show';
        menu.style.position = 'fixed';
        menu.style.top = '50%';
        menu.style.left = '50%';
        menu.style.transform = 'translate(-50%, -50%)';
        menu.style.minWidth = '220px';
        menu.style.zIndex = '1500';
        menu.style.display = 'block';

        // 预设背景
        const presetTitle = document.createElement('div');
        presetTitle.style.fontSize = '11px';
        presetTitle.style.color = 'var(--text-muted)';
        presetTitle.style.padding = '6px 10px';
        presetTitle.textContent = '预设背景（纯色）';
        menu.appendChild(presetTitle);

        PRESET_BGS.forEach(bg => {
            const item = document.createElement('div');
            item.className = 'node-type-item';
            item.innerHTML = `
                <span class="type-icon" style="background:${bg.color};width:16px;height:16px;border-radius:3px;display:inline-block;"></span>
                <span class="type-name">${bg.name}</span>
            `;
            item.onclick = () => {
                addPresetBg(bg);
                menu.remove();
            };
            menu.appendChild(item);
        });

        // 自定义上传
        const sep = document.createElement('div');
        sep.style.height = '1px';
        sep.style.background = 'var(--border-color)';
        sep.style.margin = '4px 0';
        menu.appendChild(sep);

        const uploadItem = document.createElement('div');
        uploadItem.className = 'node-type-item';
        uploadItem.innerHTML = `
            <span class="type-icon">📤</span>
            <span class="type-name">上传自定义背景</span>
        `;
        uploadItem.onclick = () => {
            menu.remove();
            uploadCustomBg();
        };
        menu.appendChild(uploadItem);

        document.body.appendChild(menu);

        const close = (e) => {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', close);
            }
        };
        setTimeout(() => document.addEventListener('click', close), 0);
    }

    function addPresetBg(bg) {
        const id = bg.id + '_' + Date.now().toString(36).slice(-4);
        app.state.story.backgrounds.push({
            id,
            name: bg.name,
            image: null,
            color: bg.color,
            type: 'solid'
        });
        app.render();
        app.markDirty();
    }

    function uploadCustomBg() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = () => {
            const file = input.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (e) => {
                const id = 'bg_custom_' + Date.now().toString(36);
                app.state.story.backgrounds.push({
                    id,
                    name: file.name.replace(/\.[^.]+$/, ''),
                    image: e.target.result, // base64 data URL
                    type: 'image'
                });
                app.render();
                app.markDirty();
                app.toast('背景已添加', 'success');
            };
            reader.readAsDataURL(file);
        };
        input.click();
    }

    function render() {
        if (!container) return;

        container.innerHTML = '';
        const bgs = app.state.story.backgrounds || [];

        if (bgs.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'empty-state';
            empty.style.padding = '20px';
            empty.innerHTML = `
                <div class="empty-icon">🖼️</div>
                <p>暂无背景</p>
            `;
            container.appendChild(empty);
            return;
        }

        bgs.forEach((bg, idx) => {
            const item = document.createElement('div');
            item.className = 'bg-item';

            const thumb = document.createElement('div');
            thumb.className = 'bg-thumb';
            if (bg.type === 'solid' && bg.color) {
                thumb.style.background = bg.color;
            } else if (bg.image) {
                thumb.style.backgroundImage = `url(${bg.image})`;
            } else {
                thumb.style.background = '#333';
            }

            const info = document.createElement('div');
            info.className = 'bg-info';
            const name = document.createElement('div');
            name.className = 'bg-name';
            name.textContent = bg.name;
            name.style.cursor = 'pointer';
            name.title = '点击重命名';
            name.onclick = () => {
                const newName = prompt('背景名称:', bg.name);
                if (newName !== null && newName.trim()) {
                    bg.name = newName.trim();
                    app.render();
                    app.markDirty();
                }
            };
            info.appendChild(name);

            const delBtn = document.createElement('button');
            delBtn.className = 'btn-icon';
            delBtn.textContent = '✕';
            delBtn.title = '删除';
            delBtn.onclick = () => {
                if (confirm('删除此背景？')) {
                    app.state.story.backgrounds.splice(idx, 1);
                    app.render();
                    app.markDirty();
                }
            };

            item.appendChild(thumb);
            item.appendChild(info);
            item.appendChild(delBtn);
            container.appendChild(item);
        });
    }

    function getBg(id) {
        return app.state.story.backgrounds?.find(b => b.id === id);
    }

    function applyBgToElement(bgId, element) {
        const bg = getBg(bgId);
        if (!bg) {
            element.style.background = '#000';
            element.style.backgroundImage = 'none';
            return;
        }
        if (bg.type === 'solid' && bg.color) {
            element.style.background = bg.color;
            element.style.backgroundImage = 'none';
        } else if (bg.image) {
            element.style.backgroundImage = `url(${bg.image})`;
            element.style.backgroundSize = 'cover';
            element.style.backgroundPosition = 'center';
        }
    }

    return { init, render, getBg, applyBgToElement };

})();
