/* ═══════════════════════════════════════════════════════════════
   Inspector - 属性检查器面板
   ═══════════════════════════════════════════════════════════════ */

const Inspector = (() => {

    let container = null;
    let typeLabel = null;
    let app = null;

    function init(appRef) {
        app = appRef;
        container = document.getElementById('inspector-content');
        typeLabel = document.getElementById('inspector-type');
    }

    function render() {
        const node = app.getSelectedNode();
        if (!node) {
            typeLabel.textContent = '未选中';
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">🖱️</div>
                    <p>选择一个节点以编辑属性</p>
                </div>
            `;
            return;
        }

        const def = StorySchema.NODE_TYPES[node.type];
        typeLabel.textContent = def ? def.label : node.type;
        typeLabel.style.color = def ? def.color : '';

        container.innerHTML = '';

        // 节点ID（只读）
        addField(container, '节点 ID', node.id, { readonly: true });

        switch (node.type) {
            case 'dialogue': renderDialogue(node); break;
            case 'narration': renderNarration(node); break;
            case 'choice': renderChoice(node); break;
            case 'jump': renderJump(node); break;
            case 'condition': renderCondition(node); break;
            case 'set_var': renderSetVar(node); break;
            case 'bg': renderBg(node); break;
            case 'show_char': renderShowChar(node); break;
            case 'hide_char': renderHideChar(node); break;
            case 'wait': renderWait(node); break;
            case 'effect': renderEffect(node); break;
            case 'sound': renderSound(node); break;
            case 'end': renderEnd(node); break;
            default:
                container.innerHTML += `<p>未知节点类型: ${node.type}</p>`;
        }
    }

    // ──────────────────────────────────────────────────────
    // 各类型节点渲染
    // ──────────────────────────────────────────────────────

    function renderDialogue(node) {
        addSection(container, '对话内容');

        addSelect(container, '角色', node.data.character_id, getCharacterOptions(), (val) => {
            node.data.character_id = val;
            onChange();
        });

        addSelect(container, '表情', node.data.expression, getExpressionOptions(node.data.character_id), (val) => {
            node.data.expression = val;
            onChange();
        });

        addTextarea(container, '对话文本', node.data.text, (val) => {
            node.data.text = val;
            onChange();
        });

        addNextField(container, node, '下一节点');
    }

    function renderNarration(node) {
        addSection(container, '旁白内容');
        addTextarea(container, '旁白文本', node.data.text, (val) => {
            node.data.text = val;
            onChange();
        });
        addNextField(container, node, '下一节点');
    }

    function renderChoice(node) {
        addSection(container, '选择选项');

        const list = document.createElement('div');
        list.className = 'choice-options-list';

        function renderOptions() {
            list.innerHTML = '';
            (node.data.options || []).forEach((opt, idx) => {
                const item = document.createElement('div');
                item.className = 'option-item';
                item.innerHTML = `
                    <div class="option-item-header">
                        <span>选项 ${idx + 1}</span>
                        <span class="option-delete" data-idx="${idx}">删除</span>
                    </div>
                `;

                const textInput = addInlineInput(item, '选项文本', opt.text, (val) => {
                    opt.text = val;
                    onChange();
                });

                const sceneSelect = addInlineSelect(item, '跳转场景', opt.next_scene_id || '', getSceneOptions(), (val) => {
                    opt.next_scene_id = val;
                    // 切换场景时重置节点
                    opt.next_node_id = null;
                    onChange();
                    renderOptions(); // 刷新节点列表
                });

                if (opt.next_scene_id) {
                    addInlineSelect(item, '跳转节点', opt.next_node_id || '',
                        getSceneNodeOptions(opt.next_scene_id), (val) => {
                            opt.next_node_id = val;
                            onChange();
                        });
                }

                // 条件（可选）
                const condWrap = document.createElement('div');
                condWrap.className = 'form-group';
                condWrap.style.marginTop = '8px';
                condWrap.innerHTML = '<div class="form-label">显示条件（可选）</div>';
                const condRow = document.createElement('div');
                condRow.className = 'form-row';

                const varInput = document.createElement('input');
                varInput.className = 'form-input';
                varInput.placeholder = '变量名';
                varInput.value = opt.condition?.variable || '';
                varInput.oninput = () => {
                    if (!opt.condition) opt.condition = { variable: '', operator: '==', value: '' };
                    opt.condition.variable = varInput.value;
                    onChange();
                };

                const opSelect = document.createElement('select');
                opSelect.className = 'form-select';
                ['==', '!=', '>', '<', '>=', '<='].forEach(op => {
                    const o = document.createElement('option');
                    o.value = op; o.textContent = op;
                    if (opt.condition?.operator === op) o.selected = true;
                    opSelect.appendChild(o);
                });
                opSelect.onchange = () => {
                    if (!opt.condition) opt.condition = { variable: '', operator: '==', value: '' };
                    opt.condition.operator = opSelect.value;
                    onChange();
                };

                const valInput = document.createElement('input');
                valInput.className = 'form-input';
                valInput.placeholder = '值';
                valInput.value = opt.condition?.value || '';
                valInput.oninput = () => {
                    if (!opt.condition) opt.condition = { variable: '', operator: '==', value: '' };
                    opt.condition.value = valInput.value;
                    onChange();
                };

                condRow.appendChild(varInput);
                condRow.appendChild(opSelect);
                condRow.appendChild(valInput);
                condWrap.appendChild(condRow);
                item.appendChild(condWrap);

                item.querySelector('.option-delete').onclick = () => {
                    node.data.options.splice(idx, 1);
                    onChange();
                    renderOptions();
                };

                list.appendChild(item);
            });
        }

        const addBtn = document.createElement('button');
        addBtn.className = 'btn btn-sm';
        addBtn.textContent = '+ 添加选项';
        addBtn.onclick = () => {
            if (!node.data.options) node.data.options = [];
            node.data.options.push({ text: '新选项', next_scene_id: null, next_node_id: null, condition: null });
            onChange();
            renderOptions();
        };

        container.appendChild(list);
        container.appendChild(addBtn);
        renderOptions();
    }

    function renderJump(node) {
        addSection(container, '跳转设置');

        addSelect(container, '目标场景', node.data.target_scene_id || '', getSceneOptions(), (val) => {
            node.data.target_scene_id = val;
            node.data.target_node_id = null;
            onChange();
            render(); // 刷新节点选择
        });

        if (node.data.target_scene_id) {
            addSelect(container, '目标节点', node.data.target_node_id || '',
                getSceneNodeOptions(node.data.target_scene_id), (val) => {
                    node.data.target_node_id = val;
                    onChange();
                });
        }
    }

    function renderCondition(node) {
        addSection(container, '条件判断');

        addInput(container, '变量名', node.data.variable, (val) => {
            node.data.variable = val;
            onChange();
        });

        addSelect(container, '运算符', node.data.operator,
            ['==', '!=', '>', '<', '>=', '<='].map(op => ({ value: op, label: op })),
            (val) => { node.data.operator = val; onChange(); });

        addInput(container, '比较值', node.data.value, (val) => {
            node.data.value = val;
            onChange();
        });

        addSection(container, '分支');
        addNodeSelect(container, '条件成立 →', node.data.true_next, (val) => {
            node.data.true_next = val;
            onChange();
        }, 'var(--accent-green)');
        addNodeSelect(container, '不成立 →', node.data.false_next, (val) => {
            node.data.false_next = val;
            onChange();
        }, 'var(--accent-red)');
    }

    function renderSetVar(node) {
        addSection(container, '变量操作');

        addInput(container, '变量名', node.data.variable, (val) => {
            node.data.variable = val;
            onChange();
        });

        addSelect(container, '操作', node.data.operation,
            [
                { value: 'set', label: '设置 (=)' },
                { value: 'add', label: '增加 (+)' },
                { value: 'sub', label: '减少 (-)' },
                { value: 'toggle', label: '切换布尔' }
            ],
            (val) => { node.data.operation = val; onChange(); });

        addInput(container, '值', node.data.value, (val) => {
            node.data.value = val;
            onChange();
        });

        addNextField(container, node, '下一节点');
    }

    function renderBg(node) {
        addSection(container, '背景切换');

        addSelect(container, '背景', node.data.bg_id, getBgOptions(), (val) => {
            node.data.bg_id = val;
            onChange();
        });

        addSelect(container, '转场效果', node.data.transition,
            [
                { value: 'fade', label: '淡入淡出' },
                { value: 'slide_left', label: '左滑入' },
                { value: 'slide_right', label: '右滑入' },
                { value: 'none', label: '无（瞬间）' }
            ],
            (val) => { node.data.transition = val; onChange(); });

        addNextField(container, node, '下一节点');
    }

    function renderShowChar(node) {
        addSection(container, '显示角色');

        addSelect(container, '角色', node.data.character_id, getCharacterOptions(), (val) => {
            node.data.character_id = val;
            onChange();
            render();
        });

        if (node.data.character_id) {
            addSelect(container, '表情', node.data.expression,
                getExpressionOptions(node.data.character_id), (val) => {
                    node.data.expression = val;
                    onChange();
                });
        }

        addSelect(container, '位置', node.data.position,
            [
                { value: 'left', label: '左侧' },
                { value: 'center', label: '中央' },
                { value: 'right', label: '右侧' }
            ],
            (val) => { node.data.position = val; onChange(); });

        addSelect(container, '出场动画', node.data.transition,
            [
                { value: 'fade', label: '淡入' },
                { value: 'slide_in_left', label: '从左滑入' },
                { value: 'slide_in_right', label: '从右滑入' },
                { value: 'none', label: '无' }
            ],
            (val) => { node.data.transition = val; onChange(); });

        addNextField(container, node, '下一节点');
    }

    function renderHideChar(node) {
        addSection(container, '隐藏角色');

        addSelect(container, '角色', node.data.character_id, getCharacterOptions(), (val) => {
            node.data.character_id = val;
            onChange();
        });

        addSelect(container, '离场动画', node.data.transition,
            [
                { value: 'fade', label: '淡出' },
                { value: 'slide_out_left', label: '向左滑出' },
                { value: 'slide_out_right', label: '向右滑出' },
                { value: 'none', label: '无' }
            ],
            (val) => { node.data.transition = val; onChange(); });

        addNextField(container, node, '下一节点');
    }

    function renderWait(node) {
        addSection(container, '等待');
        addInput(container, '时长 (毫秒)', node.data.duration_ms, (val) => {
            node.data.duration_ms = parseInt(val) || 0;
            onChange();
        }, 'number');
        addNextField(container, node, '下一节点');
    }

    function renderEffect(node) {
        addSection(container, '特效');
        addSelect(container, '特效类型', node.data.effect_type,
            [
                { value: 'shake', label: '屏幕震动' },
                { value: 'flash', label: '闪白' },
                { value: 'fade_in', label: '渐入（黑）' },
                { value: 'fade_out', label: '渐出（黑）' },
                { value: 'glitch', label: '故障效果' }
            ],
            (val) => { node.data.effect_type = val; onChange(); });

        addInput(container, '参数 (JSON)', node.data.params, (val) => {
            node.data.params = val;
            onChange();
        });

        addNextField(container, node, '下一节点');
    }

    function renderSound(node) {
        addSection(container, '音效 / BGM');
        addInput(container, '音效ID/路径', node.data.sound_id, (val) => {
            node.data.sound_id = val;
            onChange();
        });

        addSelect(container, '操作', node.data.action,
            [
                { value: 'play', label: '播放一次' },
                { value: 'loop', label: '循环播放' },
                { value: 'stop', label: '停止' }
            ],
            (val) => { node.data.action = val; onChange(); });

        addInput(container, '音量 (0-1)', node.data.volume, (val) => {
            node.data.volume = parseFloat(val) || 1.0;
            onChange();
        }, 'number');

        addNextField(container, node, '下一节点');
    }

    function renderEnd(node) {
        addSection(container, '结局');
        addSelect(container, '结局类型', node.data.ending_type,
            [
                { value: 'good', label: '好结局' },
                { value: 'bad', label: '坏结局' },
                { value: 'neutral', label: '普通结局' },
                { value: 'secret', label: '隐藏结局' }
            ],
            (val) => { node.data.ending_type = val; onChange(); });

        addTextarea(container, '结局文本', node.data.text, (val) => {
            node.data.text = val;
            onChange();
        });
    }

    // ──────────────────────────────────────────────────────
    // 通用字段创建
    // ──────────────────────────────────────────────────────

    function addField(parent, label, value, opts = {}) {
        const group = document.createElement('div');
        group.className = 'form-group';
        group.innerHTML = `<div class="form-label">${label}</div>`;
        const input = document.createElement('input');
        input.className = 'form-input';
        input.type = opts.type || 'text';
        input.value = value || '';
        if (opts.readonly) input.readOnly = true;
        group.appendChild(input);
        parent.appendChild(group);
        return input;
    }

    function addInput(parent, label, value, onChange, type = 'text') {
        const group = document.createElement('div');
        group.className = 'form-group';
        group.innerHTML = `<div class="form-label">${label}</div>`;
        const input = document.createElement('input');
        input.className = 'form-input';
        input.type = type;
        input.value = value != null ? value : '';
        input.addEventListener('input', () => onChange(input.value));
        group.appendChild(input);
        parent.appendChild(group);
        return group;
    }

    function addInlineInput(parent, label, value, onChange) {
        const group = document.createElement('div');
        group.className = 'form-group';
        group.style.marginTop = '6px';
        group.innerHTML = `<div class="form-label">${label}</div>`;
        const input = document.createElement('input');
        input.className = 'form-input';
        input.value = value || '';
        input.addEventListener('input', () => onChange(input.value));
        group.appendChild(input);
        parent.appendChild(group);
        return group;
    }

    function addTextarea(parent, label, value, onChange) {
        const group = document.createElement('div');
        group.className = 'form-group';
        group.innerHTML = `<div class="form-label">${label}</div>`;
        const ta = document.createElement('textarea');
        ta.className = 'form-textarea';
        ta.value = value || '';
        ta.rows = 4;
        ta.addEventListener('input', () => onChange(ta.value));
        group.appendChild(ta);
        parent.appendChild(group);
        return group;
    }

    function addSelect(parent, label, value, options, onChange) {
        const group = document.createElement('div');
        group.className = 'form-group';
        group.innerHTML = `<div class="form-label">${label}</div>`;
        const sel = document.createElement('select');
        sel.className = 'form-select';
        options.forEach(opt => {
            const o = document.createElement('option');
            o.value = typeof opt === 'object' ? opt.value : opt;
            o.textContent = typeof opt === 'object' ? opt.label : opt;
            if (o.value === value) o.selected = true;
            sel.appendChild(o);
        });
        sel.addEventListener('change', () => onChange(sel.value));
        group.appendChild(sel);
        parent.appendChild(group);
        return group;
    }

    function addInlineSelect(parent, label, value, options, onChange) {
        const group = document.createElement('div');
        group.className = 'form-group';
        group.style.marginTop = '6px';
        group.innerHTML = `<div class="form-label">${label}</div>`;
        const sel = document.createElement('select');
        sel.className = 'form-select';
        options.forEach(opt => {
            const o = document.createElement('option');
            o.value = typeof opt === 'object' ? opt.value : opt;
            o.textContent = typeof opt === 'object' ? opt.label : opt;
            if (o.value === value) o.selected = true;
            sel.appendChild(o);
        });
        sel.addEventListener('change', () => onChange(sel.value));
        group.appendChild(sel);
        parent.appendChild(group);
        return group;
    }

    function addNodeSelect(parent, label, nodeId, onChange, color) {
        const group = document.createElement('div');
        group.className = 'form-group';
        const lab = document.createElement('div');
        lab.className = 'form-label';
        lab.textContent = label;
        if (color) lab.style.color = color;
        group.appendChild(lab);

        const sel = document.createElement('select');
        sel.className = 'form-select';
        const scene = app.getCurrentScene();
        if (scene) {
            const empty = document.createElement('option');
            empty.value = ''; empty.textContent = '-- 选择节点 --';
            sel.appendChild(empty);
            scene.nodes.forEach(n => {
                const o = document.createElement('option');
                o.value = n.id;
                const def = StorySchema.NODE_TYPES[n.type];
                const preview = n.type === 'dialogue' ? n.data.text.slice(0, 20)
                    : n.type === 'narration' ? n.data.text.slice(0, 20)
                    : (def?.label || n.type);
                o.textContent = `${def?.icon || ''} ${preview}`;
                if (n.id === nodeId) o.selected = true;
                sel.appendChild(o);
            });
        }
        sel.addEventListener('change', () => onChange(sel.value || null));
        group.appendChild(sel);
        parent.appendChild(group);
        return group;
    }

    function addNextField(parent, node, label) {
        addNodeSelect(parent, label, node.data.next, (val) => {
            node.data.next = val;
            onChange();
        });
    }

    function addSection(parent, title) {
        const h = document.createElement('div');
        h.className = 'form-section-title';
        h.textContent = title;
        parent.appendChild(h);
    }

    // ──────────────────────────────────────────────────────
    // 选项数据
    // ──────────────────────────────────────────────────────

    function getCharacterOptions() {
        const opts = [{ value: '', label: '-- 选择角色 --' }];
        (app.state.story.characters || []).forEach(c => {
            opts.push({ value: c.id, label: c.name });
        });
        return opts;
    }

    function getExpressionOptions(charId) {
        const char = app.state.story.characters?.find(c => c.id === charId);
        if (!char || !char.portraits) return [{ value: 'neutral', label: '默认' }];
        return char.portraits.map(p => ({ value: p.expression, label: p.expression }));
    }

    function getSceneOptions() {
        const opts = [{ value: '', label: '-- 选择场景 --' }];
        (app.state.story.scenes || []).forEach(s => {
            opts.push({ value: s.id, label: s.name });
        });
        return opts;
    }

    function getSceneNodeOptions(sceneId) {
        const scene = app.state.story.scenes?.find(s => s.id === sceneId);
        if (!scene) return [{ value: '', label: '-- 起始节点 --' }];
        const opts = [{ value: '', label: '-- 起始节点 --' }];
        scene.nodes.forEach(n => {
            const def = StorySchema.NODE_TYPES[n.type];
            const preview = n.type === 'dialogue' ? n.data.text?.slice(0, 20) || ''
                : n.type === 'narration' ? n.data.text?.slice(0, 20) || ''
                : (def?.label || n.type);
            opts.push({ value: n.id, label: `${def?.icon || ''} ${preview}` });
        });
        return opts;
    }

    function getBgOptions() {
        const opts = [{ value: '', label: '-- 选择背景 --' }];
        (app.state.story.backgrounds || []).forEach(b => {
            opts.push({ value: b.id, label: b.name });
        });
        return opts;
    }

    function onChange() {
        app.markDirty();
        NodeCanvas.render();
    }

    return { init, render };

})();
