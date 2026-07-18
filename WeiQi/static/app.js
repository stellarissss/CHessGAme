/* =========================================================
   无限制围棋 - 前端应用
   ========================================================= */

const App = {
    configs: {},
    boardState: null,
    uiConfig: null,
    lastMove: null,
    aiThinking: false,
    hoverPos: null,

    async init() {
        await this.loadConfigs();
        this.renderBoard();
        this.renderStones();
        this.updateTurnIndicator();
        this.updateActiveRules();
        this.updateAIPersonality();
        this.updateMechanisms();
        this.updateTerritory();
        this.bindEvents();
        this.checkApiKey();
        this.loadTokenStats();
        this.updateMoveCount();
    },

    async loadTokenStats() {
        try {
            const resp = await fetch('/api/token_stats');
            const data = await resp.json();
            const totalEl = document.getElementById('token-total');
            const todayEl = document.getElementById('token-today');
            const callsEl = document.getElementById('token-calls');
            const costEl = document.getElementById('token-cost');
            if (totalEl) totalEl.textContent = (data.total_tokens || 0).toLocaleString();
            if (todayEl) todayEl.textContent = (data.today_tokens || 0).toLocaleString();
            if (callsEl) callsEl.textContent = (data.total_calls || 0).toLocaleString();
            if (costEl) costEl.textContent = `$${(data.estimated_cost_usd || 0).toFixed(4)}`;
        } catch (e) {
            console.error('Failed to load token stats:', e);
        }
    },

    async loadConfigs() {
        const resp = await fetch('/api/config/all', { cache: 'no-store' });
        this.configs = await resp.json();
        this.boardState = this.configs.board_state;
        this.uiConfig = this.configs.ui_config;
    },

    getBoardSize() {
        const geometry = this.configs.board?.geometry || {};
        return {
            width: geometry.width || 19,
            height: geometry.height || 19,
            starPoints: geometry.star_points || []
        };
    },

    renderBoard() {
        const container = document.getElementById('board-container');
        container.innerHTML = '';

        const { width, height, starPoints } = this.getBoardSize();

        const board = document.createElement('div');
        board.className = 'go-board';
        board.id = 'go-board';

        const grid = document.createElement('div');
        grid.className = 'board-grid';

        for (let y = 0; y < height; y++) {
            const line = document.createElement('div');
            line.className = 'grid-line horizontal';
            line.style.top = `${(y / (height - 1)) * 100}%`;
            line.style.left = `${(1 / (width - 1)) * 50}%`;
            line.style.right = `${(1 / (width - 1)) * 50}%`;
            grid.appendChild(line);
        }

        for (let x = 0; x < width; x++) {
            const line = document.createElement('div');
            line.className = 'grid-line vertical';
            line.style.left = `${(x / (width - 1)) * 100}%`;
            line.style.top = `${(1 / (height - 1)) * 50}%`;
            line.style.bottom = `${(1 / (height - 1)) * 50}%`;
            grid.appendChild(line);
        }

        starPoints.forEach(([sx, sy]) => {
            const point = document.createElement('div');
            point.className = 'star-point';
            point.style.left = `${(sx / (width - 1)) * 100}%`;
            point.style.top = `${(sy / (height - 1)) * 100}%`;
            grid.appendChild(point);
        });

        board.appendChild(grid);

        const clickLayer = document.createElement('div');
        clickLayer.className = 'click-layer';
        clickLayer.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;cursor:pointer;z-index:8;';
        board.appendChild(clickLayer);

        const hoverPreview = document.createElement('div');
        hoverPreview.id = 'hover-preview';
        hoverPreview.className = 'hover-preview';
        hoverPreview.style.display = 'none';
        board.appendChild(hoverPreview);

        const koMarker = document.createElement('div');
        koMarker.id = 'ko-marker';
        koMarker.className = 'ko-marker';
        koMarker.style.display = 'none';
        board.appendChild(koMarker);

        container.appendChild(board);
    },

    renderStones() {
        const board = document.getElementById('go-board');
        if (!board) return;

        board.querySelectorAll('.stone').forEach(el => el.remove());

        const pieces = this.boardState?.pieces || [];
        const { width, height } = this.getBoardSize();

        pieces.forEach(piece => {
            if (!piece.is_alive) return;
            const [px, py] = piece.position;
            const stone = document.createElement('div');
            stone.className = `stone ${piece.side}`;
            stone.style.left = `${(px / (width - 1)) * 100}%`;
            stone.style.top = `${(py / (height - 1)) * 100}%`;

            const sizePercent = 100 / (width - 1) * 0.85;
            stone.style.width = `${sizePercent}%`;
            stone.style.height = `${sizePercent}%`;

            stone.dataset.x = px;
            stone.dataset.y = py;
            stone.dataset.side = piece.side;

            if (this.lastMove &&
                this.lastMove.position &&
                this.lastMove.position[0] === px &&
                this.lastMove.position[1] === py) {
                stone.classList.add('last-move');
            }

            board.appendChild(stone);
        });

        this.updateKoMarker();
        this.updateHoverPreviewSize();
    },

    updateHoverPreviewSize() {
        const preview = document.getElementById('hover-preview');
        if (!preview) return;
        const { width } = this.getBoardSize();
        const sizePercent = 100 / (width - 1) * 0.85;
        preview.style.width = `${sizePercent}%`;
        preview.style.height = `${sizePercent}%`;
    },

    updateKoMarker() {
        const marker = document.getElementById('ko-marker');
        if (!marker) return;

        const koPoint = this.boardState?.ko_point;
        if (koPoint) {
            const { width, height } = this.getBoardSize();
            marker.style.left = `${(koPoint[0] / (width - 1)) * 100}%`;
            marker.style.top = `${(koPoint[1] / (height - 1)) * 100}%`;
            marker.style.display = 'block';
        } else {
            marker.style.display = 'none';
        }
    },

    getGridPosition(clientX, clientY) {
        const board = document.getElementById('go-board');
        if (!board) return null;

        const rect = board.getBoundingClientRect();
        const { width, height } = this.getBoardSize();

        const x = Math.round(((clientX - rect.left) / rect.width) * (width - 1));
        const y = Math.round(((clientY - rect.top) / rect.height) * (height - 1));

        if (x < 0 || x >= width || y < 0 || y >= height) return null;
        return [x, y];
    },

    async handleBoardClick(e) {
        if (this.aiThinking) return;
        if (this.boardState?.game_status?.state === 'ended') return;

        const currentTurn = this.boardState?.current_turn || 'black';
        if (currentTurn !== 'black') {
            this.showMessage('现在是AI回合，请等待...', 'system');
            return;
        }

        const pos = this.getGridPosition(e.clientX, e.clientY);
        if (!pos) return;

        const [x, y] = pos;
        await this.placeStone(x, y);
    },

    handleBoardHover(e) {
        if (this.aiThinking) return;
        if (this.boardState?.game_status?.state === 'ended') return;

        const preview = document.getElementById('hover-preview');
        if (!preview) return;

        const currentTurn = this.boardState?.current_turn || 'black';
        if (currentTurn !== 'black') {
            preview.style.display = 'none';
            return;
        }

        const pos = this.getGridPosition(e.clientX, e.clientY);
        if (!pos) {
            preview.style.display = 'none';
            this.hoverPos = null;
            return;
        }

        const [x, y] = pos;
        const { width, height } = this.getBoardSize();

        const hasStone = (this.boardState?.pieces || []).some(
            p => p.is_alive && p.position[0] === x && p.position[1] === y
        );

        if (hasStone) {
            preview.style.display = 'none';
            this.hoverPos = null;
            return;
        }

        preview.className = `hover-preview ${currentTurn}`;
        preview.style.left = `${(x / (width - 1)) * 100}%`;
        preview.style.top = `${(y / (height - 1)) * 100}%`;
        preview.style.display = 'block';
        this.hoverPos = pos;
    },

    handleBoardLeave() {
        const preview = document.getElementById('hover-preview');
        if (preview) preview.style.display = 'none';
        this.hoverPos = null;
    },

    async placeStone(x, y) {
        this.showThinking('正在落子...', '验证落子');

        try {
            const resp = await fetch('/api/place', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ position: [x, y] })
            });
            const data = await resp.json();

            this.hideThinking();

            if (!data.success) {
                this.showMessage(data.message || '落子失败', 'error');
                return;
            }

            this.boardState = data.board_state;
            this.lastMove = {
                position: [x, y],
                side: 'black'
            };
            this.renderStones();
            this.updateTurnIndicator();
            this.updateMechanisms();
            this.updateMoveCount();
            this.updateScore();
            this.updateTerritory();

            if (data.board_state.game_status?.state === 'ended') {
                this.handleGameEnd(data.board_state);
                return;
            }

            const currentTurn = data.board_state.current_turn;
            if (currentTurn === 'white') {
                setTimeout(() => this.aiMove(), 500);
            }
        } catch (e) {
            this.hideThinking();
            console.error('Place error:', e);
            this.showMessage('网络错误，请重试', 'error');
        }
    },

    async passMove() {
        if (this.aiThinking) return;
        if (this.boardState?.game_status?.state === 'ended') return;

        const currentTurn = this.boardState?.current_turn || 'black';
        if (currentTurn !== 'black') {
            this.showMessage('现在是AI回合', 'system');
            return;
        }

        if (!confirm('确定要虚手（Pass）吗？')) return;

        this.showThinking('虚手中...', '确认虚手');

        try {
            const resp = await fetch('/api/pass', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            const data = await resp.json();

            this.hideThinking();

            if (!data.success) {
                this.showMessage(data.message || '操作失败', 'error');
                return;
            }

            this.boardState = data.board_state;
            this.lastMove = null;
            this.renderStones();
            this.updateTurnIndicator();
            this.updateMoveCount();
            this.updateScore();

            if (data.board_state.game_status?.state === 'ended') {
                this.handleGameEnd(data.board_state);
                return;
            }

            const nextTurn = data.board_state.current_turn;
            if (nextTurn === 'white') {
                setTimeout(() => this.aiMove(), 500);
            }
        } catch (e) {
            this.hideThinking();
            console.error('Pass error:', e);
        }
    },

    async aiMove() {
        if (this.aiThinking) return;
        if (this.boardState?.game_status?.state === 'ended') return;

        this.aiThinking = true;
        this.showThinking('AI 思考中...', '棋局分析');

        try {
            const resp = await fetch('/api/ai_move', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            const data = await resp.json();

            this.aiThinking = false;
            this.hideThinking();

            if (!data.success) {
                this.showMessage(data.message || 'AI落子失败', 'error');
                return;
            }

            this.boardState = data.board_state;

            if (data.ai_move && data.ai_move.move_type === 'place' && data.ai_move.position) {
                this.lastMove = {
                    position: data.ai_move.position,
                    side: 'white'
                };
            } else {
                this.lastMove = null;
            }

            this.renderStones();
            this.updateTurnIndicator();
            this.updateMechanisms();
            this.updateMoveCount();
            this.updateScore();
            this.updateTerritory();
            this.loadTokenStats();

            if (data.board_state.game_status?.state === 'ended') {
                this.handleGameEnd(data.board_state);
            }
        } catch (e) {
            this.aiThinking = false;
            this.hideThinking();
            console.error('AI move error:', e);
            this.showMessage('AI落子出错，请重试', 'error');
        }
    },

    handleGameEnd(boardState) {
        const winner = boardState.game_status.winner;
        const winCondition = boardState.game_status.win_condition;
        const territory = boardState.game_status.territory;

        let message = '';
        if (winner === 'black') {
            message = '🎉 黑方胜利！';
        } else if (winner === 'white') {
            message = '🎉 白方胜利！';
        } else {
            message = '游戏结束';
        }

        if (territory) {
            message += `\n\n黑方: ${territory.black} 目\n白方: ${territory.white} 目\n贴目: ${territory.komi}`;
        }

        this.showMessage(message, 'ai');

        setTimeout(() => {
            alert(message);
        }, 300);
    },

    updateTurnIndicator() {
        const indicator = document.getElementById('turn-indicator');
        if (!indicator) return;

        const currentTurn = this.boardState?.current_turn || 'black';
        indicator.className = `turn-badge ${currentTurn}-turn`;

        const stoneEl = indicator.querySelector('.turn-stone');
        const textEl = indicator.querySelector('.turn-text');

        if (stoneEl) {
            stoneEl.className = `turn-stone ${currentTurn}`;
        }
        if (textEl) {
            textEl.textContent = currentTurn === 'black' ? '黑方回合' : '白方回合';
        }
    },

    updateMoveCount() {
        const el = document.getElementById('move-count');
        if (!el) return;
        const history = this.boardState?.move_history || [];
        el.textContent = `第 ${history.length} 手`;
    },

    updateScore() {
        const captured = this.boardState?.captured_stones || {};
        const blackEl = document.getElementById('black-captured');
        const whiteEl = document.getElementById('white-captured');
        if (blackEl) blackEl.textContent = captured.black || 0;
        if (whiteEl) whiteEl.textContent = captured.white || 0;
    },

    async updateTerritory() {
        try {
            const resp = await fetch('/api/territory');
            const data = await resp.json();
            if (data.success && data.territory) {
                const t = data.territory;
                const blackEl = document.getElementById('territory-black');
                const whiteEl = document.getElementById('territory-white');
                const komiEl = document.getElementById('komi-value');

                if (blackEl) blackEl.textContent = Math.round(t.black * 10) / 10;
                if (whiteEl) whiteEl.textContent = Math.round(t.white * 10) / 10;
                if (komiEl) komiEl.textContent = t.komi || 6.5;
            }
        } catch (e) {
            // silent fail
        }
    },

    updateAIPersonality() {
        const personality = this.configs.rules?.ai_difficulty?.personality || {};
        const type = personality.type || 'normal';
        const agg = personality.aggressiveness ?? 0.5;
        const cons = personality.conservatism ?? 0.5;

        const typeMap = {
            normal: { name: '均衡型', en: 'Balanced', icon: '☯', desc: '攻守兼备的标准AI' },
            aggressive: { name: '激进型', en: 'Aggressive', icon: '⚔', desc: '偏好进攻和吃子' },
            defensive: { name: '稳健型', en: 'Defensive', icon: '🛡', desc: '注重防守和地盘' },
            random: { name: '随性型', en: 'Random', icon: '🎲', desc: '随机落子的趣味AI' },
            strategic: { name: '战略型', en: 'Strategic', icon: '♟', desc: '深谋远虑的战略家' },
            trick: { name: '诡异型', en: 'Tricky', icon: '🎭', desc: '经常走出意外之棋' }
        };

        const info = typeMap[type] || typeMap.normal;

        const iconEl = document.getElementById('personality-icon');
        const typeEl = document.getElementById('personality-type');
        const subtitleEl = document.getElementById('personality-subtitle');
        const descEl = document.getElementById('personality-desc');
        const barAgg = document.getElementById('bar-agg');
        const barDef = document.getElementById('bar-def');
        const pctAgg = document.getElementById('bar-agg-pct');
        const pctDef = document.getElementById('bar-def-pct');

        if (iconEl) iconEl.textContent = info.icon;
        if (typeEl) typeEl.textContent = info.name;
        if (subtitleEl) subtitleEl.textContent = info.en;
        if (descEl) descEl.textContent = info.desc;
        if (barAgg) barAgg.style.width = `${Math.round(agg * 100)}%`;
        if (barDef) barDef.style.width = `${Math.round(cons * 100)}%`;
        if (pctAgg) pctAgg.textContent = `${Math.round(agg * 100)}%`;
        if (pctDef) pctDef.textContent = `${Math.round(cons * 100)}%`;
    },

    updateMechanisms() {
        const mechEl = document.getElementById('active-mechanisms');
        if (!mechEl) return;

        const mechanisms = this.boardState?.mechanisms || {};
        const items = [];

        const mechIcons = {
            skip_turns: '⏭',
            ai_control: '🤖',
            random_moves: '🎲',
            extra_turns: '⚡',
            move_limits: '⏱',
            player_control: '🎮'
        };

        for (const [type, list] of Object.entries(mechanisms)) {
            if (!Array.isArray(list) || list.length === 0) continue;
            list.forEach(m => {
                const side = m.side === 'both' ? '双方' : (m.side === 'black' ? '黑方' : '白方');
                let detail = '';
                if (m.remaining !== undefined) detail = `剩余 ${m.remaining} 回合`;
                if (m.reason) detail = m.reason;
                items.push(`<div class="mechanism-item"><span class="mechanism-icon">${mechIcons[type] || '⚙'}</span><div class="mechanism-info"><div class="mechanism-name">${this.mechName(type)}</div><div class="mechanism-detail">${side} · ${detail}</div></div></div>`);
            });
        }

        if (items.length === 0) {
            mechEl.innerHTML = '<span class="empty">无激活机制</span>';
        } else {
            mechEl.innerHTML = items.join('');
        }
    },

    mechName(type) {
        const names = {
            skip_turns: '跳过回合',
            ai_control: 'AI接管',
            random_moves: '随机走棋',
            extra_turns: '额外回合',
            move_limits: '步数限制',
            player_control: '玩家控制'
        };
        return names[type] || type;
    },

    updateActiveRules() {
        const rulesEl = document.getElementById('active-rules');
        if (!rulesEl) return;

        const active = this.boardState?.game_status?.custom_rules_active || [];
        if (active.length === 0) {
            rulesEl.innerHTML = '<span class="empty">暂无自定义规则</span>';
        } else {
            rulesEl.innerHTML = active.map(r =>
                `<div class="rule-item"><span class="rule-icon">📜</span><div class="rule-info"><div class="rule-name">${r.name || r.type}</div><div class="rule-detail">${r.description || ''}</div></div></div>`
            ).join('');
        }
    },

    showMessage(text, type = 'system') {
        const container = document.getElementById('ai-messages');
        if (!container) return;

        const msg = document.createElement('div');
        msg.className = `message ${type}`;
        msg.innerHTML = `<p>${text.replace(/\n/g, '<br>')}</p>`;
        container.appendChild(msg);
        container.scrollTop = container.scrollHeight;
    },

    showThinking(text, stage) {
        const overlay = document.getElementById('thinking-overlay');
        const textEl = document.getElementById('thinking-text');
        const stageEl = document.getElementById('thinking-stage');

        if (overlay) overlay.classList.add('active');
        if (textEl) textEl.textContent = text;
        if (stageEl) stageEl.textContent = `阶段: ${stage}`;
    },

    hideThinking() {
        const overlay = document.getElementById('thinking-overlay');
        if (overlay) overlay.classList.remove('active');
    },

    checkApiKey() {
        const saved = localStorage.getItem('go_api_key');
        if (saved) {
            this.setApiKey(saved);
        }
    },

    async setApiKey(key) {
        try {
            const resp = await fetch('/api/apikey', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ api_key: key })
            });
            const data = await resp.json();
            if (data.success) {
                localStorage.setItem('go_api_key', key);
            }
        } catch (e) {
            console.error('Set API key error:', e);
        }
    },

    async sendCommand() {
        const input = document.getElementById('command-input');
        if (!input) return;

        const command = input.value.trim();
        if (!command) return;

        input.value = '';
        this.showMessage(command, 'user');
        this.showThinking('AI 正在理解您的指令...', '意图解析');

        try {
            const resp = await fetch('/api/command', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ command })
            });
            const data = await resp.json();

            this.hideThinking();
            this.loadTokenStats();

            if (data.success) {
                this.showMessage(data.explanation || data.message || '已完成', 'ai');

                if (data.type === 'applied' && data.modified_configs) {
                    await this.loadConfigs();
                    this.renderBoard();
                    this.renderStones();
                    this.updateTurnIndicator();
                    this.updateActiveRules();
                    this.updateAIPersonality();
                    this.updateMechanisms();
                }
            } else {
                this.showMessage(data.message || '操作失败', 'error');
            }
        } catch (e) {
            this.hideThinking();
            console.error('Command error:', e);
            this.showMessage('网络错误，请重试', 'error');
        }
    },

    async undoMove() {
        if (this.aiThinking) return;

        this.showThinking('悔棋中...', '回退局面');

        try {
            const resp = await fetch('/api/undo', { method: 'POST' });
            const data = await resp.json();

            this.hideThinking();

            if (data.success) {
                this.boardState = data.board_state;
                this.lastMove = null;
                this.renderStones();
                this.updateTurnIndicator();
                this.updateMoveCount();
                this.updateScore();
                this.updateTerritory();
                this.showMessage('已悔棋', 'system');
            } else {
                this.showMessage(data.message || '悔棋失败', 'error');
            }
        } catch (e) {
            this.hideThinking();
        }
    },

    async restartGame() {
        if (!confirm('确定要重新开始吗？')) return;

        this.showThinking('重新开始...', '重置棋盘');

        try {
            const resp = await fetch('/api/restart', { method: 'POST' });
            const data = await resp.json();

            this.hideThinking();

            if (data.success) {
                await this.loadConfigs();
                this.renderBoard();
                this.renderStones();
                this.updateTurnIndicator();
                this.updateActiveRules();
                this.updateAIPersonality();
                this.updateMechanisms();
                this.updateMoveCount();
                this.updateScore();
                this.updateTerritory();
                this.lastMove = null;
                this.showMessage('游戏已重新开始', 'system');
            }
        } catch (e) {
            this.hideThinking();
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
                this.updateTurnIndicator();
                this.updateActiveRules();
                this.updateAIPersonality();
                this.updateMechanisms();
                this.showMessage('已撤回上一次AI修改', 'system');
            } else {
                this.showMessage(data.message || '撤回失败', 'error');
            }
        } catch (e) {
            console.error('Undo config error:', e);
        }
    },

    async resetConfigs() {
        if (!confirm('确定要重置所有配置吗？这将清除所有自定义规则。')) return;

        try {
            const resp = await fetch('/api/reset_configs', { method: 'POST' });
            const data = await resp.json();

            if (data.success) {
                await this.loadConfigs();
                this.renderBoard();
                this.renderStones();
                this.updateTurnIndicator();
                this.updateActiveRules();
                this.updateAIPersonality();
                this.updateMechanisms();
                this.showMessage('所有配置已重置', 'system');
            }
        } catch (e) {
            console.error('Reset configs error:', e);
        }
    },

    async showLogs() {
        const modal = document.getElementById('logs-modal');
        if (!modal) return;

        modal.classList.add('active');

        try {
            const resp = await fetch('/api/logs?count=20');
            const data = await resp.json();
            const container = document.getElementById('logs-container');
            if (container && data.logs) {
                container.innerHTML = data.logs.map(log =>
                    `<div class="log-entry"><div class="log-role">${log.role || log.type || ''}</div><div class="log-content">${log.content || log.message || ''}</div></div>`
                ).join('');
            }
        } catch (e) {
            console.error('Load logs error:', e);
        }
    },

    bindEvents() {
        const board = document.getElementById('go-board');
        if (board) {
            board.addEventListener('click', (e) => this.handleBoardClick(e));
            board.addEventListener('mousemove', (e) => this.handleBoardHover(e));
            board.addEventListener('mouseleave', () => this.handleBoardLeave());
        }

        const sendBtn = document.getElementById('btn-send');
        const input = document.getElementById('command-input');

        if (sendBtn) {
            sendBtn.addEventListener('click', () => this.sendCommand());
        }
        if (input) {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') this.sendCommand();
            });
        }

        const passBtn = document.getElementById('btn-pass');
        if (passBtn) passBtn.addEventListener('click', () => this.passMove());

        const undoBtn = document.getElementById('btn-undo');
        if (undoBtn) undoBtn.addEventListener('click', () => this.undoMove());

        const restartBtn = document.getElementById('btn-restart');
        if (restartBtn) restartBtn.addEventListener('click', () => this.restartGame());

        const undoConfigBtn = document.getElementById('btn-undo-config');
        if (undoConfigBtn) undoConfigBtn.addEventListener('click', () => this.undoConfig());

        const resetBtn = document.getElementById('btn-reset-configs');
        if (resetBtn) resetBtn.addEventListener('click', () => this.resetConfigs());

        const logsBtn = document.getElementById('btn-logs');
        if (logsBtn) logsBtn.addEventListener('click', () => this.showLogs());

        const closeLogsBtn = document.getElementById('close-logs');
        if (closeLogsBtn) {
            closeLogsBtn.addEventListener('click', () => {
                document.getElementById('logs-modal')?.classList.remove('active');
            });
        }

        const settingsBtn = document.getElementById('btn-settings');
        if (settingsBtn) {
            settingsBtn.addEventListener('click', () => {
                const modal = document.getElementById('settings-modal');
                if (modal) {
                    modal.classList.add('active');
                    const apiInput = document.getElementById('api-key-input');
                    if (apiInput) apiInput.value = localStorage.getItem('go_api_key') || '';
                }
            });
        }

        const closeSettingsBtn = document.getElementById('close-settings');
        if (closeSettingsBtn) {
            closeSettingsBtn.addEventListener('click', () => {
                document.getElementById('settings-modal')?.classList.remove('active');
            });
        }

        const saveSettingsBtn = document.getElementById('save-settings');
        if (saveSettingsBtn) {
            saveSettingsBtn.addEventListener('click', async () => {
                const apiInput = document.getElementById('api-key-input');
                const difficultySelect = document.getElementById('difficulty-select');

                if (apiInput && apiInput.value) {
                    await this.setApiKey(apiInput.value);
                }

                if (difficultySelect) {
                    try {
                        const resp = await fetch('/api/difficulty', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ difficulty: difficultySelect.value })
                        });
                        const data = await resp.json();
                        if (data.success) {
                            await this.loadConfigs();
                            this.updateAIPersonality();
                        }
                    } catch (e) {
                        console.error('Set difficulty error:', e);
                    }
                }

                document.getElementById('settings-modal')?.classList.remove('active');
                this.showMessage('设置已保存', 'system');
            });
        }

        const hintTags = document.querySelectorAll('.hint-tag');
        hintTags.forEach(tag => {
            tag.addEventListener('click', () => {
                const input = document.getElementById('command-input');
                if (input) {
                    input.value = tag.textContent.replace(/^"|"$/g, '');
                    input.focus();
                }
            });
        });

        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.remove('active');
                }
            });
        });
    }
};

document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
