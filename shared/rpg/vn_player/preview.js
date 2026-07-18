/* ═══════════════════════════════════════════════════════════════
   Preview / Visual Novel Player (RPG 嵌入版)
   从 story-editor/modules/preview.js 复制并打两处补丁：
     1. 'preview-stage' → 'vn-stage'
     2. 移除编辑器按钮监听（btn-preview-* / btn-close-preview / btn-toggle-preview）
   ═══════════════════════════════════════════════════════════════ */

const Preview = (() => {

    // 状态
    let story = null;
    let currentScene = null;
    let currentNodeId = null;
    let variables = {};
    let characters = [];
    let backgrounds = [];
    let isPlaying = false;
    let isWaiting = false;
    let typing = null;
    let onEndCallback = null;

    // DOM 引用
    let stage, bgEl, charsEl, dialogEl, charNameEl, textEl, continueHint, choicesEl, effectsEl;
    let visibleChars = {};

    function init() {
        // ★ 补丁1：vn-stage（原 preview-stage）
        stage = document.getElementById('vn-stage');
        bgEl = document.getElementById('vn-bg');
        charsEl = document.getElementById('vn-chars');
        dialogEl = document.getElementById('vn-dialog');
        charNameEl = document.getElementById('vn-char-name');
        textEl = document.getElementById('vn-text');
        continueHint = document.getElementById('vn-continue-hint');
        choicesEl = document.getElementById('vn-choices');
        effectsEl = document.getElementById('vn-effects');

        // 点击继续
        if (stage) {
            stage.addEventListener('click', (e) => {
                if (e.target.closest('.vn-choices')) return;
                handleClick();
            });
        }
        // ★ 补丁2：移除编辑器按钮监听
    }

    // ──────────────────────────────────────────────────────────
    // 公共 API
    // ──────────────────────────────────────────────────────────

    function playScene(scene, opts = {}) {
        reset();
        currentScene = scene;
        characters = opts.characters || [];
        backgrounds = opts.backgrounds || [];
        variables = opts.variables ? { ...opts.variables } : {};
        onEndCallback = opts.onEnd || null;

        isPlaying = true;
        currentNodeId = scene.start_node_id;
        processCurrentNode();
    }

    function playStory(storyData, startSceneId, opts = {}) {
        story = storyData;
        const scene = storyData.scenes.find(s => s.id === startSceneId) || storyData.scenes[0];
        if (!scene) {
            console.error('No scene found');
            return;
        }
        playScene(scene, {
            characters: storyData.characters || [],
            backgrounds: storyData.backgrounds || [],
            variables: { ...(storyData.variables || {}) },
            ...opts
        });
    }

    function reset() {
        isPlaying = false;
        isWaiting = false;
        if (typing) {
            clearInterval(typing);
            typing = null;
        }
        currentScene = null;
        currentNodeId = null;
        visibleChars = {};

        if (bgEl) bgEl.style.background = '#000';
        if (charsEl) charsEl.innerHTML = '';
        if (dialogEl) dialogEl.style.display = 'none';
        if (choicesEl) {
            choicesEl.style.display = 'none';
            choicesEl.innerHTML = '';
        }
    }

    function skip() {
        if (typing) {
            clearInterval(typing);
            typing = null;
            if (textEl && currentNodeId) {
                const node = getNode(currentNodeId);
                if (node) textEl.textContent = node.data.text || '';
            }
            continueHint.style.display = 'block';
            return;
        }
        handleClick();
    }

    function setOnEnd(cb) { onEndCallback = cb; }

    // ──────────────────────────────────────────────────────────
    // 核心处理
    // ──────────────────────────────────────────────────────────

    function processCurrentNode() {
        if (!isPlaying || !currentNodeId || !currentScene) {
            endPlay();
            return;
        }

        const node = getNode(currentNodeId);
        if (!node) {
            endPlay();
            return;
        }

        switch (node.type) {
            case 'dialogue': handleDialogue(node); break;
            case 'narration': handleNarration(node); break;
            case 'choice': handleChoice(node); break;
            case 'jump': handleJump(node); break;
            case 'condition': handleCondition(node); break;
            case 'set_var': handleSetVar(node); break;
            case 'bg': handleBg(node); break;
            case 'show_char': handleShowChar(node); break;
            case 'hide_char': handleHideChar(node); break;
            case 'wait': handleWait(node); break;
            case 'effect': handleEffect(node); break;
            case 'sound': handleSound(node); break;
            case 'end': handleEnd(node); break;
            default:
                goNext(node.data.next);
        }
    }

    function getNode(nodeId) {
        return currentScene?.nodes.find(n => n.id === nodeId);
    }

    function goNext(nextId) {
        if (!nextId) {
            endPlay();
            return;
        }
        currentNodeId = nextId;
        requestAnimationFrame(() => processCurrentNode());
    }

    function handleClick() {
        if (!isPlaying) return;
        if (isWaiting) return;

        const node = getNode(currentNodeId);
        if (!node) return;

        if (typing) {
            clearInterval(typing);
            typing = null;
            textEl.textContent = node.data.text || '';
            continueHint.style.display = 'block';
            return;
        }

        if (node.type === 'dialogue' || node.type === 'narration') {
            goNext(node.data.next);
        }
    }

    // ──────────────────────────────────────────────────────────
    // 节点处理器
    // ──────────────────────────────────────────────────────────

    function handleDialogue(node) {
        showDialog();
        const char = characters.find(c => c.id === node.data.character_id);
        charNameEl.textContent = char ? char.name : '';
        charNameEl.style.color = char?.color || '';
        charNameEl.style.display = char ? 'block' : 'none';

        typeText(node.data.text || '');

        if (node.data.character_id) {
            showCharacter(node.data.character_id, node.data.expression, 'center');
        }

        isWaiting = false;
    }

    function handleNarration(node) {
        showDialog();
        charNameEl.style.display = 'none';
        typeText(node.data.text || '');
        isWaiting = false;
    }

    function handleChoice(node) {
        showDialog();
        charNameEl.style.display = 'none';
        textEl.textContent = '请选择：';
        continueHint.style.display = 'none';

        choicesEl.innerHTML = '';
        choicesEl.style.display = 'flex';

        const options = node.data.options || [];
        options.forEach(opt => {
            if (opt.condition && opt.condition.variable) {
                if (!VariableManager.evaluateCondition(
                    variables,
                    opt.condition.variable,
                    opt.condition.operator || '==',
                    opt.condition.value
                )) {
                    return;
                }
            }

            const btn = document.createElement('button');
            btn.className = 'vn-choice-btn';
            btn.textContent = opt.text;
            btn.onclick = () => {
                choicesEl.style.display = 'none';
                choicesEl.innerHTML = '';
                if (opt.next_scene_id) {
                    jumpToScene(opt.next_scene_id, opt.next_node_id);
                } else {
                    goNext(null);
                }
            };
            choicesEl.appendChild(btn);
        });

        isWaiting = true;
    }

    function handleJump(node) {
        jumpToScene(node.data.target_scene_id, node.data.target_node_id);
    }

    function jumpToScene(sceneId, nodeId) {
        if (story) {
            const scene = story.scenes.find(s => s.id === sceneId);
            if (scene) {
                currentScene = scene;
                currentNodeId = nodeId || scene.start_node_id;
                processCurrentNode();
                return;
            }
        }
        if (nodeId) {
            currentNodeId = nodeId;
            processCurrentNode();
        } else {
            endPlay();
        }
    }

    function handleCondition(node) {
        const result = VariableManager.evaluateCondition(
            variables,
            node.data.variable,
            node.data.operator || '==',
            node.data.value
        );
        const nextId = result ? node.data.true_next : node.data.false_next;
        goNext(nextId);
    }

    function handleSetVar(node) {
        VariableManager.applyOperation(
            variables,
            node.data.variable,
            node.data.operation || 'set',
            node.data.value
        );
        goNext(node.data.next);
    }

    function handleBg(node) {
        applyBgTransition(node.data.bg_id, node.data.transition);
        goNext(node.data.next);
    }

    function handleShowChar(node) {
        showCharacter(node.data.character_id, node.data.expression, node.data.position, node.data.transition);
        goNext(node.data.next);
    }

    function handleHideChar(node) {
        hideCharacter(node.data.character_id, node.data.transition);
        goNext(node.data.next);
    }

    function handleWait(node) {
        isWaiting = true;
        setTimeout(() => {
            isWaiting = false;
            goNext(node.data.next);
        }, node.data.duration_ms || 1000);
    }

    function handleEffect(node) {
        applyEffect(node.data.effect_type, node.data.params);
        goNext(node.data.next);
    }

    function handleSound(node) {
        console.log('[Sound]', node.data.action, node.data.sound_id);
        goNext(node.data.next);
    }

    function handleEnd(node) {
        showDialog();
        charNameEl.style.display = 'none';
        const endingLabel = { good: '🎉 好结局', bad: '💀 坏结局', neutral: '📖 结局', secret: '🔮 隐藏结局' };
        textEl.textContent = `${endingLabel[node.data.ending_type] || '结局'}\n\n${node.data.text || ''}`;
        continueHint.style.display = 'none';
        isWaiting = true;

        if (onEndCallback) {
            onEndCallback({ type: node.data.ending_type, text: node.data.text });
        }
    }

    function endPlay() {
        isPlaying = false;
        if (continueHint) continueHint.style.display = 'none';
        // 播放结束回调（无 end 节点的情况）
        if (onEndCallback) {
            const cb = onEndCallback;
            onEndCallback = null;
            cb({ type: 'end_of_story', text: '' });
        }
    }

    // ──────────────────────────────────────────────────────────
    // 显示辅助
    // ──────────────────────────────────────────────────────────

    function showDialog() {
        dialogEl.style.display = 'block';
        continueHint.style.display = 'none';
        choicesEl.style.display = 'none';
    }

    function typeText(text) {
        if (typing) {
            clearInterval(typing);
            typing = null;
        }
        textEl.textContent = '';
        let i = 0;
        const speed = 30;
        typing = setInterval(() => {
            if (i >= text.length) {
                clearInterval(typing);
                typing = null;
                continueHint.style.display = 'block';
                return;
            }
            textEl.textContent += text[i];
            i++;
        }, speed);
    }

    // ──────────────────────────────────────────────────────────
    // 角色立绘
    // ──────────────────────────────────────────────────────────

    function showCharacter(charId, expression, position = 'center', transition = 'fade') {
        const char = characters.find(c => c.id === charId);
        if (!char) return;

        let imgUrl = null;
        const portrait = char.portraits?.find(p => p.expression === expression);
        if (portrait) {
            imgUrl = portrait.image;
        } else if (char.portraits?.[0]) {
            imgUrl = char.portraits[0].image;
        }

        if (!imgUrl) return;

        let el = visibleChars[charId]?.element;

        if (!el) {
            el = document.createElement('div');
            el.className = 'vn-char-sprite';
            charsEl.appendChild(el);
            visibleChars[charId] = { element: el };
        }

        visibleChars[charId].expression = expression;
        visibleChars[charId].position = position;

        el.style.backgroundImage = `url(${imgUrl})`;
        el.className = 'vn-char-sprite pos-' + position;

        if (transition === 'fade') {
            el.style.opacity = '0';
            requestAnimationFrame(() => {
                el.style.transition = 'opacity 0.3s';
                el.style.opacity = '1';
            });
        } else if (transition === 'slide_in_left') {
            el.style.transform = 'translateX(-50px)';
            el.style.opacity = '0';
            requestAnimationFrame(() => {
                el.style.transition = 'all 0.3s';
                el.style.opacity = '1';
                if (position === 'center') {
                    el.style.transform = 'translateX(-50%)';
                } else {
                    el.style.transform = 'translateX(0)';
                }
            });
        } else if (transition === 'slide_in_right') {
            el.style.transform = 'translateX(50px)';
            el.style.opacity = '0';
            requestAnimationFrame(() => {
                el.style.transition = 'all 0.3s';
                el.style.opacity = '1';
                if (position === 'center') {
                    el.style.transform = 'translateX(-50%)';
                } else {
                    el.style.transform = 'translateX(0)';
                }
            });
        } else {
            el.style.opacity = '1';
        }
    }

    function hideCharacter(charId, transition = 'fade') {
        const charInfo = visibleChars[charId];
        if (!charInfo || !charInfo.element) return;

        const el = charInfo.element;

        if (transition === 'fade') {
            el.style.opacity = '0';
            setTimeout(() => {
                el.remove();
                delete visibleChars[charId];
            }, 300);
        } else if (transition === 'slide_out_left') {
            el.style.transition = 'all 0.3s';
            el.style.transform = 'translateX(-50px)';
            el.style.opacity = '0';
            setTimeout(() => {
                el.remove();
                delete visibleChars[charId];
            }, 300);
        } else if (transition === 'slide_out_right') {
            el.style.transition = 'all 0.3s';
            el.style.transform = 'translateX(50px)';
            el.style.opacity = '0';
            setTimeout(() => {
                el.remove();
                delete visibleChars[charId];
            }, 300);
        } else {
            el.remove();
            delete visibleChars[charId];
        }
    }

    // ──────────────────────────────────────────────────────────
    // 背景
    // ──────────────────────────────────────────────────────────

    function applyBgTransition(bgId, transition = 'fade') {
        const bg = backgrounds.find(b => b.id === bgId);
        if (!bg) return;

        if (transition === 'fade') {
            bgEl.style.transition = 'opacity 0.5s';
            bgEl.style.opacity = '0';
            setTimeout(() => {
                setBgStyle(bg);
                bgEl.style.opacity = '1';
            }, 250);
        } else if (transition === 'none') {
            setBgStyle(bg);
        } else {
            setBgStyle(bg);
        }
    }

    function setBgStyle(bg) {
        if (bg.type === 'solid' && bg.color) {
            bgEl.style.background = bg.color;
            bgEl.style.backgroundImage = 'none';
        } else if (bg.image) {
            bgEl.style.backgroundImage = `url(${bg.image})`;
            bgEl.style.backgroundSize = 'cover';
            bgEl.style.backgroundPosition = 'center';
        }
    }

    // ──────────────────────────────────────────────────────────
    // 特效
    // ──────────────────────────────────────────────────────────

    function applyEffect(effectType, paramsStr) {
        let params = {};
        try {
            params = JSON.parse(paramsStr || '{}');
        } catch (e) { /* ignore */ }

        switch (effectType) {
            case 'shake':
                effectsEl.className = 'vn-effects';
                void effectsEl.offsetWidth;
                effectsEl.classList.add('effect-shake');
                setTimeout(() => {
                    effectsEl.classList.remove('effect-shake');
                }, 300);
                break;
            case 'flash':
                const flash = document.createElement('div');
                flash.className = 'effect-flash';
                flash.style.cssText = 'position:absolute;inset:0;background:#fff;opacity:0.6;';
                effectsEl.appendChild(flash);
                setTimeout(() => flash.remove(), 500);
                break;
            case 'fade_out':
                bgEl.style.transition = 'filter 0.5s';
                bgEl.style.filter = 'brightness(0)';
                break;
            case 'fade_in':
                bgEl.style.transition = 'filter 0.5s';
                bgEl.style.filter = 'brightness(1)';
                break;
        }
    }

    // ──────────────────────────────────────────────────────────
    // 导出
    // ──────────────────────────────────────────────────────────

    return {
        init,
        playScene,
        playStory,
        reset,
        skip,
        setOnEnd,
    };

})();
