/* ═══════════════════════════════════════════════════════════════
   CheatPanel - 棋圣系统作弊面板
   评估消耗 → 执行作弊 → 触发对手台词
   ═══════════════════════════════════════════════════════════════ */

const CheatPanel = (() => {

    let inputEl, btnAssess, btnUse, btnCancel;
    let resultBox, classificationEl, costEl, afterEl, messageEl;
    let cheatsUsedEl, currentChessEl;
    let chatContainer;
    let lastCommand = '';
    let lastCostEnergy = 0;

    function init() {
        inputEl = document.getElementById('rpg-cheat-input');
        btnAssess = document.getElementById('rpg-btn-assess');
        btnUse = document.getElementById('rpg-btn-use');
        btnCancel = document.getElementById('rpg-btn-cancel');
        resultBox = document.getElementById('rpg-cheat-result');
        classificationEl = document.getElementById('rpg-result-classification');
        costEl = document.getElementById('rpg-result-cost');
        afterEl = document.getElementById('rpg-result-after');
        messageEl = document.getElementById('rpg-result-message');
        cheatsUsedEl = document.getElementById('rpg-cheats-used');
        currentChessEl = document.getElementById('rpg-current-chess');
        chatContainer = document.getElementById('rpg-ai-chat');

        btnAssess.addEventListener('click', _onAssess);
        btnUse.addEventListener('click', _onUse);
        btnCancel.addEventListener('click', _onCancel);

        // Ctrl+Enter 触发评估
        inputEl.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                _onAssess();
            }
        });
    }

    function _escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function _addChatMessage(text, type = 'ai-response') {
        if (!chatContainer) return;
        const empty = chatContainer.querySelector('.rpg-ai-chat-empty');
        if (empty) empty.remove();
        const div = document.createElement('div');
        div.className = `rpg-ai-chat-msg ${type}`;
        let label = '';
        if (type === 'player') label = '<span class="chat-label">你</span>';
        else if (type === 'ai-response') label = '<span class="chat-label">AI</span>';
        else if (type === 'system') label = '<span class="chat-label">系统</span>';
        div.innerHTML = label + _escapeHtml(text);
        chatContainer.appendChild(div);
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    async function _onAssess() {
        const command = (inputEl.value || '').trim();
        if (!command) {
            RpgShell.toast('请输入作弊指令', 'error');
            return;
        }
        if (!RpgShell.stateHasApiKey()) {
            RpgShell.toast('未设置 API Key，请先在设置中输入', 'error');
            RpgShell.openSettings();
            return;
        }

        btnAssess.disabled = true;
        btnAssess.textContent = '评估中…';
        messageEl.textContent = '';

        const startTime = Date.now();

        try {
            const resp = await fetch('/api/rpg/cheat/assess', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ command }),
            });
            const data = await resp.json();

            const responseTime = Date.now() - startTime;

            if (window.AchievementSystem) {
                const aiType = data.classification === 'fun' ? 'fun'
                    : data.success ? 'applied' : 'rejected';
                AchievementSystem.onAiResponse({
                    type: aiType,
                    responseTime,
                });
                if (!data.success && data.message) {
                    AchievementSystem.onAiError();
                }
            }

            if (!data.success) {
                resultBox.style.display = 'block';
                classificationEl.textContent = data.classification || '—';
                costEl.textContent = '—';
                afterEl.textContent = '—';
                messageEl.textContent = data.message || '评估失败';
                messageEl.style.color = '#fca5a5';
                btnUse.disabled = true;
                lastCostEnergy = 0;
                // 新增：明显的 toast 提示，避免用户以为按钮无反应
                if (typeof RpgShell !== 'undefined' && RpgShell.toast) {
                    RpgShell.toast(data.message || '评估失败', 'error');
                }
            } else {
                lastCostEnergy = data.cost_energy;
                lastCommand = command;
                resultBox.style.display = 'block';
                classificationEl.textContent = data.classification || '—';
                costEl.textContent = `${data.cost_energy} 点`;
                afterEl.textContent = `${data.after_energy} 点`;
                messageEl.textContent = data.message || '评估完成，可执行';
                messageEl.style.color = '#9ca3af';
                btnUse.disabled = false;
                if (data.message) {
                    _addChatMessage(data.message, 'ai-response');
                }
            }
        } catch (e) {
            RpgShell.toast(`评估请求失败: ${e.message}`, 'error');
            if (window.AchievementSystem) {
                AchievementSystem.onAiError();
            }
        } finally {
            btnAssess.disabled = false;
            btnAssess.textContent = '评估消耗';
        }
    }

    async function _onUse() {
        const command = (inputEl.value || '').trim();
        if (!command) {
            RpgShell.toast('请输入作弊指令', 'error');
            return;
        }
        if (command !== lastCommand) {
            RpgShell.toast('指令已修改，请先重新评估', 'error');
            return;
        }

        btnUse.disabled = true;
        btnUse.textContent = '执行中…';

        try {
            const resp = await fetch('/api/rpg/cheat/use', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ command }),
            });
            const data = await resp.json();

            if (!data.success) {
                RpgShell.toast(data.message || '作弊执行失败', 'error');
                return;
            }

            // 1. 更新能量/识破 UI
            RpgShell.updateState({
                energy: data.energy_after,
                cheats_used: RpgShell.getState().cheats_used + 1,
            });

            // 添加到AI助手对话栏
            if (data.command) {
                _addChatMessage(data.command, 'player');
            }
            if (data.opponent_dialogue) {
                _addChatMessage(data.opponent_dialogue, 'ai-response');
            } else if (data.message) {
                _addChatMessage(data.message, 'system');
            }

            // 2. 成就系统 - 触发作弊成就
            if (window.AchievementSystem && data.patch_paths) {
                AchievementSystem.onCheat({
                    costEnergy: data.cost_energy,
                    patchPaths: data.patch_paths || [],
                    skipTurns: data.skip_turns || 0,
                });
            } else if (window.AchievementSystem) {
                AchievementSystem.onCheat({
                    costEnergy: data.cost_energy,
                    patchPaths: [],
                });
            }

            // 3. 直接调用棋盘组件的 applyCheatPatch 方法
            if (data.modified_configs && Object.keys(data.modified_configs).length > 0) {
                const boardEl = RpgShell.getBoardElement();
                if (boardEl && typeof boardEl.applyCheatPatch === 'function') {
                    await boardEl.applyCheatPatch(data.modified_configs);
                }
            }

            // 4. 播放对手合理化台词（核心爽点）
            const opponent = data.opponent || { id: 'robot', name: '对手' };
            if (data.opponent_dialogue) {
                // 先隐藏 VN 舞台上的章节剧情（如果还在播放），再播放台词
                StoryLayer.playOpponentDialogue(
                    opponent.id,
                    opponent.name,
                    data.opponent_dialogue,
                    {
                        onEnd: () => {
                            StoryLayer.hide();
                            RpgShell.toast(`消耗 ${data.cost_energy} 能量，识破已上升`, 'success');
                        },
                    }
                );
            } else {
                RpgShell.toast(`消耗 ${data.cost_energy} 能量`, 'success');
            }

            // 5. 清空输入并禁用执行按钮（需重新评估）
            btnUse.disabled = true;
            messageEl.textContent = `已执行。能量 ${data.energy_after} / 识破 ${data.detection}%`;
            messageEl.style.color = '#fbbf24';
        } catch (e) {
            RpgShell.toast(`执行请求失败: ${e.message}`, 'error');
        } finally {
            btnUse.textContent = '执行作弊';
        }
    }

    function _onCancel() {
        inputEl.value = '';
        resultBox.style.display = 'none';
        btnUse.disabled = true;
        lastCommand = '';
        lastCostEnergy = 0;
        inputEl.focus();
    }

    function updateStats(state) {
        if (cheatsUsedEl) cheatsUsedEl.textContent = state.cheats_used || 0;
        if (currentChessEl) currentChessEl.textContent = state.chess_type || '—';
    }

    function reset() {
        _onCancel();
    }

    return { init, updateStats, reset };

})();
