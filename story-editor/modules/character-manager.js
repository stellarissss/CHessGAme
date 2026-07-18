/* ═══════════════════════════════════════════════════════════════
   Character Manager - 角色管理
   ═══════════════════════════════════════════════════════════════ */

const CharacterManager = (() => {

    let app = null;
    let container = null;

    function init(appRef) {
        app = appRef;
        container = document.getElementById('character-list');

        document.getElementById('btn-add-character').addEventListener('click', () => {
            const id = 'char_' + Date.now().toString(36);
            app.state.story.characters.push({
                id,
                name: '新角色',
                color: '#4ade80',
                portraits: []
            });
            app.render();
            app.markDirty();
        });
    }

    async function loadFromAssets() {
        // 从服务器加载 assets/characters/ 下的角色
        try {
            const resp = await fetch('/api/characters/list?debug=1');
            if (resp.ok) {
                const data = await resp.json();
                return { characters: data.characters || [], debug: data.debug, error: null };
            }
            return { characters: [], debug: null, error: `HTTP ${resp.status}: ${resp.statusText}` };
        } catch (e) {
            console.warn('Failed to load characters from assets:', e);
            return { characters: [], debug: null, error: e.message || '网络请求失败' };
        }
    }

    function importAssetCharacter(assetChar) {
        if (!assetChar || !assetChar.id) return;
        // 检查是否已存在
        if (app.state.story.characters.find(c => c.id === assetChar.id)) {
            app.toast('角色已存在', 'info');
            return;
        }
        app.state.story.characters.push({
            id: assetChar.id,
            name: assetChar.name || assetChar.id,
            color: assetChar.color || '#4ade80',
            portraits: (assetChar.portraits || []).map(p => ({
                expression: p.expression,
                image: p.image
            }))
        });
        app.render();
        app.markDirty();
        app.toast(`已导入角色: ${assetChar.name || assetChar.id}`, 'success');
    }

    function render() {
        if (!container) return;

        container.innerHTML = '';

        const characters = app.state.story.characters || [];

        if (characters.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'empty-state';
            empty.style.padding = '20px';
            empty.innerHTML = `
                <div class="empty-icon">👤</div>
                <p>暂无角色</p>
            `;
            container.appendChild(empty);
            // 继续往下，添加操作按钮
        } else {
            characters.forEach((char, idx) => {
                const item = document.createElement('div');
                item.className = 'char-item';

                const avatar = document.createElement('div');
                avatar.className = 'char-avatar';
                avatar.style.borderColor = char.color || '#888';
                avatar.textContent = (char.name || '?').charAt(0);
                avatar.style.background = (char.color || '#4ade80') + '20';

                const info = document.createElement('div');
                info.className = 'char-info';
                const name = document.createElement('div');
                name.className = 'char-name';
                name.textContent = char.name;
                name.title = '点击编辑';
                name.style.cursor = 'pointer';
                name.onclick = () => editCharacter(idx);
                info.appendChild(name);

                const expCount = document.createElement('div');
                expCount.className = 'char-expressions';
                expCount.textContent = `${char.portraits?.length || 0} 个表情`;
                info.appendChild(expCount);

                const delBtn = document.createElement('button');
                delBtn.className = 'btn-icon';
                delBtn.textContent = '✕';
                delBtn.title = '删除角色';
                delBtn.onclick = () => {
                    if (confirm(`删除角色 "${char.name}"？`)) {
                        app.state.story.characters.splice(idx, 1);
                        app.render();
                        app.markDirty();
                    }
                };

                item.appendChild(avatar);
                item.appendChild(info);
                item.appendChild(delBtn);
                container.appendChild(item);
            });
        }

        // 操作按钮区域
        const btnRow = document.createElement('div');
        btnRow.style.display = 'flex';
        btnRow.style.gap = '6px';
        btnRow.style.marginTop = '8px';

        const importBtn = document.createElement('button');
        importBtn.className = 'btn';
        importBtn.style.flex = '1';
        importBtn.textContent = '📥 从资产导入';
        importBtn.onclick = async () => {
            importBtn.disabled = true;
            importBtn.textContent = '加载中...';
            const result = await loadFromAssets();
            importBtn.disabled = false;
            importBtn.textContent = '📥 从资产导入';
            showImportDialog(result);
        };
        btnRow.appendChild(importBtn);

        const aiBtn = document.createElement('button');
        aiBtn.className = 'btn btn-primary';
        aiBtn.style.flex = '1';
        aiBtn.textContent = '✨ AI 创建';
        aiBtn.title = '用 AI 生成新角色';
        aiBtn.onclick = () => {
            if (window.CharacterCreator) {
                window.CharacterCreator.open();
            } else {
                app.toast('AI 创建功能加载中...', 'info');
            }
        };
        btnRow.appendChild(aiBtn);

        container.appendChild(btnRow);

        const bgRemoveBtn = document.createElement('button');
        bgRemoveBtn.className = 'btn';
        bgRemoveBtn.style.width = '100%';
        bgRemoveBtn.style.marginTop = '6px';
        bgRemoveBtn.textContent = '🪄 批量抠图';
        bgRemoveBtn.title = '为所有资产角色图片去除背景';
        bgRemoveBtn.onclick = () => {
            startBatchBgRemove();
        };
        container.appendChild(bgRemoveBtn);
    }

    function editCharacter(idx) {
        const char = app.state.story.characters[idx];
        const newName = prompt('角色名称:', char.name);
        if (newName !== null && newName.trim()) {
            char.name = newName.trim();
            app.render();
            app.markDirty();
        }
    }

    async function startBatchBgRemove() {
        if (!confirm('确定要对所有资产角色图片进行批量抠图吗？\n\n已有透明背景的图片会自动跳过，原图会自动备份为 .original.png。')) {
            return;
        }

        const modal = document.createElement('div');
        modal.className = 'modal show';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 500px;">
                <div class="modal-header">
                    <h3>🪄 批量抠图</h3>
                    <button class="btn-icon modal-close">×</button>
                </div>
                <div class="modal-body" id="bg-remove-body" style="padding: 20px;">
                    <div style="text-align: center; padding: 20px 0;">
                        <div style="font-size: 48px; margin-bottom: 16px;">🖼️</div>
                        <h4 style="margin-bottom: 8px;">正在处理...</h4>
                        <p style="color: #9ca3af; font-size: 13px;" id="bg-remove-status">准备中</p>
                    </div>
                    <div id="bg-remove-log" style="max-height: 200px; overflow-y: auto; background: #111827; border-radius: 6px; padding: 10px; font-family: monospace; font-size: 11px; color: #9ca3af;">
                        <div>等待任务启动...</div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        modal.querySelector('.modal-close').onclick = () => modal.remove();
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });

        const logEl = modal.querySelector('#bg-remove-log');
        const statusEl = modal.querySelector('#bg-remove-status');

        function addLog(msg) {
            const line = document.createElement('div');
            line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
            logEl.appendChild(line);
            logEl.scrollTop = logEl.scrollHeight;
        }

        try {
            addLog('启动批量抠图任务...');
            const resp = await fetch('/api/assets/batch-remove-bg', { method: 'POST' });
            const data = await resp.json();

            if (!data.success) {
                throw new Error(data.error || '启动失败');
            }

            const taskId = data.task_id;
            addLog(`任务已启动: ${taskId}`);
            statusEl.textContent = '处理中...';

            // 轮询状态
            const pollInterval = setInterval(async () => {
                try {
                    const resp2 = await fetch(`/api/assets/batch-remove-bg/${taskId}`);
                    const data2 = await resp2.json();

                    if (!data2.success) {
                        throw new Error(data2.error || '查询失败');
                    }

                    // 显示新增的进度
                    const progress = data2.progress || [];
                    const currentLines = logEl.children.length - 1;
                    for (let i = currentLines - 1; i < progress.length; i++) {
                        if (progress[i]) {
                            const p = progress[i];
                            let statusText = p.status;
                            if (p.status === 'done') statusText = '✓ 完成';
                            else if (p.status === 'skipped') statusText = '○ 跳过(已有透明)';
                            else if (p.status === 'skipped_no_rembg') statusText = '○ 跳过(无抠图库)';
                            else if (p.status === 'processing') statusText = '⏳ 处理中';
                            else if (p.status.startsWith('failed')) statusText = '✗ 失败';
                            addLog(`${p.char_id}/${p.filename}: ${statusText}`);
                        }
                    }

                    if (data2.status === 'done') {
                        clearInterval(pollInterval);
                        statusEl.textContent = '完成！';

                        const result = data2.result || {};
                        let totalProcessed = 0;
                        let totalSkipped = 0;
                        let totalFailed = 0;
                        Object.entries(result).forEach(([charId, stats]) => {
                            if (stats.error) return;
                            totalProcessed += stats.processed || 0;
                            totalSkipped += stats.skipped || 0;
                            totalFailed += stats.failed || 0;
                        });

                        addLog('═══ 完成 ═══');
                        addLog(`处理完成: ${totalProcessed} 张`);
                        addLog(`跳过: ${totalSkipped} 张`);
                        if (totalFailed > 0) addLog(`失败: ${totalFailed} 张`);

                        // 添加关闭按钮
                        const body = modal.querySelector('#bg-remove-body');
                        const btnDiv = document.createElement('div');
                        btnDiv.style.cssText = 'display: flex; gap: 10px; justify-content: flex-end; margin-top: 16px;';
                        btnDiv.innerHTML = `<button class="btn btn-primary">完成</button>`;
                        btnDiv.querySelector('button').onclick = () => modal.remove();
                        body.appendChild(btnDiv);

                        app.toast(`批量抠图完成：处理 ${totalProcessed} 张，跳过 ${totalSkipped} 张`, 'success');
                    }
                } catch (e) {
                    clearInterval(pollInterval);
                    addLog('错误: ' + e.message);
                    statusEl.textContent = '出错了';
                }
            }, 1500);

        } catch (e) {
            addLog('错误: ' + e.message);
            statusEl.textContent = '启动失败';
            app.toast('批量抠图启动失败: ' + e.message, 'error');
        }
    }

    function showImportDialog(result) {
        const assets = result?.characters || [];
        const error = result?.error;
        const debug = result?.debug;

        const modal = document.createElement('div');
        modal.className = 'modal show';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>从资产导入角色</h3>
                    <div style="display:flex; gap:8px; align-items:center;">
                        <button class="btn-icon" id="refresh-assets-btn" title="刷新">🔄</button>
                        <button class="btn-icon modal-close">×</button>
                    </div>
                </div>
                <div class="modal-body" id="import-char-list"></div>
            </div>
        `;
        document.body.appendChild(modal);

        const list = modal.querySelector('#import-char-list');

        function render(listData, errInfo) {
            list.innerHTML = '';

            if (errInfo) {
                const errDiv = document.createElement('div');
                errDiv.style.cssText = 'padding:20px; text-align:center; color:#f87171;';
                errDiv.innerHTML = `
                    <div style="font-size:32px; margin-bottom:8px;">⚠️</div>
                    <div style="font-weight:600; margin-bottom:4px;">加载失败</div>
                    <div style="font-size:12px; opacity:0.8; margin-bottom:12px;">${errInfo}</div>
                    <div style="font-size:11px; opacity:0.6; text-align:left; background:#1f2937; padding:10px; border-radius:6px;">
                        <div>可能的原因：</div>
                        <div>• 后端服务未启动（需要 python main.py）</div>
                        <div>• 网络连接问题</div>
                        <div>• assets/characters/ 目录不存在</div>
                    </div>
                `;
                list.appendChild(errDiv);
                return;
            }

            if (listData.length === 0) {
                const emptyDiv = document.createElement('div');
                emptyDiv.style.cssText = 'padding:20px; text-align:center;';
                let debugInfo = '';
                if (debug) {
                    debugInfo = `<div style="font-size:11px; opacity:0.6; text-align:left; margin-top:12px; background:#1f2937; padding:10px; border-radius:6px;">
                        <div>资产目录: ${debug.characters_dir || '未知'}</div>
                        <div>目录存在: ${debug.dir_exists ? '是' : '否'}</div>
                        <div>扫描到: ${(debug.dirs_scanned || []).length} 个文件夹</div>
                        ${debug.errors?.length ? `<div style="color:#f87171;">错误: ${debug.errors.join(', ')}</div>` : ''}
                    </div>`;
                }
                emptyDiv.innerHTML = `
                    <div style="font-size:32px; margin-bottom:8px;">📂</div>
                    <div style="font-weight:600; margin-bottom:4px;">资产中没有找到角色</div>
                    <div style="font-size:12px; opacity:0.8;">请确保 story-editor/assets/characters/ 目录下有角色资源</div>
                    ${debugInfo}
                `;
                list.appendChild(emptyDiv);
                return;
            }

            listData.forEach(ac => {
                const item = document.createElement('div');
                item.className = 'story-list-item';
                const thumb = ac.portraits?.[0]?.image ? `<img src="${ac.portraits[0].image}" style="width:40px;height:40px;border-radius:6px;object-fit:cover;margin-right:12px;">` : `<div style="width:40px;height:40px;border-radius:6px;background:#374151;display:flex;align-items:center;justify-content:center;margin-right:12px;">👤</div>`;
                item.innerHTML = `
                    <div style="display:flex;align-items:center;">
                        ${thumb}
                        <div>
                            <div class="story-title">${ac.name || ac.id}</div>
                            <div class="story-meta">${ac.portraits?.length || 0} 个表情 · ${ac.source === 'manifest' ? 'manifest' : '目录扫描'}</div>
                            ${ac.description ? `<div class="story-meta" style="opacity:0.7;">${ac.description}</div>` : ''}
                        </div>
                    </div>
                    <button class="btn btn-sm">导入</button>
                `;
                item.querySelector('button').onclick = () => {
                    importAssetCharacter(ac);
                    modal.remove();
                };
                list.appendChild(item);
            });
        }

        render(assets, error);

        modal.querySelector('#refresh-assets-btn').onclick = async () => {
            const listEl = modal.querySelector('#import-char-list');
            listEl.innerHTML = '<div style="padding:30px; text-align:center; opacity:0.7;">⏳ 加载中...</div>';
            const newResult = await loadFromAssets();
            render(newResult.characters || [], newResult.error);
        };

        modal.querySelector('.modal-close').onclick = () => modal.remove();
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
    }

    function getCharacter(id) {
        return app.state.story.characters?.find(c => c.id === id);
    }

    function getPortrait(charId, expression) {
        const char = getCharacter(charId);
        if (!char) return null;
        const p = char.portraits?.find(p => p.expression === expression);
        if (p) return p.image;
        // fallback 到第一张
        return char.portraits?.[0]?.image || null;
    }

    return { init, render, loadFromAssets, importAssetCharacter, getCharacter, getPortrait };

})();
