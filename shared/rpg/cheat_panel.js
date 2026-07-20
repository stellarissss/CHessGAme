/* ═══════════════════════════════════════════════════════════════
   CheatPanel - 棋圣系统作弊面板
   评估消耗 → 执行作弊 → 触发对手台词
   ═══════════════════════════════════════════════════════════════ */

const CheatPanel = (() => {

    let inputEl, btnAssess, btnUse, btnCancel;
    let resultBox, classificationEl, costEl, afterEl, messageEl;
    let cheatsUsedEl, currentChessEl;
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

        try {
            const resp = await fetch('/api/rpg/cheat/assess', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ command }),
            });
            const data = await resp.json();

            if (!data.success) {
                resultBox.style.display = 'block';
                classificationEl.textContent = data.classification || '—';
                costEl.textContent = '—';
                afterEl.textContent = '—';
                messageEl.textContent = data.message || '评估失败';
                messageEl.style.color = '#fca5a5';
                btnUse.disabled = true;
                lastCostEnergy = 0;
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
            }
        } catch (e) {
            RpgShell.toast(`评估请求失败: ${e.message}`, 'error');
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

            // 2. 直接调用棋盘组件的 applyCheatPatch 方法
            if (data.modified_configs && Object.keys(data.modified_configs).length > 0) {
                const boardEl = RpgShell.getBoardElement();
                if (boardEl && typeof boardEl.applyCheatPatch === 'function') {
                    await boardEl.applyCheatPatch(data.modified_configs);
                }
            }

            // 3. 播放对手合理化台词（核心爽点）
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

            // 4. 清空输入并禁用执行按钮（需重新评估）
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
