/* ═══════════════════════════════════════════════════════════════
   无限制象棋 - 前端应用
   ═══════════════════════════════════════════════════════════════ */

const App = {
    // ═══════════════════════════════════════════════════════════════
    // 状态
    // ═══════════════════════════════════════════════════════════════
    configs: {},
    boardState: null,
    uiConfig: null,
    selectedPiece: null,
    validMoves: [],
    lastMove: null,
    aiThinking: false,
    coordInsertMode: false,
    selectMode: 'coord',
    regionPoints: [],
    coordDots: [],

    // ═══════════════════════════════════════════════════════════════
    // 初始化
    // ═══════════════════════════════════════════════════════════════
    async init() {
        await this.loadConfigs();
        this.renderBoard();
        this.renderPieces();
        this.updateTurnIndicator();
        this.updateActiveRules();
        this.updateGameObjectives();
        this.updateAIPersonality();
        this.updateMechanisms();
        this.bindEvents();
        this.checkApiKey();
        this.loadTokenStats();
    },

    async loadTokenStats() {
        try {
            const resp = await fetch('/api/token_stats');
            const data = await resp.json();

            document.getElementById('token-total').textContent = data.total_tokens.toLocaleString();
            document.getElementById('token-today').textContent = data.today_tokens.toLocaleString();
            document.getElementById('token-calls').textContent = data.total_calls.toLocaleString();
            document.getElementById('token-cost').textContent = `$${data.estimated_cost_usd.toFixed(4)}`;
        } catch (e) {
            console.error('Failed to load token stats:', e);
        }
    },

    async loadConfigs() {
        const resp = await fetch('/api/config/all', { cache: 'no-store' });
        this.configs = await resp.json();
        this.boardState = this.configs.board_state;
        this.uiConfig = this.configs.ui_config;
        console.log('[DEBUG] loadConfigs - board.appearance:', this.configs.board?.appearance);
    },

    // ═══════════════════════════════════════════════════════════════
    // 棋盘渲染
    // ═══════════════════════════════════════════════════════════════

    _getBoardLayoutConfig() {
        const defaults = {
            grid: {
                line_thickness: 0.03,
                show_horizontal: true,
                show_vertical: true,
                river_gap: true
            },
            palace: {
                enabled: true,
                show_diagonals: true,
                line_thickness: 0.03
            },
            river: {
                enabled: true,
                text: '楚 河          漢 界',
                text_size: 0.5,
                gap_ratio: 1.0
            },
            appearance: {
                background_color: '#f0d9b5',
                line_color: '#5c3a1e',
                palace_line_color: null
            },
            layout: {
                viewbox_padding_left: 0.444,
                viewbox_padding_right: 0.444,
                viewbox_padding_top: 0.5,
                viewbox_padding_bottom: 0.5,
                board_size: '90vmin'
            },
            decorations: {
                border: {
                    enabled: false,
                    thickness: 0.1,
                    color: null
                },
                custom_lines: [],
                background_pattern: null
            }
        };

        const user = this.configs.board?.appearance || {};
        console.log('[DEBUG] _getBoardLayoutConfig - user.appearance:', user);

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
            // 修复：board.json 中 background_color/line_color/palace_line_color 直接位于 appearance 下
            // （见 board.schema.json），而 defaults 把它们嵌套在 appearance 子对象里。
            // merge() 会去查找 user.appearance（不存在，user 本身就是 appearance 对象），
            // 导致颜色始终回退为默认值。这里用 user 中的真实颜色值修正 merged.appearance。
            // 用 !== undefined 而非 ??，因为 palace_line_color 合法可为 null。
            merged.appearance = {
                background_color: user.background_color !== undefined
                    ? user.background_color : defaults.appearance.background_color,
                line_color: user.line_color !== undefined
                    ? user.line_color : defaults.appearance.line_color,
                palace_line_color: user.palace_line_color !== undefined
                    ? user.palace_line_color : defaults.appearance.palace_line_color,
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
        const width = geometry.width || 9;
        const height = geometry.height || 10;
        const riverLine = geometry.river_line || 5;
        const palace = geometry.palace || {
            black: { top_left: [3, 0], bottom_right: [5, 2] },
            red: { top_left: [3, 7], bottom_right: [5, 9] }
        };

        let orientation = geometry.orientation;
        if (!orientation) {
            orientation = width > height ? 'vertical' : 'horizontal';
        }

        const bgColor = layoutConfig.appearance.background_color;
        console.log('[DEBUG] renderBoard - background_color:', bgColor, 'from layoutConfig:', layoutConfig.appearance);
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
        const riverGap = layoutConfig.grid.river_gap;
        const showHorizontal = layoutConfig.grid.show_horizontal;
        const showVertical = layoutConfig.grid.show_vertical;

        if (orientation === 'horizontal') {
            if (showHorizontal) {
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

            if (showVertical) {
                for (let i = 0; i < width; i++) {
                    const x = i;
                    if (riverGap) {
                        const line1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                        line1.setAttribute('x1', x);
                        line1.setAttribute('y1', '0');
                        line1.setAttribute('x2', x);
                        line1.setAttribute('y2', riverLine - 1);
                        line1.setAttribute('stroke', lineColor);
                        line1.setAttribute('stroke-width', sw);
                        svg.appendChild(line1);

                        const line2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                        line2.setAttribute('x1', x);
                        line2.setAttribute('y1', riverLine);
                        line2.setAttribute('x2', x);
                        line2.setAttribute('y2', height - 1);
                        line2.setAttribute('stroke', lineColor);
                        line2.setAttribute('stroke-width', sw);
                        svg.appendChild(line2);
                    } else {
                        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                        line.setAttribute('x1', x);
                        line.setAttribute('y1', '0');
                        line.setAttribute('x2', x);
                        line.setAttribute('y2', height - 1);
                        line.setAttribute('stroke', lineColor);
                        line.setAttribute('stroke-width', sw);
                        svg.appendChild(line);
                    }
                }
            }
        } else {
            if (showVertical) {
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

            if (showHorizontal) {
                for (let i = 0; i < height; i++) {
                    const y = i;
                    if (riverGap) {
                        const line1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                        line1.setAttribute('x1', '0');
                        line1.setAttribute('y1', y);
                        line1.setAttribute('x2', riverLine - 1);
                        line1.setAttribute('y2', y);
                        line1.setAttribute('stroke', lineColor);
                        line1.setAttribute('stroke-width', sw);
                        svg.appendChild(line1);

                        const line2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                        line2.setAttribute('x1', riverLine);
                        line2.setAttribute('y1', y);
                        line2.setAttribute('x2', width - 1);
                        line2.setAttribute('y2', y);
                        line2.setAttribute('stroke', lineColor);
                        line2.setAttribute('stroke-width', sw);
                        svg.appendChild(line2);
                    } else {
                        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                        line.setAttribute('x1', '0');
                        line.setAttribute('y1', y);
                        line.setAttribute('x2', width - 1);
                        line.setAttribute('y2', y);
                        line.setAttribute('stroke', lineColor);
                        line.setAttribute('stroke-width', sw);
                        svg.appendChild(line);
                    }
                }
            }
        }

        if (layoutConfig.palace.enabled && layoutConfig.palace.show_diagonals) {
            const palaceLines = [];
            if (palace.black) {
                const tl = palace.black.top_left;
                const br = palace.black.bottom_right;
                palaceLines.push([tl, br]);
                palaceLines.push([[br[0], tl[1]], [tl[0], br[1]]]);
            }
            if (palace.red) {
                const tl = palace.red.top_left;
                const br = palace.red.bottom_right;
                palaceLines.push([tl, br]);
                palaceLines.push([[br[0], tl[1]], [tl[0], br[1]]]);
            }
            const palaceLineColor = layoutConfig.appearance.palace_line_color || lineColor;
            const palaceSw = String(layoutConfig.palace.line_thickness);
            palaceLines.forEach(([start, end]) => {
                const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                line.setAttribute('x1', start[0]);
                line.setAttribute('y1', start[1]);
                line.setAttribute('x2', end[0]);
                line.setAttribute('y2', end[1]);
                line.setAttribute('stroke', palaceLineColor);
                line.setAttribute('stroke-width', palaceSw);
                svg.appendChild(line);
            });
        }

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

        if (layoutConfig.river.enabled) {
            const riverText = document.createElement('div');
            riverText.className = 'river-text';
            riverText.textContent = layoutConfig.river.text;
            riverText.style.color = lineColor;

            if (orientation === 'horizontal') {
                const riverTopPct = 5 + ((riverLine - 0.5) / (height - 1)) * 90;
                riverText.style.top = `${riverTopPct}%`;
                riverText.style.left = '50%';
                riverText.style.transform = 'translate(-50%, -50%)';
                riverText.style.writingMode = 'horizontal-tb';
            } else {
                const riverLeftPct = 5 + ((riverLine - 0.5) / (width - 1)) * 90;
                riverText.style.left = `${riverLeftPct}%`;
                riverText.style.top = '50%';
                riverText.style.transform = 'translate(-50%, -50%)';
                riverText.style.writingMode = 'vertical-rl';
            }

            container.appendChild(riverText);
        }

        this.applyUiConfig();
    },

    applyUiConfig() {
        const rotation = this.uiConfig?.layout?.rotation || 0;
        const container = document.getElementById('board-container');
        if (container) {
            container.style.transform = `rotate(${rotation}deg)`;
            container.style.transition = 'transform 0.3s ease';
        }

        document.querySelectorAll('.piece-text').forEach(el => {
            el.style.transform = `rotate(${-rotation}deg)`;
            el.style.transition = 'transform 0.3s ease';
        });

        const customStyleId = 'custom-ui-css';
        let styleEl = document.getElementById(customStyleId);
        if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = customStyleId;
            document.head.appendChild(styleEl);
        }
        styleEl.textContent = this.uiConfig?.custom_css || '';
    },

    // ═══════════════════════════════════════════════════════════════
    // 棋子渲染
    // ═══════════════════════════════════════════════════════════════
    renderPieces() {
        const container = document.getElementById('board-container');
        // 移除现有棋子
        container.querySelectorAll('.piece').forEach(el => el.remove());

        const piecesTheme = this.uiConfig?.theme?.pieces || {};
        const fontFamily = piecesTheme.font_family || "'KaiTi', serif";

        const pieces = this.boardState?.pieces || [];
        pieces.forEach(piece => {
            if (!piece.is_alive) return;
            this.createPieceElement(piece, piecesTheme, fontFamily);
        });

        // 标记最后移动的棋子
        if (this.lastMove) {
            const el = container.querySelector(`[data-piece-id="${this.lastMove.piece_id}"]`);
            if (el) el.classList.add('last-moved');
        }
    },

    createPieceElement(piece, theme, fontFamily) {
        const container = document.getElementById('board-container');
        const el = document.createElement('div');
        el.className = `piece ${piece.side}`;
        el.dataset.pieceId = piece.id;

        const textSpan = document.createElement('span');
        textSpan.className = 'piece-text';
        textSpan.textContent = piece.name;
        el.appendChild(textSpan);

        const geometry = this.configs.board?.geometry || {};
        const width = geometry.width || 9;
        const height = geometry.height || 10;

        const [x, y] = piece.position;
        const leftPct = 5 + (x / (width - 1)) * 90;
        const topPct = 5 + (y / (height - 1)) * 90;

        el.style.left = `${leftPct}%`;
        el.style.top = `${topPct}%`;
        el.style.transform = 'translate(-50%, -50%)';
        el.style.fontFamily = fontFamily;

        // 应用主题颜色
        if (piece.side === 'red') {
            el.style.color = theme.red_color || '#cc0000';
            el.style.background = theme.red_bg || '#fff5e6';
            el.style.borderColor = theme.red_color || '#cc0000';
        } else {
            el.style.color = theme.black_color || '#1a1a1a';
            el.style.background = theme.black_bg || '#e6e6e6';
            el.style.borderColor = theme.black_color || '#1a1a1a';
        }

        // 应用自定义属性
        if (piece.custom_properties) {
            const cp = piece.custom_properties;
            if (cp.color) el.style.color = cp.color;
            if (cp.bg) el.style.background = cp.bg;
            if (cp.font_size) el.style.fontSize = cp.font_size;
        }

        el.addEventListener('click', (e) => {
            e.stopPropagation();
            if (this.coordInsertMode) {
                const [gx, gy] = piece.position;
                this.onCoordDotClick(gx, gy);
                return;
            }
            this.onPieceClick(piece);
        });

        container.appendChild(el);
    },

    // ═══════════════════════════════════════════════════════════════
    // 棋子交互
    // ═══════════════════════════════════════════════════════════════
    async onPieceClick(piece) {
        if (this.aiThinking) return;
        if (this.boardState?.game_status?.state === 'ended') return;

        // 如果点击的是对方棋子且有选中棋子，尝试吃子
        if (this.selectedPiece && piece.side !== this.selectedPiece.side) {
            if (this.validMoves.some(m => m[0] === piece.position[0] && m[1] === piece.position[1])) {
                await this.executeMove(this.selectedPiece.id, piece.position);
                return;
            }
        }

        // 只能选自己的棋子（红方）
        if (piece.side !== 'red') {
            if (this.selectedPiece) {
                this.clearSelection();
            }
            return;
        }

        if (this.boardState?.current_turn !== 'red') return;

        // 选中棋子
        this.selectedPiece = piece;
        this.highlightPiece(piece);

        // 获取合法移动
        try {
            const resp = await fetch('/api/valid_moves', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ piece_id: piece.id, to: piece.position })
            });
            const data = await resp.json();
            this.validMoves = data.moves || [];
            this.showValidMoves();
        } catch (e) {
            console.error('获取合法移动失败:', e);
        }
    },

    highlightPiece(piece) {
        document.querySelectorAll('.piece').forEach(el => {
            el.classList.remove('selected');
        });
        const el = document.querySelector(`[data-piece-id="${piece.id}"]`);
        if (el) el.classList.add('selected');
    },

    showValidMoves() {
        this.clearValidMoves();
        const container = document.getElementById('board-container');
        const geometry = this.configs.board?.geometry || {};
        const width = geometry.width || 9;
        const height = geometry.height || 10;
        this.validMoves.forEach(([x, y]) => {
            const indicator = document.createElement('div');
            indicator.className = 'valid-move-indicator';
            const leftPct = 5 + (x / (width - 1)) * 90;
            const topPct = 5 + (y / (height - 1)) * 90;
            indicator.style.left = `${leftPct}%`;
            indicator.style.top = `${topPct}%`;
            indicator.style.transform = 'translate(-50%, -50%)';
            indicator.style.cursor = 'pointer';
            indicator.style.pointerEvents = 'auto'; // 允许点击

            const highlight = this.uiConfig?.theme?.highlight;
            if (highlight?.valid_move) {
                indicator.style.background = highlight.valid_move;
            }

            // 添加点击事件 - 点击合法移动位置执行移动
            indicator.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.coordInsertMode) {
                    this.onCoordDotClick(x, y);
                    return;
                }
                if (this.selectedPiece) {
                    this.executeMove(this.selectedPiece.id, [x, y]);
                }
            });

            container.appendChild(indicator);
        });
    },

    clearValidMoves() {
        document.querySelectorAll('.valid-move-indicator').forEach(el => el.remove());
    },

    clearSelection() {
        this.selectedPiece = null;
        this.validMoves = [];
        document.querySelectorAll('.piece').forEach(el => {
            el.classList.remove('selected');
        });
        this.clearValidMoves();
    },

    // ═══════════════════════════════════════════════════════════════
    // 执行移动
    // ═══════════════════════════════════════════════════════════════
    async executeMove(pieceId, toPosition) {
        this.clearSelection();
        // 清除AI棋子高亮
        document.querySelectorAll('.piece').forEach(el => {
            el.classList.remove('ai-moved');
        });
        this.aiThinking = true;

        try {
            const resp = await fetch('/api/move', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ piece_id: pieceId, to: toPosition })
            });
            const data = await resp.json();

            if (data.success) {
                this.boardState = data.board_state;
                this.lastMove = this.boardState.move_history.slice(-1)[0];
                this.renderPieces();
                this.updateTurnIndicator();
                this.updateActiveRules();
                this.updateGameObjectives();
                this.updateMechanisms();
                this.loadTokenStats();

                // 检查游戏结束
                if (this.boardState.game_status.state === 'ended') {
                    this.showGameOver();
                    this.aiThinking = false;
                    return;
                }

                // AI走棋
                await this.sleep(800);
                await this.makeAIMove();
            } else {
                this.addMessage(data.message || '移动失败', 'error');
                // 如果是因为AI接管导致失败，自动触发AI走棋
                if (data.ai_controlled && !this.aiThinking) {
                    this.aiThinking = true;
                    await this.sleep(500);
                    await this.makeAIMove();
                    this.aiThinking = false;
                }
            }
        } catch (e) {
            this.addMessage(`网络错误: ${e.message}`, 'error');
        }

        this.aiThinking = false;
    },

    async makeAIMove(depth = 0) {
        if (depth > 10) return;

        this.addMessage('AI思考中...', 'info');

        try {
            const resp = await fetch('/api/ai_move', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });
            const data = await resp.json();

            if (data.success) {
                this.boardState = data.board_state;
                this.lastMove = data.ai_move;
                this.renderPieces();
                this.updateTurnIndicator();
                this.updateActiveRules();
                this.updateGameObjectives();
                this.updateMechanisms();

                // 高亮AI移动的棋子
                this.highlightAIMovedPiece(data.ai_move.piece_id);

                // 移除"思考中"消息
                const messages = document.getElementById('ai-messages');
                const lastMsg = messages.lastElementChild;
                if (lastMsg && lastMsg.textContent.includes('思考中')) {
                    lastMsg.remove();
                }

                if (data.ai_move?.captured) {
                    this.addMessage(`AI走了${this.getPieceName(data.ai_move.piece_id)}`, 'info');
                }

                if (this.boardState.game_status.state === 'ended') {
                    this.showGameOver();
                    return;
                }

                // 检查当前回合方是否需要AI走棋（黑方默认AI，或被AI接管），如果是，继续递归走棋
                if (this._isCurrentTurnAITurn()) {
                    await this.sleep(600);
                    await this.makeAIMove(depth + 1);
                }
            } else {
                this.addMessage(data.message || 'AI移动失败', 'error');
            }
        } catch (e) {
            this.addMessage(`AI错误: ${e.message}`, 'error');
        }
    },

    _isCurrentTurnAITurn() {
        const currentTurn = this.boardState?.current_turn || 'red';
        // 黑方默认由AI走棋
        if (currentTurn === 'black') return true;
        // 检查当前回合方是否被AI接管
        return this._isCurrentTurnAIControlled();
    },

    _isCurrentTurnAIControlled() {
        const mechanisms = this.boardState?.mechanisms || {};
        const currentTurn = this.boardState?.current_turn || 'red';
        const aiControl = mechanisms.ai_control || [];
        return aiControl.some(item => item.side === currentTurn && item.remaining !== 0);
    },

    highlightAIMovedPiece(pieceId) {
        // 先清除之前的高亮
        document.querySelectorAll('.piece').forEach(el => {
            el.classList.remove('ai-moved');
        });
        // 高亮新移动的棋子
        const el = document.querySelector(`[data-piece-id="${pieceId}"]`);
        if (el) {
            el.classList.add('ai-moved');
        }
    },

    // ═══════════════════════════════════════════════════════════════
    // 玩家指令处理
    // ═══════════════════════════════════════════════════════════════
    async sendCommand(command) {
        if (!command.trim()) return;

        this.addMessage(`📝 你: ${command}`, 'user');

        // 显示AI思考状态
        this.showThinking('ChatAI 正在理解您的意图...', '意图解析');

        try {
            const resp = await fetch('/api/command', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ command: command })
            });
            const data = await resp.json();

            // 隐藏思考状态
            this.hideThinking();

            if (data.success) {
                if (data.type === 'applied') {
                    this.addMessage(`✅ ${data.message}`, 'success');
                    // D2 类 HTML 修改需要刷新页面以重新绑定事件
                    if (data.refresh_page) {
                        await this.sleep(500);
                        window.location.reload();
                        return;
                    }
                    // 重新加载配置
                    await this.loadConfigs();
                    this.renderBoard();
                    this.renderPieces();
                    this.updateTurnIndicator();
                    this.updateActiveRules();
                    this.updateGameObjectives();
                    this.updateAIPersonality();
                    this.updateMechanisms();
                    this.loadTokenStats();

                    // 触发性格变化动画
                    if (data.classification === 'A') {
                        this.triggerPersonalityChangeAnimation();
                    }

                    // 检查游戏是否因本指令而结束（如"让对方投降"）
                    const gameStatus = this.boardState?.game_status;
                    console.log('[DEBUG] sendCommand - game_status:', gameStatus);
                    if (gameStatus && gameStatus.state === 'ended') {
                        setTimeout(() => this.showGameOver(), 100);
                    }

                    // 检查当前回合方是否需要AI走棋，如果是，自动触发AI走棋
                    if (this._isCurrentTurnAITurn() && !this.aiThinking) {
                        this.aiThinking = true;
                        await this.sleep(500);
                        await this.makeAIMove();
                        this.aiThinking = false;
                    }
                } else if (data.type === 'fun') {
                    this.addMessage(data.message, 'fun');
                    this.loadTokenStats();
                }
            } else {
                if (data.type === 'rejected') {
                    this.addMessage(`❌ ${data.message}`, 'error');
                } else {
                    this.addMessage(`⚠️ ${data.message}`, 'error');
                }
            }
        } catch (e) {
            this.hideThinking();
            this.addMessage(`网络错误: ${e.message}`, 'error');
        }
    },

    // ═══════════════════════════════════════════════════════════════
    // AI思考状态UI
    // ═══════════════════════════════════════════════════════════════
    showThinking(text, stage) {
        const overlay = document.getElementById('thinking-overlay');
        const textEl = document.getElementById('thinking-text');
        const stageEl = document.getElementById('thinking-stage');

        textEl.textContent = text;
        stageEl.textContent = `阶段: ${stage}`;
        overlay.classList.add('show');

        // 锁定棋盘和输入
        document.getElementById('board-container').classList.add('board-locked');
        document.getElementById('input-section')?.classList.add('input-locked');
        document.getElementById('command-input').disabled = true;

        // 开始轮询思考状态
        this.pollThinkingStatus();
    },

    hideThinking() {
        const overlay = document.getElementById('thinking-overlay');
        overlay.classList.remove('show');

        // 解锁
        document.getElementById('board-container').classList.remove('board-locked');
        document.getElementById('input-section')?.classList.remove('input-locked');
        document.getElementById('command-input').disabled = false;

        // 停止轮询
        if (this.thinkingPollInterval) {
            clearInterval(this.thinkingPollInterval);
            this.thinkingPollInterval = null;
        }
    },

    async pollThinkingStatus() {
        this.thinkingPollInterval = setInterval(async () => {
            try {
                const resp = await fetch('/api/thinking_status');
                const data = await resp.json();

                if (data.thinking) {
                    const textEl = document.getElementById('thinking-text');
                    const stageEl = document.getElementById('thinking-stage');

                    if (data.stage === 'intent') {
                        textEl.textContent = 'ChatAI 正在理解您的意图...';
                        stageEl.textContent = '阶段: 意图解析';
                    } else if (data.stage === 'code') {
                        textEl.textContent = 'CodeAI 正在生成代码...';
                        stageEl.textContent = '阶段: 代码生成';
                    }
                }
            } catch (e) {
                console.error('轮询思考状态失败:', e);
            }
        }, 500);
    },

    // ═══════════════════════════════════════════════════════════════
    // 日志功能
    // ═══════════════════════════════════════════════════════════════
    async showLogs() {
        const modal = document.getElementById('logs-modal');
        const container = document.getElementById('logs-container');

        modal.classList.add('show');
        await this.refreshLogs();
    },

    hideLogs() {
        document.getElementById('logs-modal').classList.remove('show');
    },

    async refreshLogs() {
        const container = document.getElementById('logs-container');

        try {
            const resp = await fetch('/api/logs?count=10');
            const data = await resp.json();

            if (data.logs && data.logs.length > 0) {
                container.innerHTML = data.logs.map((log, index) => this.renderLogEntry(log, index)).join('');
            } else {
                container.innerHTML = '<div class="empty">暂无日志</div>';
            }
        } catch (e) {
            container.innerHTML = `<div class="error">加载日志失败: ${e.message}</div>`;
        }
    },

    renderLogEntry(log, index) {
        const intent = log.intent_analysis || {};
        const code = log.code_generation || {};
        const final = log.final_result || {};

        let statusClass = '';
        if (final.type === 'error' || log.errors?.length > 0) statusClass = 'error';
        else if (final.type === 'applied') statusClass = 'success';

        return `
            <div class="log-entry ${statusClass}">
                <div class="log-header">
                    <span>#${index + 1} ${log.timestamp || '未知时间'}</span>
                    <span>分类: ${log.classification || 'N/A'}</span>
                </div>
                <div class="log-user-input">👤 用户: ${this.escapeHtml(log.user_input || '')}</div>

                ${intent.success ? `
                <div class="log-section">
                    <div class="log-section-title">🤖 ChatAI 意图解析 (${intent.elapsed_time?.toFixed(2) || '?'}s)</div>
                    <div class="log-content">${this.escapeHtml(JSON.stringify(intent.parsed_result || {}, null, 2))}</div>
                </div>
                ` : intent.error ? `
                <div class="log-section">
                    <div class="log-section-title">🤖 ChatAI 意图解析 - 错误</div>
                    <div class="log-content" style="color: var(--danger)">${this.escapeHtml(intent.error)}</div>
                </div>
                ` : ''}

                ${code.success ? `
                <div class="log-section">
                    <div class="log-section-title">💻 CodeAI 代码生成 (${code.elapsed_time?.toFixed(2) || '?'}s)${code.patch_mode ? ` · ${code.patch_mode}` : ''}${code.patch_operations != null ? ` · ${code.patch_operations}项操作` : (code.diff_operations != null ? ` · ${code.diff_operations}项差异` : '')}</div>
                    <div class="log-content log-json">${this.renderCodeDiff(code)}</div>
                </div>
                ` : code.error ? `
                <div class="log-section">
                    <div class="log-section-title">💻 CodeAI 代码生成 - 错误</div>
                    <div class="log-content" style="color: var(--danger)">${this.escapeHtml(code.error)}</div>
                </div>
                ` : ''}

                ${code.validation ? (code.validation.success ? `
                <div class="log-section">
                    <div class="log-section-title">✅ 检查通过 (${code.validation.elapsed_time?.toFixed(2) || '?'}s)${code.validation.retry_count ? ` · 重试${code.validation.retry_count}次` : ''}</div>
                    ${code.validation.warnings?.length > 0 ? `
                    <div class="log-content" style="color: var(--warning)">
                        <strong>警告:</strong><br>
                        ${code.validation.warnings.map(w => this.escapeHtml(w)).join('<br>')}
                    </div>
                    ` : ''}
                </div>
                ` : `
                <div class="log-section">
                    <div class="log-section-title">⚠️ 检查失败 (${code.validation.elapsed_time?.toFixed(2) || '?'}s)${code.validation.retry_count ? ` · 重试${code.validation.retry_count}次` : ''}</div>
                    ${code.validation.errors?.length > 0 ? `
                    <div class="log-content" style="color: var(--danger)">
                        <strong>错误:</strong><br>
                        ${code.validation.errors.map(e => this.escapeHtml(e.message || e)).join('<br>')}
                    </div>
                    ` : ''}
                    ${code.validation.warnings?.length > 0 ? `
                    <div class="log-content" style="color: var(--warning)">
                        <strong>警告:</strong><br>
                        ${code.validation.warnings.map(w => this.escapeHtml(w)).join('<br>')}
                    </div>
                    ` : ''}
                </div>
                `) : ''}

                ${log.errors?.length > 0 ? `
                <div class="log-section">
                    <div class="log-section-title">⚠️ 错误</div>
                    <div class="log-content" style="color: var(--danger)">${log.errors.map(e => this.escapeHtml(e)).join('<br>')}</div>
                </div>
                ` : ''}

                <div class="log-section">
                    <div class="log-section-title">✅ 最终结果: ${final.type || 'unknown'}</div>
                    <div class="log-content">${this.escapeHtml(final.message || final.response || JSON.stringify(final, null, 2))}</div>
                </div>
            </div>
        `;
    },

    renderCodeDiff(code) {
        // 优先展示 patch 操作明细
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
        // 其次展示 diff 操作明细
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
        // D2 类 HTML 修改：展示区段名 + 内容摘要
        if (code.modified_sections_detail && typeof code.modified_sections_detail === 'object' && Object.keys(code.modified_sections_detail).length > 0) {
            return Object.entries(code.modified_sections_detail).map(([section, content]) => {
                let contentStr = typeof content === 'string' ? content : JSON.stringify(content);
                if (contentStr.length > 300) contentStr = contentStr.substring(0, 300) + '...';
                return `<span style="color: var(--neon-cyan)">[${this.escapeHtml(section)}]</span><br>${this.escapeHtml(contentStr)}`;
            }).join('<br><br>');
        }
        // 无代码修改片段
        if (code.patch_apply_error) return `<span style="color: var(--danger)">Patch应用失败: ${this.escapeHtml(code.patch_apply_error)}</span>`;
        if (code.diff_apply_error) return `<span style="color: var(--danger)">Diff应用失败: ${this.escapeHtml(code.diff_apply_error)}</span>`;
        if (code.parse_error) return `<span style="color: var(--danger)">${this.escapeHtml(code.parse_error)}</span>`;
        // Fallback: 如果有 raw_output 但没有 detail，显示截断的原始输出
        if (code.raw_output) {
            let raw = code.raw_output;
            if (raw.length > 500) raw = raw.substring(0, 500) + '...';
            return `<span style="color: var(--text-light); opacity: 0.7">${this.escapeHtml(raw)}</span>`;
        }
        return '<span style="color: var(--text-light); opacity: 0.5">无代码修改片段</span>';
    },

    escapeHtml(text) {
        if (!text) return '';
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    },

    async clearLogs() {
        if (!confirm('确定要清空所有日志吗？')) return;

        try {
            const resp = await fetch('/api/clear_logs', { method: 'POST' });
            const data = await resp.json();
            if (data.success) {
                await this.refreshLogs();
            }
        } catch (e) {
            console.error('清空日志失败:', e);
        }
    },

    // ═══════════════════════════════════════════════════════════════
    // UI 辅助方法
    // ═══════════════════════════════════════════════════════════════
    addMessage(text, type = 'info') {
        const container = document.getElementById('ai-messages');
        const msg = document.createElement('div');
        msg.className = `message ${type}`;
        msg.textContent = text;
        container.appendChild(msg);
        container.scrollTop = container.scrollHeight;

        // 限制消息数量
        while (container.children.length > 50) {
            container.removeChild(container.firstChild);
        }
    },

    updateTurnIndicator() {
        const indicator = document.getElementById('turn-indicator');
        const turn = this.boardState?.current_turn;
        const state = this.boardState?.game_status;

        if (state?.state === 'ended') {
            const winner = state.winner === 'red' ? '红方' : '黑方';
            indicator.textContent = `${winner}获胜!`;
            indicator.style.background = 'var(--success)';
        } else {
            indicator.textContent = turn === 'red' ? '红方回合' : '黑方回合';
            indicator.style.background = turn === 'red' ? '#8B0000' : '#333';
        }
    },

    updateActiveRules() {
        const container = document.getElementById('active-rules');
        const rules = this.boardState?.game_status?.custom_rules_active || [];

        if (rules.length === 0) {
            container.innerHTML = '<span class="empty">暂无自定义规则</span>';
        } else {
            container.innerHTML = rules.map(r => `<div class="rule-item">✨ ${r}</div>`).join('');
        }
    },

    updateGameObjectives() {
        const container = document.getElementById('game-objectives');
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
    },

    // ═══════════════════════════════════════════════════════════════
    // AI 性格显示
    // ═══════════════════════════════════════════════════════════════

    _personalityInfo: {
        normal:     { icon: '🧠', name: '标准型', subtitle: 'Normal',    desc: '攻守平衡的标准AI',          agg: 0.5, def: 0.5 },
        aggressive: { icon: '⚔️', name: '激进型', subtitle: 'Aggressive', desc: '进攻至上，全力出击',        agg: 0.9, def: 0.2 },
        defensive:  { icon: '🛡️', name: '保守型', subtitle: 'Defensive',  desc: '稳扎稳打，防守反击',        agg: 0.2, def: 0.9 },
        random:     { icon: '🎲', name: '随机型', subtitle: 'Random',     desc: '天马行空，随心所欲',        agg: 0.5, def: 0.5 },
        custom:     { icon: '✨', name: '自定义', subtitle: 'Custom',     desc: '独一无二的神秘风格',        agg: 0.5, def: 0.5 },
    },

    updateAIPersonality() {
        const card = document.getElementById('ai-personality');
        if (!card) return;

        const personality = this.configs?.rules?.ai_difficulty?.personality || {};
        const type = personality.type || 'normal';
        const info = this._personalityInfo[type] || this._personalityInfo.custom;

        // 应用类型样式
        card.className = `personality-card type-${type}`;

        // 更新内容
        document.getElementById('personality-icon').textContent = info.icon;
        document.getElementById('personality-type').textContent = info.name;
        document.getElementById('personality-subtitle').textContent = info.subtitle;
        document.getElementById('personality-desc').textContent = info.desc;

        // 计算进度条数值
        let agg = personality.aggressiveness ?? info.agg;
        let def = personality.conservatism ?? info.def;
        if (type === 'custom') {
            agg = personality.aggressiveness ?? 0.5;
            def = personality.conservatism ?? 0.5;
        }

        const totalBars = 10;
        const aggBars = Math.round(agg * totalBars);
        const defBars = Math.round(def * totalBars);

        document.getElementById('bar-agg').textContent = '█'.repeat(aggBars) + '░'.repeat(totalBars - aggBars);
        document.getElementById('bar-def').textContent = '█'.repeat(defBars) + '░'.repeat(totalBars - defBars);
        document.getElementById('bar-agg-pct').textContent = `${Math.round(agg * 100)}%`;
        document.getElementById('bar-def-pct').textContent = `${Math.round(def * 100)}%`;
    },

    triggerPersonalityChangeAnimation() {
        const card = document.getElementById('ai-personality');
        if (!card) return;
        card.classList.remove('personality-changed');
        void card.offsetWidth;
        card.classList.add('personality-changed');
    },

    // ═══════════════════════════════════════════════════════════════
    // 游戏机制显示
    // ═══════════════════════════════════════════════════════════════

    _mechanismMeta: {
        skip_turns:  { icon: '⏸️',  label: '冻结',     type: 'skip',   unit: '回合' },
        ai_control:  { icon: '🤖',  label: 'AI接管',   type: 'ai',     unit: '回合' },
        random_moves:{ icon: '🎲',  label: '随机走棋', type: 'random', unit: '步'   },
        extra_turns: { icon: '⚡',  label: '额外回合', type: 'extra',  unit: '回合' },
        move_limits: { icon: '🚶',  label: '多步行走', type: 'limit',  unit: '步'   },
    },

    updateMechanisms() {
        const container = document.getElementById('active-mechanisms');
        if (!container) return;

        const mechanisms = this.boardState?.mechanisms || {};
        const items = [];

        for (const [key, meta] of Object.entries(this._mechanismMeta)) {
            const list = mechanisms[key] || [];
            for (const item of list) {
                const sideLabel = item.side === 'red' ? '红方' : '黑方';
                const remaining = item.remaining ?? item.limit ?? 0;
                const reason = item.reason ? ` — ${item.reason}` : '';
                const isInfinite = remaining < 0;
                const isActive = remaining !== 0;
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
                    ${item.canStop ? `<button class="mechanism-stop" onclick="App.stopMechanism('${item.mechanismKey}', '${item.side}')">截停</button>` : ''}
                </div>
            `).join('');
        }

        // 更新棋盘冻结效果
        const boardContainer = document.getElementById('board-container');
        const hasFreeze = (mechanisms.skip_turns || []).length > 0;
        boardContainer.classList.toggle('freeze-effect', hasFreeze);

        // 更新回合指示器AI接管效果
        const turnIndicator = document.getElementById('turn-indicator');
        const currentTurn = this.boardState?.current_turn;
        const hasAIControl = (mechanisms.ai_control || []).some(m => m.side === currentTurn);
        turnIndicator.classList.toggle('ai-control', hasAIControl);
    },

    async stopMechanism(mechanismType, side) {
        try {
            const resp = await fetch('/api/stop_mechanism', {
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
    },

    async refreshMechanisms() {
        try {
            const resp = await fetch('/api/mechanisms');
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
    },

    showGameOver() {
        const state = this.boardState?.game_status;
        if (!state || state.state !== 'ended') return;

        const winner = state.winner === 'red' ? '红方' : '黑方';
        const container = document.getElementById('board-container');

        // 移除已有遮罩
        const existing = container.querySelector('.game-over-overlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.className = 'game-over-overlay';
        overlay.innerHTML = `
            <h2>🎮 游戏结束</h2>
            <p>${winner} 获胜！</p>
            <button class="btn-primary" onclick="App.restart()">再来一局</button>
        `;
        container.appendChild(overlay);
    },

    async restart() {
        const overlay = document.querySelector('.game-over-overlay');
        if (overlay) overlay.remove();

        const resp = await fetch('/api/restart', { method: 'POST' });
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
            this.addMessage('🔄 游戏已重新开始', 'info');
        }
    },

    getPieceName(pieceId) {
        const piece = this.boardState?.pieces?.find(p => p.id === pieceId);
        return piece ? piece.name : pieceId;
    },

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    // ═══════════════════════════════════════════════════════════════
    // 设置
    // ═══════════════════════════════════════════════════════════════
    async checkApiKey() {
        const resp = await fetch('/api/apikey/status');
        const data = await resp.json();
        if (!data.has_key) {
            this.showSettings();
            this.addMessage('⚠️ 请先设置DeepSeek API Key', 'error');
        }
    },

    showSettings() {
        document.getElementById('settings-modal').classList.add('show');
    },

    hideSettings() {
        document.getElementById('settings-modal').classList.remove('show');
    },

    async saveSettings() {
        const apiKey = document.getElementById('api-key-input').value;
        const difficulty = document.getElementById('difficulty-select').value;

        if (apiKey) {
            const resp = await fetch('/api/apikey', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ api_key: apiKey })
            });
            const data = await resp.json();
            if (data.success) {
                this.addMessage('✅ API Key已设置', 'success');
            }
        }

        const resp2 = await fetch('/api/difficulty', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ difficulty: difficulty })
        });
        const data2 = await resp2.json();
        if (data2.success) {
            this.addMessage(`✅ 难度已设置为: ${difficulty}`, 'success');
        }

        this.hideSettings();
    },

    // ═══════════════════════════════════════════════════════════════
    // 事件绑定
    // ═══════════════════════════════════════════════════════════════
    bindEvents() {
        // 输入框
        const input = document.getElementById('command-input');
        const sendBtn = document.getElementById('btn-send');

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

        // 设置按钮
        document.getElementById('btn-settings').addEventListener('click', () => {
            this.showSettings();
        });
        document.getElementById('save-settings').addEventListener('click', () => {
            this.saveSettings();
        });
        document.getElementById('close-settings').addEventListener('click', () => {
            this.hideSettings();
        });

        // 悔棋
        document.getElementById('btn-undo').addEventListener('click', async () => {
            const resp = await fetch('/api/undo', { method: 'POST' });
            const data = await resp.json();
            if (data.success) {
                this.boardState = data.board_state;
                this.lastMove = this.boardState.move_history.slice(-1)[0] || null;
                this.clearSelection();
                this.renderPieces();
                this.updateTurnIndicator();
                this.updateGameObjectives();
                this.addMessage(data.message, 'success');
            } else {
                this.addMessage(data.message, 'error');
            }
        });

        // 撤回AI修改
        document.getElementById('btn-undo-config').addEventListener('click', async () => {
            const resp = await fetch('/api/undo_config', { method: 'POST' });
            const data = await resp.json();
            if (data.success) {
                await this.loadConfigs();
                this.renderBoard();
                this.renderPieces();
                this.updateTurnIndicator();
                this.updateActiveRules();
                this.updateGameObjectives();
                this.updateAIPersonality();
                this.updateMechanisms();
                this.addMessage(data.message, 'success');
            } else {
                this.addMessage(data.message, 'error');
            }
        });

        // 重新开始
        document.getElementById('btn-restart').addEventListener('click', () => {
            this.restart();
        });

        // 重置所有配置
        document.getElementById('btn-reset-configs').addEventListener('click', async () => {
            if (!confirm('确定要重置所有配置吗？所有自定义规则将被清除。')) return;
            const resp = await fetch('/api/reset_configs', { method: 'POST' });
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
                this.addMessage('✅ 所有配置已重置', 'success');
            }
        });

        // 查看日志
        document.getElementById('btn-logs').addEventListener('click', () => {
            this.showLogs();
        });
        document.getElementById('close-logs').addEventListener('click', () => {
            this.hideLogs();
        });
        document.getElementById('btn-refresh-logs').addEventListener('click', () => {
            this.refreshLogs();
        });
        document.getElementById('btn-clear-logs').addEventListener('click', () => {
            this.clearLogs();
        });

        // 选坐标按钮
        document.getElementById('btn-insert-coord').addEventListener('click', () => {
            this.toggleCoordInsertMode();
        });

        // 切换选坐标/选区域模式
        document.getElementById('btn-toggle-coord-mode').addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleSelectMode();
        });

        // ESC 键退出坐标插入模式
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.coordInsertMode) {
                this.exitCoordInsertMode();
            }
        });

        // 点击棋盘空白处 - 检查是否点击了合法移动位置
        document.getElementById('board-container').addEventListener('click', (e) => {
            // 坐标插入模式下，点击空白区域不响应（只有绿点才有效）
            if (this.coordInsertMode) {
                return;
            }

            // 如果点击的是棋子或合法移动指示器，不处理（它们会stopPropagation）
            // 这里处理的是真正的空白位置
            if (this.selectedPiece && this.validMoves.length > 0) {
                const [gridX, gridY] = this._getGridCoordsFromEvent(e);
                if (gridX === null) return;

                // 检查是否是合法移动
                const isValidMove = this.validMoves.some(m => m[0] === gridX && m[1] === gridY);
                if (isValidMove) {
                    this.executeMove(this.selectedPiece.id, [gridX, gridY]);
                    return;
                }
            }
            // 否则取消选择
            this.clearSelection();
        });
    },

    _getGridCoordsFromEvent(e) {
        const container = document.getElementById('board-container');
        const rect = container.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const geometry = this.configs.board?.geometry || {};
        const width = geometry.width || 9;
        const height = geometry.height || 10;

        const boardX = (x / rect.width - 0.05) / 0.9 * (width - 1);
        const boardY = (y / rect.height - 0.05) / 0.9 * (height - 1);

        const gridX = Math.round(boardX);
        const gridY = Math.round(boardY);

        if (gridX < 0 || gridX >= width || gridY < 0 || gridY >= height) {
            return [null, null];
        }
        return [gridX, gridY];
    },

    toggleCoordInsertMode() {
        if (this.coordInsertMode) {
            this.exitCoordInsertMode();
        } else {
            this.enterCoordInsertMode();
        }
    },

    enterCoordInsertMode() {
        this.coordInsertMode = true;
        this.regionPoints = [];
        document.getElementById('btn-insert-coord').classList.add('active');
        document.getElementById('board-container').classList.add('coord-insert-mode');
        this.updateCoordButtonText();
        this.showCoordDots();
    },

    exitCoordInsertMode() {
        this.coordInsertMode = false;
        this.regionPoints = [];
        const btn = document.getElementById('btn-insert-coord');
        if (btn) btn.classList.remove('active');
        const board = document.getElementById('board-container');
        if (board) board.classList.remove('coord-insert-mode');
        this.hideCoordDots();
        this.clearRegionSelection();
    },

    updateCoordButtonText() {
        const btn = document.getElementById('btn-insert-coord');
        if (!btn) return;
        if (this.selectMode === 'region') {
            btn.innerHTML = '🔲 选区域';
        } else {
            btn.innerHTML = '📍 选坐标';
        }
    },

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
    },

    showCoordDots() {
        this.hideCoordDots();
        const svg = document.querySelector('#board-container svg.board-grid');
        if (!svg) return;

        const geometry = this.configs.board?.geometry || {};
        const width = geometry.width || 9;
        const height = geometry.height || 10;

        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('id', 'coord-dots-group');
        g.style.pointerEvents = 'all';

        for (let x = 0; x < width; x++) {
            for (let y = 0; y < height; y++) {
                const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                dot.setAttribute('class', 'coord-dot');
                dot.setAttribute('cx', x);
                dot.setAttribute('cy', y);
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
    },

    hideCoordDots() {
        this.coordDots.forEach(dot => dot.remove());
        this.coordDots = [];
    },

    onCoordDotClick(x, y) {
        if (this.selectMode === 'coord') {
            this.insertCoordToInput(x, y);
            this.exitCoordInsertMode();
        } else if (this.selectMode === 'region') {
            this.onRegionPointClick(x, y);
        }
    },

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
    },

    updateRegionVisual() {
        this.clearRegionVisual();
        if (this.regionPoints.length === 0) return;

        const svg = document.querySelector('#board-container svg.board-grid');
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
    },

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
    },

    clearRegionSelection() {
        this.clearRegionVisual();
        this.regionPoints = [];
    },

    insertCoordToInput(x, y) {
        const input = document.getElementById('command-input');
        const coordStr = `[${x}, ${y}]`;

        const start = input.selectionStart;
        const end = input.selectionEnd;
        const value = input.value;

        input.value = value.substring(0, start) + coordStr + value.substring(end);
        const newPos = start + coordStr.length;
        input.setSelectionRange(newPos, newPos);
        input.focus();
    },

    insertRegionToInput() {
        if (this.regionPoints.length < 2) return;
        const [p1, p2] = this.regionPoints;
        const minX = Math.min(p1[0], p2[0]);
        const maxX = Math.max(p1[0], p2[0]);
        const minY = Math.min(p1[1], p2[1]);
        const maxY = Math.max(p1[1], p2[1]);

        const input = document.getElementById('command-input');
        const regionStr = `[${minX}, ${minY}]-[${maxX}, ${maxY}]`;

        const start = input.selectionStart;
        const end = input.selectionEnd;
        const value = input.value;

        input.value = value.substring(0, start) + regionStr + value.substring(end);
        const newPos = start + regionStr.length;
        input.setSelectionRange(newPos, newPos);
        input.focus();
    },
};

// 启动
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
