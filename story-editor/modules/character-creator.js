/* ═══════════════════════════════════════════════════════════════
   AI Character Creator - AI 角色创建器
   ═══════════════════════════════════════════════════════════════ */

const CharacterCreator = (() => {

    let app = null;
    let config = null;
    let modal = null;
    let currentTaskId = null;
    let pollInterval = null;
    let selectedExpressions = new Set();
    let currentStyle = 'pixel';
    let generatedImages = {}; // {expression: url}

    function init(appRef) {
        app = appRef;
        loadConfig();
    }

    async function loadConfig() {
        try {
            const resp = await fetch('/api/ai/config');
            if (resp.ok) {
                config = await resp.json();
                // 默认选中前8个表情
                if (config.default_expressions) {
                    selectedExpressions = new Set(config.default_expressions);
                }
            }
        } catch (e) {
            console.warn('Failed to load AI config:', e);
        }
    }

    function open() {
        if (!config) {
            app.toast('AI 配置加载中，请稍候...', 'info');
            setTimeout(open, 500);
            return;
        }
        renderModal();
    }

    function close() {
        if (modal) {
            modal.remove();
            modal = null;
        }
        if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
        }
        currentTaskId = null;
        generatedImages = {};
    }

    function renderModal() {
        if (modal) modal.remove();

        modal = document.createElement('div');
        modal.className = 'modal show';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 900px; width: 90vw; max-height: 85vh;">
                <div class="modal-header">
                    <h3>✨ AI 角色创建</h3>
                    <button class="btn-icon modal-close">×</button>
                </div>
                <div class="modal-body" style="overflow-y: auto; padding: 20px;">
                    <div id="cc-step-form">
                        ${renderFormStep()}
                    </div>
                    <div id="cc-step-generating" style="display: none;">
                        ${renderGeneratingStep()}
                    </div>
                    <div id="cc-step-result" style="display: none;">
                        ${renderResultStep()}
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        modal.querySelector('.modal-close').onclick = close;
        modal.addEventListener('click', (e) => {
            if (e.target === modal) close();
        });

        bindFormEvents();
    }

    function renderFormStep() {
        const expressionsByCategory = {};
        if (config?.all_expressions) {
            config.all_expressions.forEach(exp => {
                if (!expressionsByCategory[exp.category]) {
                    expressionsByCategory[exp.category] = [];
                }
                expressionsByCategory[exp.category].push(exp);
            });
        }

        const styleOptions = config?.style_presets ? Object.entries(config.style_presets).map(
            ([key, val]) => `
                <label style="display: flex; align-items: center; gap: 8px; padding: 8px 12px; border: 1px solid #374151; border-radius: 6px; cursor: pointer; ${key === currentStyle ? 'border-color: #4ade80; background: #4ade8010;' : ''}">
                    <input type="radio" name="cc-style" value="${key}" ${key === currentStyle ? 'checked' : ''}>
                    <span>${val.name}</span>
                </label>
            `
        ).join('') : '';

        const expressionHtml = Object.entries(expressionsByCategory).map(([cat, exps]) => `
            <div style="margin-bottom: 12px;">
                <div style="font-size: 12px; color: #9ca3af; margin-bottom: 6px; font-weight: 600;">${cat}</div>
                <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                    ${exps.map(exp => `
                        <label class="cc-exp-chip" style="padding: 4px 10px; border: 1px solid #374151; border-radius: 14px; font-size: 12px; cursor: pointer; user-select: none; ${selectedExpressions.has(exp.key) ? 'border-color: #4ade80; background: #4ade8020; color: #4ade80;' : ''}">
                            <input type="checkbox" value="${exp.key}" ${selectedExpressions.has(exp.key) ? 'checked' : ''} style="display: none;">
                            ${exp.label}
                        </label>
                    `).join('')}
                </div>
            </div>
        `).join('');

        return `
            <div style="display: flex; flex-direction: column; gap: 16px;">
                ${!config?.api_key_configured ? `
                    <div style="padding: 12px; background: #fbbf2420; border: 1px solid #fbbf24; border-radius: 8px; font-size: 13px; color: #fbbf24;">
                        ⚠️ API Key 未配置。请设置环境变量 <code>ARK_API_KEY</code> 后重启服务。
                    </div>
                ` : ''}
                
                <div style="display: flex; gap: 12px;">
                    <div style="flex: 1;">
                        <label style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 6px;">角色名称</label>
                        <input type="text" id="cc-char-name" placeholder="例如：小明" style="width: 100%; padding: 8px 10px; background: #1f2937; border: 1px solid #374151; border-radius: 6px; color: #fff; font-size: 14px;">
                    </div>
                    <div style="flex: 1;">
                        <label style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 6px;">角色 ID (英文)</label>
                        <input type="text" id="cc-char-id" placeholder="例如：xiaoming" style="width: 100%; padding: 8px 10px; background: #1f2937; border: 1px solid #374151; border-radius: 6px; color: #fff; font-size: 14px;">
                    </div>
                    <div style="width: 80px;">
                        <label style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 6px;">主题色</label>
                        <input type="color" id="cc-char-color" value="#4ade80" style="width: 100%; height: 36px; background: #1f2937; border: 1px solid #374151; border-radius: 6px; cursor: pointer;">
                    </div>
                </div>

                <div>
                    <label style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 6px;">
                        外貌描述 <span style="color: #9ca3af; font-weight: 400;">(描述角色的外貌、服装、性格等)</span>
                    </label>
                    <textarea id="cc-description" rows="4" placeholder="例如：一个16岁的少年，黑色短发，明亮的眼睛，穿着蓝色校服外套和白色T恤，性格开朗阳光..." 
                        style="width: 100%; padding: 10px; background: #1f2937; border: 1px solid #374151; border-radius: 6px; color: #fff; font-size: 14px; resize: vertical; font-family: inherit;"></textarea>
                </div>

                <div>
                    <label style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 6px;">风格预设</label>
                    <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                        ${styleOptions}
                    </div>
                </div>

                <div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <label style="font-size: 13px; font-weight: 600;">
                            表情/姿态 <span style="color: #9ca3af; font-weight: 400;">(已选 <span id="cc-exp-count">${selectedExpressions.size}</span> 个)</span>
                        </label>
                        <div style="display: flex; gap: 8px;">
                            <button class="btn btn-sm" id="cc-select-all" style="font-size: 11px;">全选</button>
                            <button class="btn btn-sm" id="cc-select-none" style="font-size: 11px;">清空</button>
                            <button class="btn btn-sm" id="cc-select-default" style="font-size: 11px;">默认</button>
                        </div>
                    </div>
                    ${expressionHtml}
                </div>

                <div style="display: flex; gap: 10px; justify-content: flex-end; padding-top: 8px; border-top: 1px solid #374151;">
                    <button class="btn" id="cc-cancel">取消</button>
                    <button class="btn btn-primary" id="cc-submit">🚀 开始生成</button>
                </div>
            </div>
        `;
    }

    function renderGeneratingStep() {
        return `
            <div style="text-align: center; padding: 20px 0;">
                <div style="font-size: 48px; margin-bottom: 16px;">🎨</div>
                <h3 style="margin-bottom: 8px;">AI 正在创作角色...</h3>
                <p style="color: #9ca3af; font-size: 14px; margin-bottom: 20px;" id="cc-gen-status">准备中...</p>
                
                <div style="max-width: 500px; margin: 0 auto 20px;">
                    <div style="background: #1f2937; height: 8px; border-radius: 4px; overflow: hidden;">
                        <div id="cc-progress-bar" style="height: 100%; background: linear-gradient(90deg, #4ade80, #22d3ee); width: 0%; transition: width 0.3s;"></div>
                    </div>
                    <div style="display: flex; justify-content: space-between; font-size: 12px; color: #6b7280; margin-top: 6px;">
                        <span id="cc-progress-text">0 / 0</span>
                        <span id="cc-progress-percent">0%</span>
                    </div>
                </div>

                <div id="cc-image-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 8px; max-width: 600px; margin: 0 auto;">
                </div>
            </div>
        `;
    }

    function renderResultStep() {
        return `
            <div>
                <div style="text-align: center; margin-bottom: 16px;">
                    <h3 style="margin-bottom: 4px;">✨ 生成完成！</h3>
                    <p style="color: #9ca3af; font-size: 13px;">不满意的图片可以单独重新生成</p>
                </div>

                <div id="cc-result-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 12px; margin-bottom: 20px;">
                </div>

                <div style="display: flex; gap: 10px; justify-content: flex-end; padding-top: 12px; border-top: 1px solid #374151;">
                    <button class="btn" id="cc-back">返回修改</button>
                    <button class="btn btn-primary" id="cc-save">💾 保存到资产库</button>
                </div>
            </div>
        `;
    }

    function bindFormEvents() {
        if (!modal) return;

        const nameInput = modal.querySelector('#cc-char-name');
        const idInput = modal.querySelector('#cc-char-id');

        nameInput?.addEventListener('input', () => {
            if (!idInput.dataset.touched) {
                const name = nameInput.value.trim();
                idInput.value = name.replace(/[^\w\u4e00-\u9fa5]/g, '').toLowerCase();
            }
        });

        idInput?.addEventListener('input', () => {
            idInput.dataset.touched = idInput.value.length > 0;
        });

        // 风格选择
        modal.querySelectorAll('input[name="cc-style"]').forEach(radio => {
            radio.addEventListener('change', () => {
                currentStyle = radio.value;
            });
        });

        // 表情选择
        modal.querySelectorAll('.cc-exp-chip').forEach(chip => {
            const checkbox = chip.querySelector('input');
            chip.addEventListener('click', (e) => {
                e.preventDefault();
                const key = checkbox.value;
                if (selectedExpressions.has(key)) {
                    selectedExpressions.delete(key);
                    chip.style.borderColor = '#374151';
                    chip.style.background = '';
                    chip.style.color = '';
                    checkbox.checked = false;
                } else {
                    selectedExpressions.add(key);
                    chip.style.borderColor = '#4ade80';
                    chip.style.background = '#4ade8020';
                    chip.style.color = '#4ade80';
                    checkbox.checked = true;
                }
                const countEl = modal.querySelector('#cc-exp-count');
                if (countEl) countEl.textContent = selectedExpressions.size;
            });
        });

        modal.querySelector('#cc-select-all')?.addEventListener('click', () => {
            if (config?.all_expressions) {
                config.all_expressions.forEach(exp => selectedExpressions.add(exp.key));
                refreshForm();
            }
        });

        modal.querySelector('#cc-select-none')?.addEventListener('click', () => {
            selectedExpressions.clear();
            refreshForm();
        });

        modal.querySelector('#cc-select-default')?.addEventListener('click', () => {
            if (config?.default_expressions) {
                selectedExpressions = new Set(config.default_expressions);
                refreshForm();
            }
        });

        modal.querySelector('#cc-cancel')?.addEventListener('click', close);

        modal.querySelector('#cc-submit')?.addEventListener('click', startGeneration);
    }

    function refreshForm() {
        const formStep = modal.querySelector('#cc-step-form');
        if (formStep) {
            formStep.innerHTML = renderFormStep();
            bindFormEvents();
        }
    }

    async function startGeneration() {
        const name = modal.querySelector('#cc-char-name').value.trim();
        const charId = modal.querySelector('#cc-char-id').value.trim();
        const color = modal.querySelector('#cc-char-color').value;
        const description = modal.querySelector('#cc-description').value.trim();

        if (!name) {
            app.toast('请输入角色名称', 'error');
            return;
        }
        if (!charId) {
            app.toast('请输入角色 ID', 'error');
            return;
        }
        if (!description) {
            app.toast('请输入外貌描述', 'error');
            return;
        }
        if (selectedExpressions.size === 0) {
            app.toast('请至少选择一个表情/姿态', 'error');
            return;
        }

        // 切换到生成界面
        modal.querySelector('#cc-step-form').style.display = 'none';
        modal.querySelector('#cc-step-generating').style.display = 'block';

        // 初始化图片网格
        renderGeneratingGrid();

        try {
            const resp = await fetch('/api/ai/generate/character', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    char_id: charId,
                    char_name: name,
                    description,
                    expressions: Array.from(selectedExpressions),
                    style: currentStyle,
                    color,
                }),
            });

            const data = await resp.json();
            if (!data.success) {
                throw new Error(data.error || '生成失败');
            }

            currentTaskId = data.task_id;
            startPolling();

        } catch (e) {
            app.toast('启动生成失败: ' + e.message, 'error');
            // 返回表单
            modal.querySelector('#cc-step-form').style.display = 'block';
            modal.querySelector('#cc-step-generating').style.display = 'none';
        }
    }

    function renderGeneratingGrid() {
        const grid = modal.querySelector('#cc-image-grid');
        if (!grid) return;

        const exps = config.all_expressions.filter(e => selectedExpressions.has(e.key));
        grid.innerHTML = exps.map(exp => `
            <div class="cc-gen-item" data-key="${exp.key}" style="aspect-ratio: 1; background: #1f2937; border-radius: 6px; display: flex; flex-direction: column; align-items: center; justify-content: center; border: 2px solid #374151; transition: all 0.3s;">
                <div style="font-size: 24px; margin-bottom: 4px;">⏳</div>
                <div style="font-size: 11px; color: #6b7280;">${exp.label}</div>
            </div>
        `).join('');
    }

    function updateGeneratingItem(key, status, url) {
        const item = modal.querySelector(`.cc-gen-item[data-key="${key}"]`);
        if (!item) return;

        const exp = config.all_expressions.find(e => e.key === key);
        const label = exp?.label || key;

        if (status === 'generating') {
            item.style.borderColor = '#fbbf24';
            item.innerHTML = `
                <div style="font-size: 24px; margin-bottom: 4px;">🎨</div>
                <div style="font-size: 11px; color: #fbbf24;">生成中...</div>
            `;
        } else if (status === 'done' && url) {
            generatedImages[key] = url;
            item.style.borderColor = '#4ade80';
            item.innerHTML = `
                <img src="${url}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 4px;">
            `;
        } else if (status === 'failed') {
            item.style.borderColor = '#f87171';
            item.innerHTML = `
                <div style="font-size: 24px; margin-bottom: 4px;">❌</div>
                <div style="font-size: 11px; color: #f87171;">失败</div>
            `;
        }
    }

    function startPolling() {
        if (pollInterval) clearInterval(pollInterval);

        pollInterval = setInterval(async () => {
            if (!currentTaskId) return;

            try {
                const resp = await fetch(`/api/ai/generate/character/${currentTaskId}`);
                const data = await resp.json();

                if (!data.success) {
                    throw new Error(data.error || '查询失败');
                }

                const task = data.task;
                updateProgress(task);

                if (task.status === 'done' || task.status === 'failed') {
                    clearInterval(pollInterval);
                    pollInterval = null;

                    if (task.status === 'done') {
                        showResult(task);
                    } else {
                        app.toast('生成失败: ' + (task.error || '未知错误'), 'error');
                        close();
                    }
                }
            } catch (e) {
                console.warn('Poll error:', e);
            }
        }, 2000);
    }

    function updateProgress(task) {
        const statusEl = modal.querySelector('#cc-gen-status');
        const barEl = modal.querySelector('#cc-progress-bar');
        const textEl = modal.querySelector('#cc-progress-text');
        const percentEl = modal.querySelector('#cc-progress-percent');

        const total = task.total || 0;
        const done = task.progress || 0;
        const percent = total > 0 ? Math.round((done / total) * 100) : 0;

        const statusMap = {
            pending: '准备中...',
            generating: '正在生成图片...',
            downloading: '正在下载图片...',
            removing_bg: '正在去除背景...',
            saving: '保存中...',
            done: '完成！',
            failed: '失败',
        };

        if (statusEl) statusEl.textContent = statusMap[task.status] || task.status;
        if (barEl) barEl.style.width = percent + '%';
        if (textEl) textEl.textContent = `${done} / ${total}`;
        if (percentEl) percentEl.textContent = percent + '%';

        // 更新每个图片的状态
        if (task.images) {
            Object.entries(task.images).forEach(([key, info]) => {
                updateGeneratingItem(key, info.status, info.url);
            });
        }
    }

    function showResult(task) {
        modal.querySelector('#cc-step-generating').style.display = 'none';
        modal.querySelector('#cc-step-result').style.display = 'block';

        const grid = modal.querySelector('#cc-result-grid');
        if (!grid) return;

        const exps = config.all_expressions.filter(e => selectedExpressions.has(e.key));
        grid.innerHTML = exps.map(exp => {
            const info = task.images?.[exp.key] || {};
            const url = info.url || '';
            const failed = info.status === 'failed';

            return `
                <div class="cc-result-item" data-key="${exp.key}" style="position: relative;">
                    <div style="aspect-ratio: 1; background: #1f2937; border-radius: 8px; overflow: hidden; border: 2px solid ${failed ? '#f87171' : '#374151'};">
                        ${url ? `<img src="${url}" style="width: 100%; height: 100%; object-fit: cover;">` : `<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 32px;">${failed ? '❌' : '⏳'}</div>`}
                    </div>
                    <div style="font-size: 12px; text-align: center; margin-top: 4px; color: #d1d5db;">${exp.label}</div>
                    <button class="cc-regen-btn" data-key="${exp.key}" style="position: absolute; top: 4px; right: 4px; width: 24px; height: 24px; border-radius: 50%; background: rgba(0,0,0,0.7); border: none; color: #fff; cursor: pointer; font-size: 12px; display: flex; align-items: center; justify-content: center;" title="重新生成">🔄</button>
                </div>
            `;
        }).join('');

        // 绑定重生成按钮
        grid.querySelectorAll('.cc-regen-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const key = btn.dataset.key;
                regenerateSingle(key);
            });
        });

        modal.querySelector('#cc-back')?.addEventListener('click', () => {
            modal.querySelector('#cc-step-result').style.display = 'none';
            modal.querySelector('#cc-step-form').style.display = 'block';
            refreshForm();
        });

        modal.querySelector('#cc-save')?.addEventListener('click', () => {
            saveCharacter(task);
        });
    }

    async function regenerateSingle(key) {
        const btn = modal.querySelector(`.cc-regen-btn[data-key="${key}"]`);
        const item = modal.querySelector(`.cc-result-item[data-key="${key}"]`);
        if (!item) return;

        if (btn) {
            btn.disabled = true;
            btn.textContent = '⏳';
        }

        try {
            const resp = await fetch(`/api/ai/generate/character/${currentTaskId}/regenerate/${key}`, {
                method: 'POST',
            });
            const data = await resp.json();

            if (data.success) {
                // 更新图片
                const img = item.querySelector('img');
                if (img) {
                    img.src = data.image_path + '?t=' + Date.now();
                }
                const border = item.querySelector('[style*="aspect-ratio"]');
                if (border) border.style.borderColor = '#4ade80';
                app.toast('重新生成成功', 'success');
            } else {
                throw new Error(data.error || '生成失败');
            }
        } catch (e) {
            app.toast('重新生成失败: ' + e.message, 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = '🔄';
            }
        }
    }

    function saveCharacter(task) {
        // 角色已经在生成过程中保存到了 assets 目录
        // 直接刷新列表并通知用户
        app.toast(`角色 "${task.char_name}" 已保存到资产库`, 'success');
        
        // 通知 character-manager 刷新
        if (window.CharacterManager) {
            // 触发重新渲染
        }
        
        close();

        // 重新加载角色列表（通过重新点击"从资产导入"不太好，这里直接发个 toast 提示）
        setTimeout(() => {
            app.toast('点击「从资产导入」即可看到新角色', 'info');
        }, 1500);
    }

    return { init, open, close };

})();

window.CharacterCreator = CharacterCreator;
