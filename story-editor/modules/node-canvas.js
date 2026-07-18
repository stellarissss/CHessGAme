/* ═══════════════════════════════════════════════════════════════
   Node Canvas - 节点画布（拖拽 + 连线）
   ═══════════════════════════════════════════════════════════════ */

const NodeCanvas = (() => {

    let canvas = null;
    let nodesContainer = null;
    let svgLayer = null;
    let app = null;
    let typeMenu = null;

    // 拖拽状态
    let dragging = null; // { nodeId, offsetX, offsetY }
    let connecting = null; // { fromNodeId, fromPort, tempLine }

    function init(appRef) {
        app = appRef;
        canvas = document.getElementById('node-canvas');
        nodesContainer = document.getElementById('nodes-container');
        svgLayer = document.getElementById('node-connections');
        typeMenu = document.getElementById('node-type-menu');

        // 构建节点类型菜单
        buildTypeMenu();

        // 添加节点按钮
        document.getElementById('btn-add-node').addEventListener('click', (e) => {
            e.stopPropagation();
            typeMenu.classList.toggle('show');
        });

        // 点击空白处关闭菜单
        document.addEventListener('click', () => {
            typeMenu.classList.remove('show');
        });
        typeMenu.addEventListener('click', (e) => e.stopPropagation());

        // 删除节点按钮
        document.getElementById('btn-delete-node').addEventListener('click', () => {
            if (app.state.selectedNodeId) {
                deleteNode(app.state.selectedNodeId);
            }
        });

        // 预览当前场景
        document.getElementById('btn-preview-scene').addEventListener('click', () => {
            const scene = app.getCurrentScene();
            if (scene) {
                Preview.playScene(scene, {
                    characters: app.state.story.characters,
                    backgrounds: app.state.story.backgrounds,
                    variables: { ...app.state.story.variables }
                });
            }
        });

        // 画布点击空白处取消选中
        canvas.addEventListener('click', (e) => {
            if (e.target === canvas || e.target === nodesContainer) {
                app.selectNode(null);
            }
        });

        // 全局鼠标事件
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);

        // Delete 键删除选中节点
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Delete' || e.key === 'Backspace') {
                const tag = document.activeElement?.tagName;
                if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
                if (app.state.selectedNodeId) {
                    e.preventDefault();
                    deleteNode(app.state.selectedNodeId);
                }
            }
        });
    }

    function buildTypeMenu() {
        typeMenu.innerHTML = '';
        for (const [type, def] of Object.entries(StorySchema.NODE_TYPES)) {
            const item = document.createElement('div');
            item.className = 'node-type-item';
            item.innerHTML = `
                <span class="type-icon">${def.icon}</span>
                <span class="type-name">${def.label}</span>
            `;
            item.title = def.description;
            item.addEventListener('click', () => {
                addNode(type);
                typeMenu.classList.remove('show');
            });
            typeMenu.appendChild(item);
        }
    }

    function addNode(type) {
        const scene = app.getCurrentScene();
        if (!scene) return;

        const node = StorySchema.createNode(type);
        // 放在画布中心附近
        const scrollLeft = canvas.scrollLeft;
        const scrollTop = canvas.scrollTop;
        const centerX = scrollLeft + canvas.clientWidth / 2 - 90;
        const centerY = scrollTop + canvas.clientHeight / 2 - 40;
        node.x = centerX;
        node.y = centerY;

        // 如果有选中节点，连到新节点
        if (app.state.selectedNodeId) {
            const selectedNode = scene.nodes.find(n => n.id === app.state.selectedNodeId);
            if (selectedNode && selectedNode.data && 'next' in selectedNode.data && !selectedNode.data.next) {
                selectedNode.data.next = node.id;
            }
        }

        scene.nodes.push(node);
        app.selectNode(node.id);
        app.render();
        app.markDirty();
    }

    function deleteNode(nodeId) {
        const scene = app.getCurrentScene();
        if (!scene) return;

        const idx = scene.nodes.findIndex(n => n.id === nodeId);
        if (idx < 0) return;

        // 移除所有指向此节点的连线
        for (const node of scene.nodes) {
            if (node.data && 'next' in node.data && node.data.next === nodeId) {
                node.data.next = null;
            }
            if (node.type === 'condition') {
                if (node.data.true_next === nodeId) node.data.true_next = null;
                if (node.data.false_next === nodeId) node.data.false_next = null;
            }
            if (node.type === 'choice') {
                for (const opt of node.data.options || []) {
                    if (opt.next_node_id === nodeId) opt.next_node_id = null;
                }
            }
        }

        scene.nodes.splice(idx, 1);

        if (app.state.selectedNodeId === nodeId) {
            app.selectNode(null);
        }
        app.render();
        app.markDirty();
    }

    function render() {
        if (!nodesContainer) return;
        const scene = app.getCurrentScene();
        if (!scene) return;

        nodesContainer.innerHTML = '';
        svgLayer.innerHTML = '';

        for (const node of scene.nodes) {
            renderNode(node, scene);
        }

        // 绘制连线
        renderConnections(scene);

        // 更新底部信息
        document.getElementById('scene-info').textContent = `场景: ${scene.name}`;
        document.getElementById('node-count').textContent = `${scene.nodes.length} 个节点`;
    }

    function renderNode(node, scene) {
        const def = StorySchema.NODE_TYPES[node.type] || { icon: '?', label: node.type, color: '#888' };

        const el = document.createElement('div');
        el.className = 'story-node' + (node.id === app.state.selectedNodeId ? ' selected' : '');
        el.id = 'node-' + node.id;
        el.style.left = (node.x || 100) + 'px';
        el.style.top = (node.y || 100) + 'px';
        el.style.borderColor = def.color;

        // 头部
        const header = document.createElement('div');
        header.className = 'node-header';
        header.style.borderColor = def.color + '40';
        header.innerHTML = `
            <span class="node-icon">${def.icon}</span>
            <span class="node-type-label">${def.label}</span>
            <span class="node-delete" title="删除">×</span>
        `;
        header.querySelector('.node-delete').addEventListener('click', (e) => {
            e.stopPropagation();
            deleteNode(node.id);
        });

        // 主体
        const body = document.createElement('div');
        body.className = 'node-body';
        body.innerHTML = getNodePreview(node);

        el.appendChild(header);
        el.appendChild(body);

        // 输入端口
        if (node.type !== 'end') {
            const inPort = document.createElement('div');
            inPort.className = 'node-port in';
            inPort.dataset.nodeId = node.id;
            inPort.dataset.port = 'in';
            inPort.addEventListener('mousedown', (e) => {
                e.stopPropagation();
            });
            inPort.addEventListener('mouseup', (e) => {
                e.stopPropagation();
                if (connecting && connecting.fromNodeId !== node.id) {
                    setConnectionTarget(connecting.fromNodeId, connecting.fromPort, node.id);
                }
            });
            el.appendChild(inPort);
        }

        // 输出端口
        const outPorts = getOutputPorts(node);
        for (const port of outPorts) {
            const outPort = document.createElement('div');
            outPort.className = 'node-port out';
            outPort.dataset.nodeId = node.id;
            outPort.dataset.port = port.key;
            outPort.style.top = port.y + 'px';
            outPort.title = port.label;
            outPort.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                startConnecting(node.id, port.key, e);
            });
            el.appendChild(outPort);
        }

        // 拖拽
        el.addEventListener('mousedown', (e) => {
            if (e.target.closest('.node-port') || e.target.closest('.node-delete')) return;
            e.preventDefault();
            startDrag(node.id, e);
        });

        // 选中
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            app.selectNode(node.id);
        });

        nodesContainer.appendChild(el);
    }

    function getOutputPorts(node) {
        const ports = [];
        if (node.type === 'condition') {
            ports.push({ key: 'true_next', label: 'true', y: 30 });
            ports.push({ key: 'false_next', label: 'false', y: 50 });
        } else if (node.type === 'choice') {
            return []; // choice 有多个选项，不显示标准输出口
        } else if (node.type === 'end') {
            return []; // 结局无输出
        } else {
            ports.push({ key: 'next', label: 'next', y: 40 });
        }
        return ports;
    }

    function getNodePreview(node) {
        const d = node.data;
        switch (node.type) {
            case 'dialogue':
                const charName = getCharName(d.character_id);
                return `<strong>${charName || '(角色)'}</strong>: ${escapeHtml(d.text || '对话内容...')}`;
            case 'narration':
                return `<em>${escapeHtml(d.text || '旁白文本...')}</em>`;
            case 'choice':
                const opts = (d.options || []).map((o, i) => `${i + 1}. ${escapeHtml(o.text || '选项')}`).join('<br>');
                return opts || '<em>暂无选项</em>';
            case 'jump':
                return `跳转到: <strong>${d.target_scene_id ? getSceneName(d.target_scene_id) : '未设置'}</strong>`;
            case 'condition':
                return `若 <code>${escapeHtml(d.variable || 'var')}</code> ${d.operator} <code>${escapeHtml(String(d.value))}</code>`;
            case 'set_var':
                return `${d.operation}: <code>${escapeHtml(d.variable || 'var')}</code> = <code>${escapeHtml(String(d.value))}</code>`;
            case 'bg':
                return `背景: <strong>${d.bg_id || '未设置'}</strong> (${d.transition})`;
            case 'show_char':
                return `显示: <strong>${getCharName(d.character_id) || '角色'}</strong> @ ${d.position}`;
            case 'hide_char':
                return `隐藏: <strong>${getCharName(d.character_id) || '角色'}</strong>`;
            case 'wait':
                return `等待: <strong>${d.duration_ms}ms</strong>`;
            case 'effect':
                return `特效: <strong>${d.effect_type}</strong>`;
            case 'sound':
                return `${d.action}: <strong>${d.sound_id || '音效'}</strong>`;
            case 'end':
                return `结局: <strong>${d.ending_type}</strong><br>${escapeHtml(d.text || '')}`;
            default:
                return node.type;
        }
    }

    function getCharName(id) {
        if (!id) return '';
        const c = app.state.story.characters.find(ch => ch.id === id);
        return c ? c.name : id;
    }

    function getSceneName(id) {
        if (!id) return '';
        const s = app.state.story.scenes.find(sc => sc.id === id);
        return s ? s.name : id;
    }

    function escapeHtml(s) {
        const div = document.createElement('div');
        div.textContent = s;
        return div.innerHTML;
    }

    // ──────────────────────────────────────────────────────────
    // 拖拽
    // ──────────────────────────────────────────────────────────
    function startDrag(nodeId, e) {
        const el = document.getElementById('node-' + nodeId);
        const rect = el.getBoundingClientRect();
        const containerRect = nodesContainer.getBoundingClientRect();
        dragging = {
            nodeId,
            offsetX: e.clientX - rect.left,
            offsetY: e.clientY - rect.top
        };
        app.selectNode(nodeId);
    }

    function onMouseMove(e) {
        if (dragging) {
            const containerRect = nodesContainer.getBoundingClientRect();
            const node = app.getCurrentScene()?.nodes.find(n => n.id === dragging.nodeId);
            if (node) {
                node.x = Math.max(0, e.clientX - containerRect.left - dragging.offsetX);
                node.y = Math.max(0, e.clientY - containerRect.top - dragging.offsetY);
                const el = document.getElementById('node-' + dragging.nodeId);
                if (el) {
                    el.style.left = node.x + 'px';
                    el.style.top = node.y + 'px';
                }
                // 重绘连线
                renderConnections(app.getCurrentScene());
            }
        }

        if (connecting) {
            // 画临时连线
            updateTempConnection(e);
        }
    }

    function onMouseUp() {
        if (dragging) {
            dragging = null;
            app.markDirty();
        }
        if (connecting) {
            // 没连到端口则取消
            if (connecting.tempLine) {
                connecting.tempLine.remove();
            }
            connecting = null;
        }
    }

    // ──────────────────────────────────────────────────────────
    // 连线
    // ──────────────────────────────────────────────────────────
    function startConnecting(fromNodeId, fromPort, e) {
        connecting = { fromNodeId, fromPort, tempLine: null };
        // 创建临时线
        const tempLine = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        tempLine.setAttribute('class', 'connection-path');
        tempLine.style.stroke = 'var(--accent-cyan)';
        svgLayer.appendChild(tempLine);
        connecting.tempLine = tempLine;
    }

    function updateTempConnection(e) {
        if (!connecting || !connecting.tempLine) return;
        const fromEl = document.getElementById('node-' + connecting.fromNodeId);
        if (!fromEl) return;
        const portEl = fromEl.querySelector(`.node-port.out[data-port="${connecting.fromPort}"]`);
        if (!portEl) return;

        const svgRect = svgLayer.getBoundingClientRect();
        const portRect = portEl.getBoundingClientRect();
        const x1 = portRect.left + portRect.width / 2 - svgRect.left;
        const y1 = portRect.top + portRect.height / 2 - svgRect.top;
        const x2 = e.clientX - svgRect.left;
        const y2 = e.clientY - svgRect.top;

        const path = bezierPath(x1, y1, x2, y2);
        connecting.tempLine.setAttribute('d', path);
    }

    function setConnectionTarget(fromNodeId, fromPort, toNodeId) {
        const scene = app.getCurrentScene();
        if (!scene) return;
        const fromNode = scene.nodes.find(n => n.id === fromNodeId);
        if (!fromNode) return;

        if (fromPort === 'next') {
            fromNode.data.next = toNodeId;
        } else if (fromPort === 'true_next') {
            fromNode.data.true_next = toNodeId;
        } else if (fromPort === 'false_next') {
            fromNode.data.false_next = toNodeId;
        }

        app.render();
        app.markDirty();
    }

    function renderConnections(scene) {
        // 清除现有连线（保留临时线）
        const existing = svgLayer.querySelectorAll('.connection-path:not([temp])');
        existing.forEach(el => el.remove());

        for (const node of scene.nodes) {
            drawNodeConnections(node, scene);
        }
    }

    function drawNodeConnections(node, scene) {
        const outputs = [];

        if (node.data && 'next' in node.data && node.data.next) {
            outputs.push({ fromKey: 'next', targetId: node.data.next });
        }
        if (node.type === 'condition') {
            if (node.data.true_next) outputs.push({ fromKey: 'true_next', targetId: node.data.true_next });
            if (node.data.false_next) outputs.push({ fromKey: 'false_next', targetId: node.data.false_next });
        }
        if (node.type === 'choice') {
            // 选项的连线在 inspector 中管理，这里简化不画
            return;
        }

        const fromEl = document.getElementById('node-' + node.id);
        if (!fromEl) return;

        const svgRect = svgLayer.getBoundingClientRect();

        for (const output of outputs) {
            const targetNode = scene.nodes.find(n => n.id === output.targetId);
            if (!targetNode) continue;
            const toEl = document.getElementById('node-' + output.targetId);
            if (!toEl) continue;

            const fromPortEl = fromEl.querySelector(`.node-port.out[data-port="${output.fromKey}"]`);
            const toPortEl = toEl.querySelector('.node-port.in');
            if (!fromPortEl || !toPortEl) continue;

            const fromRect = fromPortEl.getBoundingClientRect();
            const toRect = toPortEl.getBoundingClientRect();

            const x1 = fromRect.left + fromRect.width / 2 - svgRect.left;
            const y1 = fromRect.top + fromRect.height / 2 - svgRect.top;
            const x2 = toRect.left + toRect.width / 2 - svgRect.left;
            const y2 = toRect.top + toRect.height / 2 - svgRect.top;

            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('class', 'connection-path');
            path.setAttribute('d', bezierPath(x1, y1, x2, y2));
            path.style.stroke = output.fromKey === 'true_next' ? 'var(--accent-green)'
                : output.fromKey === 'false_next' ? 'var(--accent-red)' : '';
            svgLayer.appendChild(path);
        }
    }

    function bezierPath(x1, y1, x2, y2) {
        const dx = Math.abs(x2 - x1) * 0.5;
        return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
    }

    return { init, render, addNode, deleteNode };

})();
