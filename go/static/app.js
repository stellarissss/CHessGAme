/* ═══════════════════════════════════════════════════════════════
   无限制围棋 - 前端应用
   ═══════════════════════════════════════════════════════════════ */

const App = {
    configs: {},
    boardState: null,
    uiConfig: null,
    validMoves: [],
    lastMove: null,
    aiThinking: false,
    coordInsertMode: false,
    selectMode: 'coord',
    regionPoints: [],
    coordDots: [],

    async init() {
        await this.loadConfigs();
        this.renderBoard();
        this.renderStones();
        this.updateTurnIndicator();
        this.updateActiveRules();
        this.updateGameObjectives();
        this.updateAIPersonality();
        this.updateMechanisms();
        this.updateCaptureStats();
        this.bindEvents();
        this.checkApiKey();
    },

    async loadConfigs() {
        const resp = await fetch('/api/config/all', { cache: 'no-store' });
        this.configs = await resp.json();
        this.boardState = this.configs.board_state;
        this.uiConfig = this.configs.ui_config;
    },

    _getBoardLayoutConfig() {
        const defaults = {
            grid: {
                line_thickness: 0.02,
                show_horizontal: true,
                show_vertical: true,
                river_gap: false
            },
            palace: {
                enabled: false
            },
            river: {
                enabled: false
            },
            appearance: {
                background_color: '#dcb35c',
                line_color: '#5c3a1e',
                star_point_color: '#5c3a1e'
            },
            layout: {
                viewbox_padding_left: 0.5,
                viewbox_padding_right: 0.5,
                viewbox_padding_top: 0.5,
                viewbox_padding_bottom: 0.5,
                board_size: '90vmin'
            },
            decorations: {
                border: {
                    enabled: true,
                    thickness: 0.15,
                    color: '#5c3a1e'
                },
                custom_lines: [],
                background_pattern: null
            }
        };

        const user = this.configs.board?.appearance || {};

        const merge = (def, usr) => {
            if (!usr || typeof usr !== 'object') return def;
            const result = {};
            for (const key in def) {
                if (def[key] && typeof def[key] === 'object' && !Array.isArray(def[key])) {
                    result[key] = merge(def[key], usr[key]);
                } else {
                    result[key] = (usr[key] !== undefined) ? usr[key] : def[key];
                }
            }
            return result;
        };

        try {
            const merged = merge(defaults, user);
            merged.appearance = {
                background_color: user.background_color !== undefined
                    ? user.background_color : defaults.appearance.background_color,
                line_color: user.line_color !== undefined
                    ? user.line_color : defaults.appearance.line_color,
                star_point_color: user.star_point_color !== undefined
                    ? user.star_point_color : defaults.appearance.star_point_color,
            };
            return merged;
        } catch (e) {
            console.error('Failed to merge board layout config:', e);
            return defaults;
        }
    },

    renderBoard() {
        const container = document.getElementById('board-container');
        container.innerHTML = '';

        const layoutConfig = this._getBoardLayoutConfig();
        const geometry = this.configs.board?.geometry || {};
        const width = geometry.width || 19;
        const height = geometry.height || 19;
        const starPoints = geometry.star_points || [];

        const bgColor = layoutConfig.appearance.background_color;
        container.style.backgroundColor = bgColor;
        document.documentElement.style.setProperty('--board-bg', bgColor);

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.classList.add('board-grid');
        const padLeft = layoutConfig.layout.viewbox_padding_left;
        const padRight = layoutConfig.layout.viewbox_padding_right;
        const padTop = layoutConfig.layout.viewbox_padding_top;
        const padBottom = layoutConfig.layout.viewbox_padding_bottom;
        const viewBoxWidth = (width - 1) + padLeft + padRight;
        const viewBoxHeight = (height - 1) + padTop + padBottom;
        svg.setAttribute('viewBox', `-${padLeft} -${padTop} ${viewBoxWidth} ${viewBoxHeight}`);
        svg.setAttribute('preserveAspectRatio', 'none');
        svg.style.width = '100%';
        svg.style.height = '100%';

        const lineColor = layoutConfig.appearance.line_color;
        const sw = String(layoutConfig.grid.line_thickness);

        if (layoutConfig.grid.show_horizontal) {
            for (let i = 0; i < height; i++) {
                const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                line.setAttribute('x1', '0');
                line.setAttribute('y1', i);
                line.setAttribute('x2', width - 1);
                line.setAttribute('y2', i);
                line.setAttribute('stroke', lineColor);
                line.setAttribute('stroke-width', sw);
                svg.appendChild(line);
            }
        }

        if (layoutConfig.grid.show_vertical) {
            for (let i = 0; i < width; i++) {
                const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                line.setAttribute('x1', i);
                line.setAttribute('y1', '0');
                line.setAttribute('x2', i);
                line.setAttribute('y2', height - 1);
                line.setAttribute('stroke', lineColor);
                line.setAttribute('stroke-width', sw);
                svg.appendChild(line);
            }
        }

        const starPointColor = layoutConfig.appearance.star_point_color || lineColor;
        starPoints.forEach(([x, y]) => {
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', x);
            circle.setAttribute('cy', y);
            circle.setAttribute('r', '0.15');
            circle.setAttribute('fill', starPointColor);
            svg.appendChild(circle);
        });

        if (layoutConfig.decorations.border.enabled) {
            const borderThickness = layoutConfig.decorations.border.thickness;
            const borderColor = layoutConfig.decorations.border.color || lineColor;
            const borderRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            const halfThick = borderThickness / 2;
            borderRect.setAttribute('x', -halfThick);
            borderRect.setAttribute('y', -halfThick);
            borderRect.setAttribute('width', (width - 1) + borderThickness);
            borderRect.setAttribute('height', (height - 1) + borderThickness);
            borderRect.setAttribute('fill', 'none');
            borderRect.setAttribute('stroke', borderColor);
            borderRect.setAttribute('stroke-width', String(borderThickness));
            svg.appendChild(borderRect);
        }

        container.appendChild(svg);
        this.applyUiConfig();
    },

    applyUiConfig() {
        const rotation = this.uiConfig?.layout?.rotation || 0;
        const container = document.getElementById('board-container');
        if (container) {
            container.style.transform = `rotate(${rotation}deg)`;
            container.style.transition = 'transform 0.3s ease';
        }

        const customStyleId = 'custom-ui-css';
        let styleEl = document.getElementById(customStyleId);
        if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = customStyleId;
            document.head.appendChild(styleEl);
        }
        styleEl.textContent = this.uiConfig?.custom_css || '';
    },

    renderStones() {
        const container = document.getElementById('board-container');
        container.querySelectorAll('.stone').forEach(el => el.remove());

        const pieces = this.boardState?.pieces || [];
        pieces.forEach(piece => {
            if (!piece.is_alive) return;
            this.createStoneElement(piece);
        });

        if (this.lastMove) {
            const el = container.querySelector(`[data-piece-id="${this.lastMove.piece_id}"]`);
            if (el) el.classList.add('last-moved');
        }
    },

    createStoneElement(piece) {
        const container = document.getElementById('board-container');
        const el = document.createElement('div');
        el.className = `stone ${piece.side}`;
        el.dataset.pieceId = piece.id;

        const geometry = this.configs.board?.geometry || {};
        const width = geometry.width || 19;
        const height = geometry.height || 19;

        const [x, y] = piece.position;
        const leftPct = 5 + (x / (width - 1)) * 90;
        const topPct = 5 + (y / (height - 1)) * 90;

        el.style.left = `${leftPct}%`;
        el.style.top = `${topPct}%`;
        el.style.transform = 'translate(-50%, -50%)';

        el.addEventListener('click', (e) => {
            e.stopPropagation();
            if (this.coordInsertMode) {
                this.onCoordDotClick(x, y);
                return;
            }
        });

        container.appendChild(el);
    },

    async onBoardClick(e) {
        if (this.aiThinking) return;
        if (this.boardState?.game_status?.state === 'ended') return;

        const container = document.getElementById('board-container');
        const rect = container.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const geometry = this.configs.board?.geometry || {};
        const width = geometry.width || 19;
        const height = geometry.height || 19;

        const gridX = Math.round((x / rect.width) * (width - 1));
        const gridY = Math.round((y / rect.height) * (height - 1));

        if (gridX < 0 || gridX >= width || gridY < 0 || gridY >= height) return;

        if (this.coordInsertMode) {
            this.onCoordDotClick(gridX, gridY);
            return;
        }

        const pieces = this.boardState?.pieces || [];
        const existingPiece = pieces.find(p => p.is_alive && p.position[0] === gridX && p.position[1] === gridY);
        if (existingPiece) return;

        if (!this._isCurrentTurnPlayerControlled()) {
            this.showToast('本回合由AI控制', 'error');
            return;
        }

        await this.executeMove(gridX, gridY);
    },

    async executeMove(x, y) {
        try {
            this.setThinking(true);
            const resp = await fetch('/api/move', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ to: [x, y] })
            });

            const data = await resp.json();

            if (data.success) {
                await this.loadConfigs();
                this.renderStones();
                this.updateTurnIndicator();
                this.updateCaptureStats();
                this.updateMechanisms();

                if (data.game_ended) {
                    this.showGameOver(data.winner, data.win_condition);
                } else if (data.ai_move) {
                    setTimeout(() => this.makeAIMove(), 500);
                }
            } else {
                this.showToast(data.message, 'error');
            }
        } catch (error) {
            console.error('Move failed:', error);
            this.showToast('落子失败，请重试', 'error');
        } finally {
            this.setThinking(false);
        }
    },

    async makeAIMove() {
        try {
            this.setThinking(true);
            const resp = await fetch('/api/ai_move', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });

            const data = await resp.json();

            if (data.success) {
                this.lastMove = data.move;
                await this.loadConfigs();
                this.renderStones();
                this.updateTurnIndicator();
                this.updateCaptureStats();
                this.updateMechanisms();

                if (data.game_ended) {
                    this.showGameOver(data.winner, data.win_condition);
                }
            } else {
                console.error('AI move failed:', data.message);
            }
        } catch (error) {
            console.error('AI move error:', error);
        } finally {
            this.setThinking(false);
        }
    },

    updateTurnIndicator() {
        const turn = this.boardState?.current_turn;
        const indicator = document.getElementById('turn-indicator');
        if (indicator) {
            indicator.textContent = turn === 'black' ? '黑方回合' : '白方回合';
        }
    },

    updateCaptureStats() {
        const captures = this.boardState?.captures || { black: 0, white: 0 };
        const blackEl = document.getElementById('capture-black');
        const whiteEl = document.getElementById('capture-white');
        if (blackEl) blackEl.textContent = captures.black;
        if (whiteEl) whiteEl.textContent = captures.white;
    },

    _isCurrentTurnPlayerControlled() {
        const currentTurn = this.boardState?.current_turn;
        const playerSide = this.boardState?.player_side || 'black';

        if (this.boardState?.mechanisms?.ai_control?.includes(currentTurn)) {
            return false;
        }

        return currentTurn === playerSide;
    },

    setThinking(isThinking) {
        this.aiThinking = isThinking;
        const overlay = document.getElementById('thinking-overlay');
        const board = document.getElementById('board-container');
        const inputSection = document.querySelector('.input-section');

        if (isThinking) {
            overlay.classList.add('show');
            board.classList.add('board-locked');
            inputSection.classList.add('input-locked');
        } else {
            overlay.classList.remove('show');
            board.classList.remove('board-locked');
            inputSection.classList.remove('input-locked');
        }
    },

    showToast(message, type = 'success') {
        const container = document.querySelector('.toast-container') || (() => {
            const el = document.createElement('div');
            el.className = 'toast-container';
            document.body.appendChild(el);
            return el;
        })();

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        container.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('fade-out');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    },

    showGameOver(winner, condition) {
        const container = document.getElementById('board-container');
        const overlay = document.createElement('div');
        overlay.className = 'game-over-overlay';

        const winnerText = winner === 'black' ? '黑方' : '白方';
        const conditionText = condition || '获胜';

        overlay.innerHTML = `
            <h2>游戏结束</h2>
            <p>${winnerText} ${conditionText}</p>
            <button onclick="App.restartGame()">再来一局</button>
        `;

        container.appendChild(overlay);
    },

    async restartGame() {
        try {
            await fetch('/api/restart', { method: 'POST' });
            await this.loadConfigs();
            this.renderBoard();
            this.renderStones();
            this.updateTurnIndicator();
            this.updateCaptureStats();
            this.updateActiveRules();
            this.updateGameObjectives();
            this.updateAIPersonality();
            this.updateMechanisms();
        } catch (error) {
            console.error('Restart failed:', error);
        }
    },

    async undoMove() {
        try {
            const resp = await fetch('/api/undo', { method: 'POST' });
            const data = await resp.json();

            if (data.success) {
                await this.loadConfigs();
                this.renderStones();
                this.updateTurnIndicator();
                this.updateCaptureStats();
                this.showToast('已悔棋');
            } else {
                this.showToast(data.message, 'error');
            }
        } catch (error) {
            console.error('Undo failed:', error);
            this.showToast('悔棋失败', 'error');
        }
    },

    async undoConfig() {
        try {
            const resp = await fetch('/api/undo_config', { method: 'POST' });
            const data = await resp.json();

            if (data.success) {
                await this.loadConfigs();
                this.renderBoard();
                this.renderStones();
                this.updateActiveRules();
                this.updateGameObjectives();
                this.updateAIPersonality();
                this.showToast('已撤回AI修改');
            } else {
                this.showToast(data.message, 'error');
            }
        } catch (error) {
            console.error('Undo config failed:', error);
        }
    },

    async resetConfigs() {
        if (!confirm('确定要重置所有配置吗？')) return;
        try {
            const resp = await fetch('/api/reset_configs', { method: 'POST' });
            const data = await resp.json();

            if (data.success) {
                await this.loadConfigs();
                this.renderBoard();
                this.renderStones();
                this.updateTurnIndicator();
                this.updateCaptureStats();
                this.updateActiveRules();
                this.updateGameObjectives();
                this.updateAIPersonality();
                this.updateMechanisms();
                this.showToast('已重置所有配置');
            } else {
                this.showToast(data.message, 'error');
            }
        } catch (error) {
            console.error('Reset configs failed:', error);
        }
    },

    updateActiveRules() {
        const rulesContainer = document.getElementById('active-rules');
        if (!rulesContainer) return;

        const rules = this.configs.rules || {};
        const specialRules = rules.special_rules || {};
        const activeRules = [];

        Object.entries(specialRules).forEach(([key, rule]) => {
            if (rule.enabled) {
                activeRules.push({
                    name: rule.display_name || rule.description || key,
                    desc: rule.description
                });
            }
        });

        if (activeRules.length === 0) {
            rulesContainer.innerHTML = '<span class="empty">暂无自定义规则</span>';
            return;
        }

        rulesContainer.innerHTML = activeRules.map((rule, index) => `
            <div class="rule-item" style="counter-increment: rule-counter ${index + 1}">
                ${rule.name}
            </div>
        `).join('');
    },

    updateGameObjectives() {
        const objectivesContainer = document.getElementById('game-objectives');
        if (!objectivesContainer) return;

        const rules = this.configs.rules || {};
        const winConditions = rules.win_conditions || {};
        const objectives = [];

        Object.entries(winConditions).forEach(([key, condition]) => {
            if (condition.enabled) {
                objectives.push({
                    icon: condition.icon || '⚫',
                    name: condition.display_name || key,
                    desc: condition.description
                });
            }
        });

        if (objectives.length === 0) {
            objectivesContainer.innerHTML = '<span class="empty">加载中...</span>';
            return;
        }

        objectivesContainer.innerHTML = objectives.map(obj => `
            <div style="display: flex; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px dotted #e0ddd7;">
                <span style="font-size: 1.2rem;">${obj.icon}</span>
                <div>
                    <div style="font-size: 0.85rem; color: #2d2d2d;">${obj.name}</div>
                    <div style="font-size: 0.75rem; color: #7a7a7a;">${obj.desc}</div>
                </div>
            </div>
        `).join('');
    },

    updateAIPersonality() {
        const rules = this.configs.rules || {};
        const personality = rules.ai_difficulty?.personality || {
            type: 'normal',
            aggressiveness: 0.5,
            conservatism: 0.5
        };

        const typeMap = {
            'normal': { name: '标准型', subtitle: 'Normal', desc: '攻守平衡的标准AI', icon: '🧠' },
            'aggressive': { name: '进攻型', subtitle: 'Aggressive', desc: '主动出击，积极进攻', icon: '⚔️' },
            'defensive': { name: '防守型', subtitle: 'Defensive', desc: '稳扎稳打，注重防守', icon: '🛡️' },
            'random': { name: '随机型', subtitle: 'Random', desc: '随心所欲，快乐下棋', icon: '🎲' }
        };

        const info = typeMap[personality.type] || typeMap.normal;

        document.getElementById('personality-icon').textContent = info.icon;
        document.getElementById('personality-type').textContent = info.name;
        document.getElementById('personality-subtitle').textContent = info.subtitle;
        document.getElementById('personality-desc').textContent = info.desc;

        const aggPct = Math.round((personality.aggressiveness || 0.5) * 100);
        const defPct = Math.round((personality.conservatism || 0.5) * 100);

        document.getElementById('bar-agg').textContent = '█'.repeat(Math.round(aggPct / 10)) + '░'.repeat(10 - Math.round(aggPct / 10));
        document.getElementById('bar-agg-pct').textContent = `${aggPct}%`;
        document.getElementById('bar-def').textContent = '█'.repeat(Math.round(defPct / 10)) + '░'.repeat(10 - Math.round(defPct / 10));
        document.getElementById('bar-def-pct').textContent = `${defPct}%`;

        const card = document.getElementById('ai-personality');
        card.className = `personality-card type-${personality.type}`;
    },

    updateMechanisms() {
        const container = document.getElementById('active-mechanisms');
        if (!container) return;

        const mechanisms = this.boardState?.mechanisms || {};
        const activeMechanisms = [];

        if (mechanisms.skip_turns?.length > 0) {
            activeMechanisms.push({ type: 'skip', text: `跳过回合`, count: mechanisms.skip_turns.length });
        }
        if (mechanisms.ai_control?.length > 0) {
            activeMechanisms.push({ type: 'ai', text: `AI控制`, count: mechanisms.ai_control.length });
        }
        if (mechanisms.random_moves?.length > 0) {
            activeMechanisms.push({ type: 'random', text: `随机走棋`, count: mechanisms.random_moves.length });
        }
        if (mechanisms.extra_turns?.length > 0) {
            activeMechanisms.push({ type: 'extra', text: `额外回合`, count: mechanisms.extra_turns.length });
        }
        if (mechanisms.move_limits?.length > 0) {
            activeMechanisms.push({ type: 'limit', text: `移动限制`, count: mechanisms.move_limits.length });
        }

        if (activeMechanisms.length === 0) {
            container.innerHTML = '<span class="empty">无激活机制</span>';
            return;
        }

        container.innerHTML = activeMechanisms.map(m => `
            <div class="mechanism-badge type-${m.type}">
                <span class="mechanism-count">${m.count}</span>
                <span class="mechanism-text">${m.text}</span>
            </div>
        `).join('');
    },

    async sendCommand() {
        const input = document.getElementById('command-input');
        const message = input.value.trim();
        if (!message) return;

        input.value = '';
        this.addMessage('user', message);

        try {
            this.setThinking(true);
            const resp = await fetch('/api/command', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message })
            });

            const data = await resp.json();

            if (data.success) {
                if (data.ai_response) {
                    this.addMessage('ai', data.ai_response);
                }

                if (data.config_changed) {
                    await this.loadConfigs();
                    this.renderBoard();
                    this.renderStones();
                    this.updateActiveRules();
                    this.updateGameObjectives();
                    this.updateAIPersonality();
                    this.updateMechanisms();
                }

                if (data.game_ended) {
                    this.showGameOver(data.winner, data.win_condition);
                }
            } else {
                this.addMessage('error', data.message);
            }
        } catch (error) {
            console.error('Command failed:', error);
            this.addMessage('error', '命令执行失败');
        } finally {
            this.setThinking(false);
        }
    },

    addMessage(type, text) {
        const messagesContainer = document.getElementById('ai-messages');
        if (!messagesContainer) return;

        const messageEl = document.createElement('div');
        messageEl.className = `message ${type}`;
        messageEl.textContent = text;
        messagesContainer.appendChild(messageEl);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    },

    async loadLogs() {
        try {
            const resp = await fetch('/api/logs');
            const logs = await resp.json();

            const container = document.getElementById('logs-container');
            container.innerHTML = logs.map(log => `
                <div class="log-entry ${log.type}">
                    <div class="log-header">
                        <span>${log.timestamp}</span>
                        <span>${log.stage}</span>
                    </div>
                    ${log.user_input ? `<div class="log-user-input">${log.user_input}</div>` : ''}
                    ${log.content ? `<div class="log-section"><div class="log-section-title">响应</div><div class="log-content">${log.content}</div></div>` : ''}
                </div>
            `).join('');
        } catch (error) {
            console.error('Load logs failed:', error);
        }
    },

    async clearLogs() {
        try {
            await fetch('/api/logs/clear', { method: 'POST' });
            document.getElementById('logs-container').innerHTML = '';
        } catch (error) {
            console.error('Clear logs failed:', error);
        }
    },

    onCoordDotClick(x, y) {
        const input = document.getElementById('command-input');
        const coordStr = `[${x},${y}]`;

        if (input.selectionStart !== undefined) {
            const start = input.selectionStart;
            const end = input.selectionEnd;
            input.value = input.value.substring(0, start) + coordStr + input.value.substring(end);
            input.focus();
            input.setSelectionRange(start + coordStr.length, start + coordStr.length);
        } else {
            input.value += coordStr;
        }

        if (this.selectMode === 'coord') {
            this.coordInsertMode = false;
            document.getElementById('btn-insert-coord').classList.remove('active');
            document.getElementById('board-container').classList.remove('coord-insert-mode');
        }
    },

    checkApiKey() {
        const savedKey = localStorage.getItem('deepseek_api_key');
        if (savedKey) {
            document.getElementById('api-key-input').value = savedKey;
        }
    },

    saveSettings() {
        const apiKey = document.getElementById('api-key-input').value;
        const difficulty = document.getElementById('difficulty-select').value;

        localStorage.setItem('deepseek_api_key', apiKey);

        fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ api_key: apiKey, difficulty })
        }).then(() => {
            this.showToast('设置已保存');
            document.getElementById('settings-modal').classList.remove('show');
        });
    },

    bindEvents() {
        document.getElementById('board-container').addEventListener('click', (e) => {
            if (!e.target.classList.contains('stone')) {
                this.onBoardClick(e);
            }
        });

        document.getElementById('btn-send').addEventListener('click', () => this.sendCommand());
        document.getElementById('command-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendCommand();
        });

        document.getElementById('btn-undo').addEventListener('click', () => this.undoMove());
        document.getElementById('btn-undo-config').addEventListener('click', () => this.undoConfig());
        document.getElementById('btn-restart').addEventListener('click', () => this.restartGame());
        document.getElementById('btn-reset-configs').addEventListener('click', () => this.resetConfigs());

        document.getElementById('btn-settings').addEventListener('click', () => {
            document.getElementById('settings-modal').classList.add('show');
        });
        document.getElementById('close-settings').addEventListener('click', () => {
            document.getElementById('settings-modal').classList.remove('show');
        });

        document.getElementById('save-settings').addEventListener('click', () => this.saveSettings());

        document.getElementById('btn-logs').addEventListener('click', () => {
            document.getElementById('logs-modal').classList.add('show');
            this.loadLogs();
        });
        document.getElementById('close-logs').addEventListener('click', () => {
            document.getElementById('logs-modal').classList.remove('show');
        });
        document.getElementById('btn-clear-logs').addEventListener('click', () => this.clearLogs());
        document.getElementById('btn-refresh-logs').addEventListener('click', () => this.loadLogs());

        document.getElementById('btn-insert-coord').addEventListener('click', () => {
            this.coordInsertMode = !this.coordInsertMode;
            const btn = document.getElementById('btn-insert-coord');
            const board = document.getElementById('board-container');

            if (this.coordInsertMode) {
                btn.classList.add('active');
                board.classList.add('coord-insert-mode');
            } else {
                btn.classList.remove('active');
                board.classList.remove('coord-insert-mode');
            }
        });

        document.getElementById('btn-toggle-coord-mode').addEventListener('click', () => {
            this.selectMode = this.selectMode === 'coord' ? 'region' : 'coord';
            this.showToast(`已切换为${this.selectMode === 'coord' ? '选坐标' : '选区域'}模式`);
        });

        document.addEventListener('click', (e) => {
            if (!e.target.closest('#settings-modal') && !e.target.closest('#btn-settings')) {
                document.getElementById('settings-modal').classList.remove('show');
            }
            if (!e.target.closest('#logs-modal') && !e.target.closest('#btn-logs')) {
                document.getElementById('logs-modal').classList.remove('show');
            }
        });
    }
};

document.addEventListener('DOMContentLoaded', () => {
    App.init();
});