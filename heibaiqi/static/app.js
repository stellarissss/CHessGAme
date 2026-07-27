class HeibaiqiBoard extends HTMLElement {
    static get observedAttributes() {
        return ['api-base', 'rpg-mode', 'player-side'];
    }

    constructor() {
        super();
        this.configs = {};
        this.boardState = null;
        this.uiConfig = null;
        this.selectedPiece = null;
        this.validMoves = [];
        this.lastMove = null;
        this.aiThinking = false;
        this.coordInsertMode = false;
        this.selectMode = 'coord';
        this.regionPoints = [];
        this.coordDots = [];
        this.thinkingPollInterval = null;
        this._regionRectEl = null;
        this._keydownHandler = null;

        this._personalityInfo = {
            normal:     { icon: '🧠', name: '标准型', subtitle: 'Normal',    desc: '攻守平衡的标准AI',          agg: 0.5, def: 0.5 },
            aggressive: { icon: '⚔️', name: '激进型', subtitle: 'Aggressive', desc: '进攻至上，全力出击',        agg: 0.9, def: 0.2 },
            defensive:  { icon: '🛡️', name: '保守型', subtitle: 'Defensive',  desc: '稳扎稳打，防守反击',        agg: 0.2, def: 0.9 },
            random:     { icon: '🎲', name: '随机型', subtitle: 'Random',     desc: '天马行空，随心所欲',        agg: 0.5, def: 0.5 },
            custom:     { icon: '✨', name: '自定义', subtitle: 'Custom',     desc: '独一无二的神秘风格',        agg: 0.5, def: 0.5 },
        };

        this._mechanismMeta = {
            skip_turns:     { icon: '⏸️',  label: '冻结',     type: 'skip',   unit: '回合' },
            ai_control:     { icon: '🤖',  label: 'AI接管',   type: 'ai',     unit: '回合' },
            player_control: { icon: '🎮',  label: '玩家控制', type: 'player', unit: '' },
            random_moves:   { icon: '🎲',  label: '随机走棋', type: 'random', unit: '步'   },
            extra_turns:    { icon: '⚡',  label: '额外回合', type: 'extra',  unit: '回合' },
            move_limits:    { icon: '🚶',  label: '多步行走', type: 'limit',  unit: '步'   },
        };
    }

    get apiBase() {
        return this.getAttribute('api-base') || '';
    }

    get rpgMode() {
        return this.hasAttribute('rpg-mode');
    }

    get playerSide() {
        return this.getAttribute('player-side') || 'black';
    }

    attributeChangedCallback(name, oldVal, newVal) {
        if (name === 'rpg-mode') {
            this._updateRpgMode();
        }
    }

    _updateRpgMode() {
        const host = this.shadowRoot?.host;
        if (!host) return;
        const sidePanel = this.shadowRoot.querySelector('.side-panel');
        const inputSection = this.shadowRoot.querySelector('.input-section');
        if (this.rpgMode) {
            if (sidePanel) sidePanel.style.display = 'none';
            if (inputSection) inputSection.style.display = 'none';
        } else {
            if (sidePanel) sidePanel.style.display = '';
            if (inputSection) inputSection.style.display = '';
        }
    }

    connectedCallback() {
        this.attachShadow({ mode: 'open' });
        this._renderShadowDom();
        this._updateRpgMode();
    }

    disconnectedCallback() {
        this.destroy();
    }

    _renderShadowDom() {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = '/static/style.css';
        this.shadowRoot.appendChild(link);

        const container = document.createElement('div');
        container.id = 'app';
        container.innerHTML = this._getHtmlTemplate();
        this.shadowRoot.appendChild(container);
    }

    _getHtmlTemplate() {
        return `
        <div class="ambient-effects">
            <div class="fire-glow fire-glow-1"></div>
            <div class="fire-glow fire-glow-2"></div>
            <div class="fire-glow fire-glow-3"></div>
            <div class="smoke-particles"></div>
        </div>

        <div id="thinking-overlay" class="thinking-overlay">
            <div class="thinking-content">
                <div class="thinking-spinner"></div>
                <div class="thinking-text" id="thinking-text">ChatAI 正在理解您的意图...</div>
                <div class="thinking-stage" id="thinking-stage">阶段: 意图解析</div>
            </div>
        </div>

        <div id="settings-modal" class="modal">
            <div class="modal-content">
                <div class="modal-header">
                    <h3>⚙ 设 置</h3>
                    <button id="close-settings" class="modal-close">✕</button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label>DeepSeek API Key</label>
                        <input type="password" id="api-key-input" placeholder="输入您的API密钥">
                        <small>您的API密钥仅保存在本地，不会发送到我们的服务器</small>
                    </div>
                    <div class="form-group">
                        <label>AI难度</label>
                        <select id="difficulty-select">
                            <option value="easy">新手</option>
                            <option value="normal" selected>标准</option>
                            <option value="hard">挑战</option>
                            <option value="master">大师</option>
                        </select>
                    </div>
                </div>
                <div class="modal-footer">
                    <button id="save-settings" class="btn-primary">保存设置</button>
                </div>
            </div>
        </div>

        <div id="logs-modal" class="modal">
            <div class="modal-content logs-content">
                <div class="modal-header">
                    <h3>📜 AI 对话日志</h3>
                    <button id="close-logs" class="modal-close">✕</button>
                </div>
                <div class="modal-body">
                    <div id="logs-container" class="logs-container"></div>
                </div>
                <div class="modal-footer">
                    <button id="btn-clear-logs" class="btn danger">清空日志</button>
                    <button id="btn-refresh-logs" class="btn">刷新</button>
                </div>
            </div>
        </div>

        <header class="header">
            <div class="header-left">
                <div class="title-section">
                    <span class="realm-tag">地狱道</span>
                    <h1>无限制黑白棋</h1>
                </div>
            </div>
            <div class="header-center">
                <div id="turn-indicator" class="turn-indicator">
                    <span class="turn-icon">⚫</span>
                    <span class="turn-text">黑方回合</span>
                </div>
            </div>
            <div class="header-right">
                <button id="btn-settings" class="btn-icon" title="设置">⚙</button>
            </div>
        </header>

        <div id="samsara-bar" class="samsara-bar">
            <div class="samsara-row">
                <div id="level-info-bar" class="level-info-bar"></div>
            </div>
            <div class="samsara-row samsara-stats">
                <div class="samsara-stat karma-stat">
                    <span class="stat-icon">☯</span>
                    <div class="stat-content">
                        <span class="stat-label">业力</span>
                        <div class="stat-bar-wrapper">
                            <div class="stat-bar">
                                <div class="stat-fill karma-fill" id="karma-fill"></div>
                            </div>
                        </div>
                        <span class="stat-value" id="karma-value">0/150</span>
                    </div>
                </div>
                <div class="samsara-stat detection-stat">
                    <span class="stat-icon">👁️</span>
                    <div class="stat-content">
                        <span class="stat-label">识破</span>
                        <div class="stat-bar-wrapper">
                            <div class="stat-bar">
                                <div class="stat-fill detection-fill" id="detection-fill"></div>
                            </div>
                        </div>
                        <span class="stat-value" id="detection-value">0%</span>
                    </div>
                </div>
                <div class="samsara-stat turn-stat">
                    <span class="stat-icon">⏱️</span>
                    <div class="stat-content">
                        <span class="stat-label">回合</span>
                        <div class="stat-bar-wrapper">
                            <div class="stat-bar">
                                <div class="stat-fill turn-fill" id="turn-fill"></div>
                            </div>
                        </div>
                        <span class="stat-value" id="turn-value">0/20</span>
                    </div>
                </div>
                <div class="samsara-stat objective-stat">
                    <span class="stat-icon">🎯</span>
                    <div class="stat-content">
                        <span class="stat-label" id="objective-label">目标</span>
                        <span class="stat-value objective-text" id="objective-text">占领更多棋子</span>
                    </div>
                </div>
            </div>
        </div>

        <main class="main">
            <div class="board-section">
                <div class="board-frame">
                    <div class="board-frame-inner">
                        <div id="board-container"></div>
                    </div>
                </div>
                <div class="board-hints">
                    <span class="hint-item player-hint">
                        <span class="hint-dot player-dot"></span>
                        <span>玩家可落子</span>
                    </span>
                    <span class="hint-item ai-hint">
                        <span class="hint-dot ai-dot"></span>
                        <span>AI可落子</span>
                    </span>
                </div>
            </div>

            <aside class="side-panel">
                <div class="panel-card">
                    <div class="panel-card-header">
                        <span class="card-icon">💬</span>
                        <h3>AI 助手</h3>
                    </div>
                    <div class="panel-card-body">
                        <div id="ai-messages" class="messages"></div>
                    </div>
                </div>

                <div class="panel-card">
                    <div class="panel-card-header">
                        <span class="card-icon">🎯</span>
                        <h3>游戏目标</h3>
                    </div>
                    <div class="panel-card-body">
                        <div id="game-objectives" class="objectives-list">
                            <span class="empty">加载中...</span>
                        </div>
                    </div>
                </div>

                <div class="panel-card">
                    <div class="panel-card-header">
                        <span class="card-icon">💎</span>
                        <h3>Token 消耗</h3>
                    </div>
                    <div class="panel-card-body">
                        <div id="token-stats" class="token-stats">
                            <div class="token-row">
                                <span class="token-label">总消耗</span>
                                <span class="token-value" id="token-total">0</span>
                            </div>
                            <div class="token-row">
                                <span class="token-label">今日消耗</span>
                                <span class="token-value" id="token-today">0</span>
                            </div>
                            <div class="token-row">
                                <span class="token-label">调用次数</span>
                                <span class="token-value" id="token-calls">0</span>
                            </div>
                            <div class="token-row token-cost">
                                <span class="token-label">估算费用</span>
                                <span class="token-value" id="token-cost">$0.00</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="panel-card">
                    <div class="panel-card-header">
                        <span class="card-icon">🧠</span>
                        <h3>AI 性格</h3>
                    </div>
                    <div class="panel-card-body">
                        <div id="ai-personality" class="personality-card">
                            <div class="personality-header">
                                <span class="personality-icon" id="personality-icon">🧠</span>
                                <div class="personality-title">
                                    <span class="personality-type" id="personality-type">标准型</span>
                                    <span class="personality-subtitle" id="personality-subtitle">Normal</span>
                                </div>
                            </div>
                            <p class="personality-desc" id="personality-desc">攻守平衡的标准AI</p>
                            <div class="personality-bars">
                                <div class="personality-bar">
                                    <span class="bar-label">进攻</span>
                                    <div class="bar-track">
                                        <div class="bar-fill aggressive" id="bar-agg-fill"></div>
                                    </div>
                                    <span class="bar-percent" id="bar-agg-pct">50%</span>
                                </div>
                                <div class="personality-bar">
                                    <span class="bar-label">防守</span>
                                    <div class="bar-track">
                                        <div class="bar-fill defensive" id="bar-def-fill"></div>
                                    </div>
                                    <span class="bar-percent" id="bar-def-pct">50%</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="panel-card">
                    <div class="panel-card-header">
                        <span class="card-icon">⚡</span>
                        <h3>游戏机制</h3>
                    </div>
                    <div class="panel-card-body">
                        <div id="active-mechanisms" class="mechanisms-list">
                            <span class="empty">无激活机制</span>
                        </div>
                    </div>
                </div>

                <div class="panel-card">
                    <div class="panel-card-header">
                        <span class="card-icon">📜</span>
                        <h3>已激活规则</h3>
                    </div>
                    <div class="panel-card-body">
                        <div id="active-rules" class="rules-list">
                            <span class="empty">暂无自定义规则</span>
                        </div>
                    </div>
                </div>

                <div class="panel-card controls-card">
                    <div class="panel-card-header">
                        <span class="card-icon">🎮</span>
                        <h3>操 作</h3>
                    </div>
                    <div class="panel-card-body">
                        <div class="controls-grid">
                            <button id="btn-undo" class="control-btn">悔棋</button>
                            <button id="btn-undo-config" class="control-btn">撤回AI修改</button>
                            <button id="btn-restart" class="control-btn">重新开始</button>
                            <button id="btn-logs" class="control-btn">查看日志</button>
                            <button id="btn-reset-configs" class="control-btn danger">重置配置</button>
                        </div>
                    </div>
                </div>
            </aside>
        </main>

        <footer class="input-section">
            <div class="input-container">
                <div class="input-left">
                    <button id="btn-insert-coord" class="coord-btn" title="点击后在棋盘上选择格子">📍 选坐标</button>
                    <button id="btn-toggle-coord-mode" class="coord-btn" title="切换选坐标/选区域">⇄</button>
                </div>
                <div class="input-center">
                    <input
                        type="text"
                        id="command-input"
                        placeholder="输入指令，例如：把棋盘改成10×10、让AI接管白棋、悔一步棋..."
                        autocomplete="off"
                    >
                </div>
                <div class="input-right">
                    <button id="btn-send" class="send-btn">发送</button>
                </div>
            </div>
            <div class="hints">
                试试："把棋盘改成10×10"、"让AI接管白棋"、"创建一个能跳吃的棋子"、"悔一步棋"
            </div>
        </footer>
        `;
    }

    renderCodeDiff(code) {
        if (code.patch_operations_detail && Array.isArray(code.patch_operations_detail) && code.patch_operations_detail.length > 0) {
            return code.patch_operations_detail.map(op => {
                const opStr = op.op || '?';
                const pathStr = op.path || '';
                let valStr = '';
                if (op.value !== undefined) {
                    valStr = JSON.stringify(op.value);
                    if (valStr.length > 200) valStr = valStr.substring(0, 200) + '...';
                }
                return `<span style="color: var(--neon-magenta)">${this.escapeHtml(opStr)}</span> <span style="color: var(--neon-cyan)">${this.escapeHtml(pathStr)}</span>${valStr ? ` → ${this.escapeHtml(valStr)}` : ''}`;
            }).join('<br>');
        }
        if (code.diff_operations_detail && Array.isArray(code.diff_operations_detail) && code.diff_operations_detail.length > 0) {
            return code.diff_operations_detail.map(op => {
                const opStr = op.op || '?';
                const pathStr = op.path || '';
                let valStr = '';
                if (op.value !== undefined) {
                    valStr = JSON.stringify(op.value);
                    if (valStr.length > 200) valStr = valStr.substring(0, 200) + '...';
                }
                return `<span style="color: var(--neon-magenta)">${this.escapeHtml(opStr)}</span> <span style="color: var(--neon-cyan)">${this.escapeHtml(pathStr)}</span>${valStr ? ` → ${this.escapeHtml(valStr)}` : ''}`;
            }).join('<br>');
        }
        if (code.modified_sections_detail && typeof code.modified_sections_detail === 'object' && Object.keys(code.modified_sections_detail).length > 0) {
            return Object.entries(code.modified_sections_detail).map(([section, content]) => {
                let contentStr = typeof content === 'string' ? content : JSON.stringify(content);
                if (contentStr.length > 300) contentStr = contentStr.substring(0, 300) + '...';
                return `<span style="color: var(--neon-cyan)">[${this.escapeHtml(section)}]</span><br>${this.escapeHtml(contentStr)}`;
            }).join('<br><br>');
        }
        if (code.patch_apply_error) return `<span style="color: var(--danger)">Patch应用失败: ${this.escapeHtml(code.patch_apply_error)}</span>`;
        if (code.diff_apply_error) return `<span style="color: var(--danger)">Diff应用失败: ${this.escapeHtml(code.diff_apply_error)}</span>`;
        if (code.parse_error) return `<span style="color: var(--danger)">${this.escapeHtml(code.parse_error)}</span>`;
        if (code.raw_output) {
            let raw = code.raw_output;
            if (raw.length > 500) raw = raw.substring(0, 500) + '...';
            return `<span style="color: var(--text-light); opacity: 0.7">${this.escapeHtml(raw)}</span>`;
        }
        return '<span style="color: var(--text-light); opacity: 0.5">无代码修改片段</span>';
    }

    escapeHtml(text) {
        if (!text) return '';
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    async clearLogs() {
        if (!confirm('确定要清空所有日志吗？')) return;

        try {
            const resp = await fetch(`${this.apiBase}/api/clear_logs`, { method: 'POST' });
            const data = await resp.json();
            if (data.success) {
                await this.refreshLogs();
            }
        } catch (e) {
            console.error('清空日志失败:', e);
        }
    }

    addMessage(text, type = 'info') {
        const container = this.shadowRoot.getElementById('ai-messages');
        const msg = document.createElement('div');
        msg.className = `message ${type}`;
        msg.textContent = text;
        container.appendChild(msg);
        container.scrollTop = container.scrollHeight;

        while (container.children.length > 50) {
            container.removeChild(container.firstChild);
        }
    }

    updateTurnIndicator() {
        const indicator = this.shadowRoot.getElementById('turn-indicator');
        const turn = this.boardState?.current_turn;
        const state = this.boardState?.game_status;

        if (state?.state === 'ended') {
            const winner = state.winner === 'black' ? '黑方' : '白方';
            indicator.textContent = `${winner}获胜!`;
            indicator.style.background = 'var(--success)';
        } else {
            indicator.textContent = turn === 'black' ? '黑方回合' : '白方回合';
            indicator.style.background = turn === 'black' ? '#1a1a1a' : '#fafaf8';
            indicator.style.color = turn === 'black' ? '#fafaf8' : '#1a1a1a';
        }
    }

    updateActiveRules() {
        const container = this.shadowRoot.getElementById('active-rules');
        const rules = this.boardState?.game_status?.custom_rules_active || [];

        if (rules.length === 0) {
            container.innerHTML = '<span class="empty">暂无自定义规则</span>';
        } else {
            container.innerHTML = rules.map(r => `<div class="rule-item">✨ ${r}</div>`).join('');
        }
    }

    updateGameObjectives() {
        const container = this.shadowRoot.getElementById('game-objectives');
        if (!container) return;

        const winConditions = this.configs?.rules?.win_conditions || {};
        const gameStatus = this.boardState?.game_status;
        const achievedCondition = gameStatus?.win_condition;
        const isGameEnded = gameStatus?.state === 'ended';

        const entries = Object.entries(winConditions);
        if (entries.length === 0) {
            container.innerHTML = '<span class="empty">无游戏目标</span>';
            return;
        }

        const sorted = entries.sort((a, b) => {
            const pa = a[1].priority ?? 999;
            const pb = b[1].priority ?? 999;
            return pa - pb;
        });

        container.innerHTML = sorted.map(([key, cond]) => {
            const enabled = cond.enabled !== false;
            const achieved = isGameEnded && achievedCondition === key;
            const name = cond.display_name || key;
            const icon = cond.icon || '🎯';
            const desc = cond.description || '';
            const category = cond.category || 'victory';

            const statusText = achieved ? '已达成' : (enabled ? '进行中' : '未启用');
            const classes = ['objective-item'];
            if (enabled) classes.push('enabled');
            if (achieved) classes.push('achieved');
            if (!enabled) classes.push('disabled');

            return `
                <div class="${classes.join(' ')}">
                    <div class="objective-icon">${icon}</div>
                    <div class="objective-content">
                        ${category ? `<span class="objective-badge ${category}">${category === 'victory' ? '胜利' : category === 'draw' ? '平局' : '特殊'}</span>` : ''}
                        <div class="objective-title">${name}</div>
                        <div class="objective-desc">${desc}</div>
                        <div class="objective-status">${statusText}</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    updateAIPersonality() {
        const card = this.shadowRoot.getElementById('ai-personality');
        if (!card) return;

        const personality = this.configs?.rules?.ai_difficulty?.personality || {};
        const type = personality.type || 'normal';
        const info = this._personalityInfo[type] || this._personalityInfo.custom;

        card.className = `personality-card type-${type}`;

        this.shadowRoot.getElementById('personality-icon').textContent = info.icon;
        this.shadowRoot.getElementById('personality-type').textContent = info.name;
        this.shadowRoot.getElementById('personality-subtitle').textContent = info.subtitle;
        this.shadowRoot.getElementById('personality-desc').textContent = info.desc;

        let agg = personality.aggressiveness ?? info.agg;
        let def = personality.conservatism ?? info.def;
        if (type === 'custom') {
            agg = personality.aggressiveness ?? 0.5;
            def = personality.conservatism ?? 0.5;
        }

        const totalBars = 10;
        const aggBars = Math.round(agg * totalBars);
        const defBars = Math.round(def * totalBars);

        this.shadowRoot.getElementById('bar-agg').textContent = '█'.repeat(aggBars) + '░'.repeat(totalBars - aggBars);
        this.shadowRoot.getElementById('bar-def').textContent = '█'.repeat(defBars) + '░'.repeat(totalBars - defBars);
        this.shadowRoot.getElementById('bar-agg-pct').textContent = `${Math.round(agg * 100)}%`;
        this.shadowRoot.getElementById('bar-def-pct').textContent = `${Math.round(def * 100)}%`;
    }

    triggerPersonalityChangeAnimation() {
        const card = this.shadowRoot.getElementById('ai-personality');
        if (!card) return;
        card.classList.remove('personality-changed');
        void card.offsetWidth;
        card.classList.add('personality-changed');
    }

    updateMechanisms() {
        const container = this.shadowRoot.getElementById('active-mechanisms');
        if (!container) return;

        const mechanisms = this.boardState?.mechanisms || {};
        const items = [];

        for (const [key, meta] of Object.entries(this._mechanismMeta)) {
            const list = mechanisms[key] || [];
            for (const item of list) {
                let sideLabel = item.side === 'black' ? '黑方' : '白方';
                if (item.side === 'both') sideLabel = '双方';

                const remaining = item.remaining ?? item.limit ?? 0;
                const reason = item.reason ? ` — ${item.reason}` : '';
                const isInfinite = remaining < 0;

                let isActive = remaining !== 0;
                if (key === 'player_control') {
                    isActive = true;
                }

                items.push({
                    type: meta.type,
                    icon: meta.icon,
                    text: `${sideLabel}${meta.label}${reason}`,
                    count: isInfinite ? '∞' : remaining,
                    unit: isInfinite ? '' : meta.unit,
                    mechanismKey: key,
                    side: item.side,
                    canStop: isActive,
                });
            }
        }

        if (items.length === 0) {
            container.innerHTML = '<span class="empty">无激活机制</span>';
        } else {
            container.innerHTML = items.map((item, idx) => `
                <div class="mechanism-badge type-${item.type}">
                    <span class="mechanism-icon">${item.icon}</span>
                    <span class="mechanism-text">${item.text}</span>
                    <span class="mechanism-count">${item.count}${item.unit}</span>
                    ${item.canStop ? `<button class="mechanism-stop" data-mechanism="${item.mechanismKey}" data-side="${item.side}">截停</button>` : ''}
                </div>
            `).join('');

            container.querySelectorAll('.mechanism-stop').forEach(btn => {
                btn.addEventListener('click', () => {
                    const mechanismType = btn.dataset.mechanism;
                    const side = btn.dataset.side;
                    this.stopMechanism(mechanismType, side);
                });
            });
        }

        const boardContainer = this.shadowRoot.getElementById('board-container');
        const hasFreeze = (mechanisms.skip_turns || []).length > 0;
        boardContainer.classList.toggle('freeze-effect', hasFreeze);

        const turnIndicator = this.shadowRoot.getElementById('turn-indicator');
        const currentTurn = this.boardState?.current_turn;
        const hasAIControl = (mechanisms.ai_control || []).some(m => m.side === currentTurn);
        turnIndicator.classList.toggle('ai-control', hasAIControl);
    }

    async stopMechanism(mechanismType, side) {
        try {
            const resp = await fetch(`${this.apiBase}/api/stop_mechanism`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mechanism_type: mechanismType, side: side })
            });
            const data = await resp.json();
            if (data.success) {
                this.boardState = data.board_state;
                this.aiThinking = false;
                this.updateMechanisms();
                this.updateTurnIndicator();
                this.addMessage('⏹️ 机制已截停', 'success');
            }
        } catch (e) {
            this.addMessage(`截停失败: ${e.message}`, 'error');
        }
    }

    async refreshMechanisms() {
        try {
            const resp = await fetch(`${this.apiBase}/api/mechanisms`);
            const data = await resp.json();
            if (data.success && data.raw) {
                if (!this.boardState.mechanisms) {
                    this.boardState.mechanisms = {};
                }
                Object.assign(this.boardState.mechanisms, data.raw);
                this.updateMechanisms();
            }
        } catch (e) {
            console.error('Failed to refresh mechanisms:', e);
        }
    }

    async showGameOver() {
        const state = this.boardState?.game_status;
        if (!state || state.state !== 'ended') return;

        const winner = state.winner === 'black' ? '黑方' : '白方';
        const container = this.shadowRoot.getElementById('board-container');

        const existing = container.querySelector('.game-over-overlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.className = 'game-over-overlay';
        overlay.innerHTML = `
            <h2>🎮 游戏结束</h2>
            <p>${winner} 获胜！</p>
            <button class="btn-primary">再来一局</button>
        `;
        const restartBtn = overlay.querySelector('button');
        restartBtn.addEventListener('click', () => this.restart());
        container.appendChild(overlay);

        // 玩家获胜时, 调用 progression resolve 获取奖励并显示
        try {
            const isPlayerWin = state.winner === 'black';
            if (isPlayerWin) {
                const resp = await fetch(`${this.apiBase}/api/level/complete?won=true&no_cheat=false&boss_defeated=false`, { method: 'POST' });
                const data = await resp.json();
                if (data && (data.skill_points > 0 || data.bonus_reasons?.length > 0 || data.sandbox_unlocked)) {
                    this.showVictoryReward(data);
                    await this.loadSamsaraState();
                }
            }
        } catch (e) {
            console.error('Failed to resolve level rewards:', e);
        }
    }

    showVictoryReward(rewards) {
        const container = this.shadowRoot.getElementById('board-container');
        const existing = container.querySelector('.victory-reward-overlay');
        if (existing) existing.remove();

        const skillPoints = rewards?.skill_points || 0;
        const reasons = rewards?.bonus_reasons || [];
        const sandboxUnlocked = rewards?.sandbox_unlocked;

        const reasonsHtml = reasons.map(r => `<li>${r}</li>`).join('');
        const sandboxHtml = sandboxUnlocked ? '<div class="reward-sandbox">🔓 沙盒模式已解锁！</div>' : '';

        const overlay = document.createElement('div');
        overlay.className = 'victory-reward-overlay';
        overlay.innerHTML = `
            <div class="reward-card">
                <h2>🏆 通关胜利</h2>
                <div class="reward-skill-points">⭐ +${skillPoints} 技能点</div>
                ${sandboxHtml}
                ${reasonsHtml ? `<ul class="reward-reasons">${reasonsHtml}</ul>` : ''}
                <button class="btn-primary">继续</button>
            </div>
        `;
        const continueBtn = overlay.querySelector('button');
        continueBtn.addEventListener('click', () => overlay.remove());
        container.appendChild(overlay);
    }

    async restart() {
        const overlay = this.shadowRoot.querySelector('.game-over-overlay');
        if (overlay) overlay.remove();

        const resp = await fetch(`${this.apiBase}/api/restart`, { method: 'POST' });
        const data = await resp.json();
        if (data.success) {
            await this.loadConfigs();
            this.lastMove = null;
            this.clearSelection();
            this.renderBoard();
            this.renderPieces();
            this.updateTurnIndicator();
            await this.renderValidPlacements();
            this.updateActiveRules();
            this.updateGameObjectives();
            this.updateAIPersonality();
            this.updateMechanisms();
            this.addMessage('🔄 游戏已重新开始', 'info');
        }
    }

    getPieceName(pieceId) {
        const piece = this.boardState?.pieces?.find(p => p.id === pieceId);
        return piece ? piece.name : pieceId;
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async checkApiKey() {
        const resp = await fetch(`${this.apiBase}/api/apikey/status`);
        const data = await resp.json();
        if (!data.has_key) {
            this.showSettings();
            this.addMessage('⚠️ 请先设置DeepSeek API Key', 'error');
        }
    }

    showSettings() {
        this.shadowRoot.getElementById('settings-modal').classList.add('show');
    }

    hideSettings() {
        this.shadowRoot.getElementById('settings-modal').classList.remove('show');
    }

    async saveSettings() {
        const apiKey = this.shadowRoot.getElementById('api-key-input').value;
        const difficulty = this.shadowRoot.getElementById('difficulty-select').value;

        if (apiKey) {
            const resp = await fetch(`${this.apiBase}/api/apikey`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ api_key: apiKey })
            });
            const data = await resp.json();
            if (data.success) {
                this.addMessage('✅ API Key已设置', 'success');
            }
        }

        const resp2 = await fetch(`${this.apiBase}/api/difficulty`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ difficulty: difficulty })
        });
        const data2 = await resp2.json();
        if (data2.success) {
            this.addMessage(`✅ 难度已设置为: ${difficulty}`, 'success');
        }

        this.hideSettings();
    }

    bindEvents() {
        const input = this.shadowRoot.getElementById('command-input');
        const sendBtn = this.shadowRoot.getElementById('btn-send');

        const sendCommand = () => {
            const cmd = input.value;
            if (cmd.trim()) {
                this.sendCommand(cmd);
                input.value = '';
            }
        };

        sendBtn.addEventListener('click', sendCommand);
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendCommand();
        });

        this.shadowRoot.getElementById('btn-settings').addEventListener('click', () => {
            this.showSettings();
        });
        this.shadowRoot.getElementById('save-settings').addEventListener('click', () => {
            this.saveSettings();
        });
        this.shadowRoot.getElementById('close-settings').addEventListener('click', () => {
            this.hideSettings();
        });

        this.shadowRoot.getElementById('btn-undo').addEventListener('click', async () => {
            const resp = await fetch(`${this.apiBase}/api/undo`, { method: 'POST' });
            const data = await resp.json();
            if (data.success) {
                this.boardState = data.board_state;
                this.lastMove = this.boardState.move_history?.slice(-1)[0] || null;
                this.clearSelection();
                this.renderPieces();
                this.updateTurnIndicator();
                await this.renderValidPlacements();
                this.updateGameObjectives();
                this.addMessage(data.message, 'success');
            } else {
                this.addMessage(data.message, 'error');
            }
        });

        this.shadowRoot.getElementById('btn-undo-config').addEventListener('click', async () => {
            const resp = await fetch(`${this.apiBase}/api/undo_config`, { method: 'POST' });
            const data = await resp.json();
            if (data.success) {
                await this.loadConfigs();
                this.renderBoard();
                this.renderPieces();
                this.updateTurnIndicator();
                await this.renderValidPlacements();
                this.updateActiveRules();
                this.updateGameObjectives();
                this.updateAIPersonality();
                this.updateMechanisms();
                this.addMessage(data.message, 'success');
            } else {
                this.addMessage(data.message, 'error');
            }
        });

        this.shadowRoot.getElementById('btn-restart').addEventListener('click', () => {
            this.restart();
        });

        this.shadowRoot.getElementById('btn-reset-configs').addEventListener('click', async () => {
            if (!confirm('确定要重置所有配置吗？所有自定义规则将被清除。')) return;
            const resp = await fetch(`${this.apiBase}/api/reset_configs`, { method: 'POST' });
            const data = await resp.json();
            if (data.success) {
                await this.loadConfigs();
                this.lastMove = null;
                this.clearSelection();
                this.renderBoard();
                this.renderPieces();
                this.updateTurnIndicator();
                await this.renderValidPlacements();
                this.updateActiveRules();
                this.updateGameObjectives();
                this.updateAIPersonality();
                this.updateMechanisms();
                this.addMessage('✅ 所有配置已重置', 'success');
            }
        });

        this.shadowRoot.getElementById('btn-logs').addEventListener('click', () => {
            this.showLogs();
        });
        this.shadowRoot.getElementById('close-logs').addEventListener('click', () => {
            this.hideLogs();
        });
        this.shadowRoot.getElementById('btn-refresh-logs').addEventListener('click', () => {
            this.refreshLogs();
        });
        this.shadowRoot.getElementById('btn-clear-logs').addEventListener('click', () => {
            this.clearLogs();
        });

        this.shadowRoot.getElementById('btn-insert-coord').addEventListener('click', () => {
            this.toggleCoordInsertMode();
        });

        this.shadowRoot.getElementById('btn-toggle-coord-mode').addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleSelectMode();
        });

        this._keydownHandler = (e) => {
            if (e.key === 'Escape' && this.coordInsertMode) {
                this.exitCoordInsertMode();
            }
        };
        document.addEventListener('keydown', this._keydownHandler);

        this.shadowRoot.getElementById('board-container').addEventListener('click', (e) => {
            if (this.coordInsertMode) {
                return;
            }
            // 黑白棋：点击合法空格直接落子（valid-move-indicator 已处理，此处为更大点击区域兜底）
            if (this.aiThinking) return;
            if (this.boardState?.game_status?.state === 'ended') return;
            if (!this._isCurrentTurnPlayerControlled()) return;
            const [gridX, gridY] = this._getGridCoordsFromEvent(e);
            if (gridX === null) return;
            const isValid = this.validMoves.some(m => m[0] === gridX && m[1] === gridY);
            if (isValid) {
                this.placeStone(gridX, gridY);
            }
        });
    }

    _getGridCoordsFromEvent(e) {
        const container = this.shadowRoot.getElementById('board-container');
        const rect = container.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const geometry = this.configs.board?.geometry || {};
        const width = geometry.width || 8;
        const height = geometry.height || 8;

        // 单元格模型：点击位置落在哪个格子里
        const gridX = Math.floor((x / rect.width) * width);
        const gridY = Math.floor((y / rect.height) * height);

        if (gridX < 0 || gridX >= width || gridY < 0 || gridY >= height) {
            return [null, null];
        }
        return [gridX, gridY];
    }

    toggleCoordInsertMode() {
        if (this.coordInsertMode) {
            this.exitCoordInsertMode();
        } else {
            this.enterCoordInsertMode();
        }
    }

    enterCoordInsertMode() {
        this.coordInsertMode = true;
        this.regionPoints = [];
        this.shadowRoot.getElementById('btn-insert-coord').classList.add('active');
        this.shadowRoot.getElementById('board-container').classList.add('coord-insert-mode');
        this.updateCoordButtonText();
        this.showCoordDots();
    }

    exitCoordInsertMode() {
        this.coordInsertMode = false;
        this.regionPoints = [];
        const btn = this.shadowRoot.getElementById('btn-insert-coord');
        if (btn) btn.classList.remove('active');
        const board = this.shadowRoot.getElementById('board-container');
        if (board) board.classList.remove('coord-insert-mode');
        this.hideCoordDots();
        this.clearRegionSelection();
    }

    updateCoordButtonText() {
        const btn = this.shadowRoot.getElementById('btn-insert-coord');
        if (!btn) return;
        if (this.selectMode === 'region') {
            btn.innerHTML = '🔲 选区域';
        } else {
            btn.innerHTML = '📍 选坐标';
        }
    }

    toggleSelectMode() {
        if (this.selectMode === 'coord') {
            this.selectMode = 'region';
        } else {
            this.selectMode = 'coord';
        }
        this.regionPoints = [];
        this.clearRegionSelection();
        this.updateCoordButtonText();
        if (this.coordInsertMode) {
            this.showCoordDots();
        }
    }

    showCoordDots() {
        this.hideCoordDots();
        const svg = this.shadowRoot.querySelector('#board-container svg.board-grid');
        if (!svg) return;

        const geometry = this.configs.board?.geometry || {};
        const width = geometry.width || 8;
        const height = geometry.height || 8;

        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('id', 'coord-dots-group');
        g.style.pointerEvents = 'all';

        for (let x = 0; x < width; x++) {
            for (let y = 0; y < height; y++) {
                const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                dot.setAttribute('class', 'coord-dot');
                // 单元格中心
                dot.setAttribute('cx', x + 0.5);
                dot.setAttribute('cy', y + 0.5);
                dot.setAttribute('r', 0.2);
                dot.setAttribute('fill', '#22c55e');
                dot.setAttribute('data-x', x);
                dot.setAttribute('data-y', y);
                dot.style.cursor = 'pointer';
                dot.style.pointerEvents = 'auto';

                dot.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const gx = parseInt(dot.getAttribute('data-x'));
                    const gy = parseInt(dot.getAttribute('data-y'));
                    this.onCoordDotClick(gx, gy);
                });

                g.appendChild(dot);
                this.coordDots.push(dot);
            }
        }

        svg.appendChild(g);
    }

    hideCoordDots() {
        this.coordDots.forEach(dot => dot.remove());
        this.coordDots = [];
    }

    onCoordDotClick(x, y) {
        if (this.selectMode === 'coord') {
            this.insertCoordToInput(x, y);
            this.exitCoordInsertMode();
        } else if (this.selectMode === 'region') {
            this.onRegionPointClick(x, y);
        }
    }

    onRegionPointClick(x, y) {
        if (this.regionPoints.length === 0) {
            this.regionPoints.push([x, y]);
            this.updateRegionVisual();
        } else if (this.regionPoints.length === 1) {
            const [px, py] = this.regionPoints[0];
            if (px === x && py === y) {
                return;
            }
            this.regionPoints.push([x, y]);
            this.updateRegionVisual();
            this.insertRegionToInput();
            setTimeout(() => {
                this.exitCoordInsertMode();
            }, 500);
        } else {
            this.regionPoints = [[x, y]];
            this.clearRegionSelection();
            this.updateRegionVisual();
        }
    }

    updateRegionVisual() {
        this.clearRegionVisual();
        if (this.regionPoints.length === 0) return;

        const svg = this.shadowRoot.querySelector('#board-container svg.board-grid');
        if (!svg) return;

        this.coordDots.forEach(dot => {
            const dx = parseInt(dot.getAttribute('data-x'));
            const dy = parseInt(dot.getAttribute('data-y'));
            const isSelected = this.regionPoints.some(p => p[0] === dx && p[1] === dy);
            if (isSelected) {
                dot.classList.add('selected');
                dot.setAttribute('r', 0.28);
                dot.setAttribute('fill', '#16a34a');
            } else {
                dot.classList.remove('selected');
                dot.setAttribute('r', 0.2);
                dot.setAttribute('fill', '#22c55e');
            }

            if (this.regionPoints.length === 2) {
                const [p1, p2] = this.regionPoints;
                const minX = Math.min(p1[0], p2[0]);
                const maxX = Math.max(p1[0], p2[0]);
                const minY = Math.min(p1[1], p2[1]);
                const maxY = Math.max(p1[1], p2[1]);
                if (dx >= minX && dx <= maxX && dy >= minY && dy <= maxY) {
                    dot.classList.add('in-region');
                }
            }
        });

        if (this.regionPoints.length === 2) {
            const [p1, p2] = this.regionPoints;
            const minX = Math.min(p1[0], p2[0]);
            const maxX = Math.max(p1[0], p2[0]);
            const minY = Math.min(p1[1], p2[1]);
            const maxY = Math.max(p1[1], p2[1]);

            const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            rect.setAttribute('class', 'region-rect');
            rect.setAttribute('x', minX - 0.4);
            rect.setAttribute('y', minY - 0.4);
            rect.setAttribute('width', (maxX - minX) + 0.8);
            rect.setAttribute('height', (maxY - minY) + 0.8);
            rect.setAttribute('rx', 0.1);
            svg.appendChild(rect);
            this._regionRectEl = rect;
        }
    }

    clearRegionVisual() {
        if (this._regionRectEl) {
            this._regionRectEl.remove();
            this._regionRectEl = null;
        }
        this.coordDots.forEach(dot => {
            dot.classList.remove('selected', 'in-region');
            dot.setAttribute('r', 0.2);
            dot.setAttribute('fill', '#22c55e');
        });
    }

    clearRegionSelection() {
        this.clearRegionVisual();
        this.regionPoints = [];
    }

    insertCoordToInput(x, y) {
        const input = this.shadowRoot.getElementById('command-input');
        const coordStr = `[${x}, ${y}]`;

        const start = input.selectionStart;
        const end = input.selectionEnd;
        const value = input.value;

        input.value = value.substring(0, start) + coordStr + value.substring(end);
        const newPos = start + coordStr.length;
        input.setSelectionRange(newPos, newPos);
        input.focus();
    }

    insertRegionToInput() {
        if (this.regionPoints.length < 2) return;
        const [p1, p2] = this.regionPoints;
        const minX = Math.min(p1[0], p2[0]);
        const maxX = Math.max(p1[0], p2[0]);
        const minY = Math.min(p1[1], p2[1]);
        const maxY = Math.max(p1[1], p2[1]);

        const input = this.shadowRoot.getElementById('command-input');
        const regionStr = `[${minX}, ${minY}]-[${maxX}, ${maxY}]`;

        const start = input.selectionStart;
        const end = input.selectionEnd;
        const value = input.value;

        input.value = value.substring(0, start) + regionStr + value.substring(end);
        const newPos = start + regionStr.length;
        input.setSelectionRange(newPos, newPos);
        input.focus();
    }

    async applyCheatPatch(modifiedConfigs) {
        try {
            // RPG 后端 cheat_use 已通过 /api/command 将配置应用到棋类后端
            // 这里只需重新拉取最新配置并重渲染
            await this.loadConfigs();
            this.renderBoard();
            this.renderPieces();
            this.updateTurnIndicator();
            this.updateActiveRules();
            this.updateGameObjectives();
            this.updateAIPersonality();
            this.updateMechanisms();
            return { success: true };
        } catch (e) {
            this._dispatchError('应用补丁失败', e);
            throw e;
        }
    }

    getBoardSnapshot() {
        return {
            boardState: this.boardState,
            configs: this.configs
        };
    }

    async resetBoard() {
        const resp = await fetch(`${this.apiBase}/api/reset_configs`, { method: 'POST' });
        const data = await resp.json();
        if (data.success) {
            await this.loadConfigs();
            this.lastMove = null;
            this.clearSelection();
            this.renderBoard();
            this.renderPieces();
            this.updateTurnIndicator();
            this.updateActiveRules();
            this.updateGameObjectives();
            this.updateAIPersonality();
            this.updateMechanisms();
        }
        return data;
    }

    destroy() {
        if (this._gameOverTimer) {
            clearTimeout(this._gameOverTimer);
            this._gameOverTimer = null;
        }
        if (this.thinkingPollInterval) {
            clearInterval(this.thinkingPollInterval);
            this.thinkingPollInterval = null;
        }
        if (this._keydownHandler) {
            document.removeEventListener('keydown', this._keydownHandler);
            this._keydownHandler = null;
        }
        this._initialized = false;
    }
}

if (!customElements.get('heibaiqi-board')) customElements.define('heibaiqi-board', HeibaiqiBoard);
