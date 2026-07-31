
    async loadConfigs() {
        const resp = await fetch(`${this.apiBase}/api/config/all`, { cache: 'no-store' });
        this.configs = await resp.json();
        this.boardState = this.configs.board_state;
        this.uiConfig = this.configs.ui_config;
        console.log('[DEBUG] loadConfigs - board.appearance:', this.configs.board?.appearance);
    },

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
    }

    renderBoard() {
        const container = this.shadowRoot.getElementById('board-container');
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
        this.style.setProperty('--board-bg', bgColor);

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
    }

    applyUiConfig() {
        const rotation = this.uiConfig?.layout?.rotation || 0;
        const container = this.shadowRoot.getElementById('board-container');
        if (container) {
            container.style.transform = `rotate(${rotation}deg)`;
            container.style.transition = 'transform 0.3s ease';
        }

        this.shadowRoot.querySelectorAll('.piece-text').forEach(el => {
            el.style.transform = `rotate(${-rotation}deg)`;
            el.style.transition = 'transform 0.3s ease';
        });

        const customStyleId = 'custom-ui-css';
        let styleEl = this.shadowRoot.getElementById(customStyleId);
        if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = customStyleId;
            this.shadowRoot.appendChild(styleEl);
        }
        styleEl.textContent = this.uiConfig?.custom_css || '';
    }

    renderPieces() {
        const container = this.shadowRoot.getElementById('board-container');
        container.querySelectorAll('.piece').forEach(el => el.remove());

        const piecesTheme = this.uiConfig?.theme?.pieces || {};
        const fontFamily = piecesTheme.font_family || "'KaiTi', serif";

        const pieces = this.boardState?.pieces || [];
        pieces.forEach(piece => {
            if (!piece.is_alive) return;
            this.createPieceElement(piece, piecesTheme, fontFamily);
        });

        if (this.lastMove) {
            const el = container.querySelector(`[data-piece-id="${this.lastMove.piece_id}"]`);
            if (el) el.classList.add('last-moved');
        }
    }

    createPieceElement(piece, theme, fontFamily) {
        const container = this.shadowRoot.getElementById('board-container');
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

        if (piece.side === 'red') {
            el.style.color = theme.red_color || '#cc0000';
            el.style.background = theme.red_bg || '#fff5e6';
            el.style.borderColor = theme.red_color || '#cc0000';
        } else {
            el.style.color = theme.black_color || '#1a1a1a';
            el.style.background = theme.black_bg || '#e6e6e6';
            el.style.borderColor = theme.black_color || '#1a1a1a';
        }

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
    }

    async onPieceClick(piece) {
        if (this.aiThinking) return;
        if (this.boardState?.game_status?.state === 'ended') return;

        if (this.selectedPiece && piece.side !== this.selectedPiece.side) {
            if (this.validMoves.some(m => m[0] === piece.position[0] && m[1] === piece.position[1])) {
                await this.executeMove(this.selectedPiece.id, piece.position);
                return;
            }
        }

        if (!this._isCurrentTurnPlayerControlled()) {
            if (this.selectedPiece) {
                this.clearSelection();
            }
            return;
        }

        if (piece.side !== this.boardState?.current_turn) {
            if (this.selectedPiece) {
                this.clearSelection();
            }
            return;
        }

        this.selectedPiece = piece;
        this.highlightPiece(piece);

        try {
            const resp = await fetch(`${this.apiBase}/api/valid_moves`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ piece_id: piece.id, to: piece.position })
            });
            const data = await resp.json();
            this.validMoves = data.moves || [];
            this.showValidMoves();
        } catch (e) {
            console.error('获取合法移动失败:', e);
            this._dispatchError('获取合法移动失败', e);
        }
    }

    highlightPiece(piece) {
        this.shadowRoot.querySelectorAll('.piece').forEach(el => {
            el.classList.remove('selected');
        });
        const el = this.shadowRoot.querySelector(`[data-piece-id="${piece.id}"]`);
        if (el) el.classList.add('selected');
    }

    showValidMoves() {
        this.clearValidMoves();
        const container = this.shadowRoot.getElementById('board-container');
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
            indicator.style.pointerEvents = 'auto';

            const highlight = this.uiConfig?.theme?.highlight;
            if (highlight?.valid_move) {
                indicator.style.background = highlight.valid_move;
            }

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
    }

    clearValidMoves() {
        this.shadowRoot.querySelectorAll('.valid-move-indicator').forEach(el => el.remove());
    }

    clearSelection() {
        this.selectedPiece = null;
        this.validMoves = [];
        this.shadowRoot.querySelectorAll('.piece').forEach(el => {
            el.classList.remove('selected');
        });
        this.clearValidMoves();
    }

    async executeMove(pieceId, toPosition) {
        this.clearSelection();
        this.shadowRoot.querySelectorAll('.piece').forEach(el => {
            el.classList.remove('ai-moved');
        });
        this.aiThinking = true;

        try {
            const resp = await fetch(`${this.apiBase}/api/move`, {
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

                this._dispatchMoveEvent();

                if (this.boardState.game_status.state === 'ended') {
                    this.showGameOver();
                    this._dispatchGameEndEvent();
                    this.aiThinking = false;
                    return;
                }

                await this.sleep(800);
                await this.makeAIMove();
            } else {
                this.addMessage(data.message || '移动失败', 'error');
                if (data.ai_controlled && !this.aiThinking) {
                    this.aiThinking = true;
                    await this.sleep(500);
                    await this.makeAIMove();
                    this.aiThinking = false;
                }
            }
        } catch (e) {
            this.addMessage(`网络错误: ${e.message}`, 'error');
            this._dispatchError('移动失败', e);
        }

        this.aiThinking = false;
    }

    async makeAIMove(depth = 0) {
        if (depth > 10) return;

        this.addMessage('AI思考中...', 'info');

        try {
            const resp = await fetch(`${this.apiBase}/api/ai_move`, {
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

                this.highlightAIMovedPiece(data.ai_move.piece_id);

                const messages = this.shadowRoot.getElementById('ai-messages');
                const lastMsg = messages.lastElementChild;
                if (lastMsg && lastMsg.textContent.includes('思考中')) {
                    lastMsg.remove();
                }

                if (data.ai_move?.captured) {
                    this.addMessage(`AI走了${this.getPieceName(data.ai_move.piece_id)}`, 'info');
                }

                this._dispatchMoveEvent();

                if (this.boardState.game_status.state === 'ended') {
                    this.showGameOver();
                    this._dispatchGameEndEvent();
                    return;
                }

                if (this._isCurrentTurnAITurn()) {
                    await this.sleep(600);
                    await this.makeAIMove(depth + 1);
                }
            } else {
                this.addMessage(data.message || 'AI移动失败', 'error');
            }
        } catch (e) {
            this.addMessage(`AI错误: ${e.message}`, 'error');
            this._dispatchError('AI移动失败', e);
        }
    }

    _dispatchMoveEvent() {
        const lastMove = this.boardState?.move_history?.slice(-1)[0];
        const gameStatus = this.boardState?.game_status || {};
        const mover = this.boardState?.current_turn === 'red' ? 'black' : 'red';

        this.dispatchEvent(new CustomEvent('move', {
            bubbles: true,
            composed: true,
            detail: {
                captured: lastMove?.captured || null,
                mover: mover,
                is_check: gameStatus.is_check || false,
                game_ended: gameStatus.state === 'ended',
                winner: gameStatus.winner || null,
                is_five_in_a_row: false,
                go_captures: 0
            }
        }));
    }

    _dispatchGameEndEvent() {
        const gameStatus = this.boardState?.game_status || {};
        this.dispatchEvent(new CustomEvent('gameend', {
            bubbles: true,
            composed: true,
            detail: {
                winner: gameStatus.winner || null,
                win_condition: gameStatus.win_condition || null
            }
        }));
    }

    _dispatchError(message, error) {
        this.dispatchEvent(new CustomEvent('error', {
            bubbles: true,
            composed: true,
            detail: { message, error: error?.message || error }
        }));
    }

    _isCurrentTurnAITurn() {
        const currentTurn = this.boardState?.current_turn || 'red';
        if (this._isCurrentTurnAIControlled()) return true;
        if (!this._isCurrentTurnPlayerControlled()) return true;
        return false;
    }

    _isCurrentTurnAIControlled() {
        const mechanisms = this.boardState?.mechanisms || {};
        const currentTurn = this.boardState?.current_turn || 'red';
        const aiControl = mechanisms.ai_control || [];
        return aiControl.some(item => item.side === currentTurn && item.remaining !== 0);
    }

    _isCurrentTurnPlayerControlled() {
        const currentTurn = this.boardState?.current_turn || 'red';
        const mechanisms = this.boardState?.mechanisms || {};
        const playerControl = mechanisms.player_control || [];

        if (!playerControl || playerControl.length === 0) {
            return currentTurn === this.playerSide;
        }

        for (const item of playerControl) {
            const side = item.side;
            if (side === 'both') return true;
            if (side === currentTurn) return true;
        }

        return false;
    }

    highlightAIMovedPiece(pieceId) {
        this.shadowRoot.querySelectorAll('.piece').forEach(el => {
            el.classList.remove('ai-moved');
        });
        const el = this.shadowRoot.querySelector(`[data-piece-id="${pieceId}"]`);
        if (el) {
            el.classList.add('ai-moved');
        }
    }

    async sendCommand(command) {
        if (!command.trim()) return;

        this.addMessage(`📝 你: ${command}`, 'user');

        this.showThinking('ChatAI 正在理解您的意图...', '意图解析');

        try {
            const resp = await fetch(`${this.apiBase}/api/command`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ command: command })
            });
            const data = await resp.json();

            this.hideThinking();

            if (data.success) {
                if (data.type === 'applied') {
                    this.addMessage(`✅ ${data.message}`, 'success');
                    if (data.refresh_page) {
                        await this.sleep(500);
                        window.location.reload();
                        return;
                    }
                    await this.loadConfigs();
                    this.renderBoard();
                    this.renderPieces();
                    this.updateTurnIndicator();
                    this.updateActiveRules();
                    this.updateGameObjectives();
                    this.updateAIPersonality();
                    this.updateMechanisms();
                    this.loadTokenStats();

                    if (data.classification === 'A') {
                        this.triggerPersonalityChangeAnimation();
                    }

                    const gameStatus = this.boardState?.game_status;
                    console.log('[DEBUG] sendCommand - game_status:', gameStatus);
                    if (gameStatus && gameStatus.state === 'ended') {
                        this._gameOverTimer = setTimeout(() => this.showGameOver(), 100);
                    }

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
            this._dispatchError('发送指令失败', e);
        }
    }

    showThinking(text, stage) {
        const overlay = this.shadowRoot.getElementById('thinking-overlay');
        const textEl = this.shadowRoot.getElementById('thinking-text');
        const stageEl = this.shadowRoot.getElementById('thinking-stage');

        textEl.textContent = text;
        stageEl.textContent = `阶段: ${stage}`;
        overlay.classList.add('show');

        this.shadowRoot.getElementById('board-container').classList.add('board-locked');
        this.shadowRoot.getElementById('input-section')?.classList.add('input-locked');
        this.shadowRoot.getElementById('command-input').disabled = true;

        this.pollThinkingStatus();
    }

    hideThinking() {
        const overlay = this.shadowRoot.getElementById('thinking-overlay');
        overlay.classList.remove('show');

        this.shadowRoot.getElementById('board-container').classList.remove('board-locked');
        this.shadowRoot.getElementById('input-section')?.classList.remove('input-locked');
        this.shadowRoot.getElementById('command-input').disabled = false;

        if (this.thinkingPollInterval) {
            clearInterval(this.thinkingPollInterval);
            this.thinkingPollInterval = null;
        }
    }

    async pollThinkingStatus() {
        this.thinkingPollInterval = setInterval(async () => {
            try {
                const resp = await fetch(`${this.apiBase}/api/thinking_status`);
                const data = await resp.json();

                if (data.thinking) {
                    const textEl = this.shadowRoot.getElementById('thinking-text');
                    const stageEl = this.shadowRoot.getElementById('thinking-stage');

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
    }

    async showLogs() {
        const modal = this.shadowRoot.getElementById('logs-modal');
        modal.classList.add('show');
        await this.refreshLogs();
    }

    hideLogs() {
        this.shadowRoot.getElementById('logs-modal').classList.remove('show');
    }

    async refreshLogs() {
        const container = this.shadowRoot.getElementById('logs-container');

        try {
            const resp = await fetch(`${this.apiBase}/api/logs?count=10`);
            const data = await resp.json();

            if (data.logs && data.logs.length > 0) {
                container.innerHTML = data.logs.map((log, index) => this.renderLogEntry(log, index)).join('');
            } else {
                container.innerHTML = '<div class="empty">暂无日志</div>';
            }
        } catch (e) {
            container.innerHTML = `<div class="error">加载日志失败: ${e.message}</div>`;
        }
    }

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
            const winner = state.winner === 'red' ? '红方' : '黑方';
            indicator.textContent = `${winner}获胜!`;
            indicator.style.background = 'var(--success)';
        } else {
            indicator.textContent = turn === 'red' ? '红方回合' : '黑方回合';
            indicator.style.background = turn === 'red' ? '#8B0000' : '#333';
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
                let sideLabel = item.side === 'red' ? '红方' : '黑方';
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

    showGameOver() {
        const state = this.boardState?.game_status;
        if (!state || state.state !== 'ended') return;

        const winner = state.winner === 'red' ? '红方' : '黑方';
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

        this.shadowRoot.getElementById('btn-undo-config').addEventListener('click', async () => {
            const resp = await fetch(`${this.apiBase}/api/undo_config`, { method: 'POST' });
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

            if (this.selectedPiece && this.validMoves.length > 0) {
                const [gridX, gridY] = this._getGridCoordsFromEvent(e);
                if (gridX === null) return;

                const isValidMove = this.validMoves.some(m => m[0] === gridX && m[1] === gridY);
                if (isValidMove) {
                    this.executeMove(this.selectedPiece.id, [gridX, gridY]);
                    return;
                }
            }
            this.clearSelection();
        });
    }

    _getGridCoordsFromEvent(e) {
        const container = this.shadowRoot.getElementById('board-container');
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

if (!customElements.get('xiangqi-board')) customElements.define('xiangqi-board', XiangqiBoard);
