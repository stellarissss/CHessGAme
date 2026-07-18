/* ═══════════════════════════════════════════════════════════════
   Preview / Visual Novel Player - 视觉小说播放引擎
   可独立嵌入游戏，也作为编辑器的实时预览
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
    let visibleChars = {}; // { charId: { element, expression, position } }

    function init() {
        stage = document.getElementById('preview-stage');
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

        // 预览控制按钮
        document.getElementById('btn-preview-play')?.addEventListener('click', () => {
            if (!isPlaying) {
                const scene = window.app?.getCurrentScene?.();
                if (scene) {
                    playScene(scene, {
                        characters: window.app?.state?.story?.characters || [],
                        backgrounds: window.app?.state?.story?.backgrounds || [],
                        variables: { ...(window.app?.state?.story?.variables || {}) }
                    });
                }
            } else {
                handleClick();
            }
        });

        document.getElementById('btn-preview-reset')?.addEventListener('click', () => {
            reset();
        });

        document.getElementById('btn-preview-skip')?.addEventListener('click', () => {
            skip();
        });

        document.getElementById('btn-close-preview')?.addEventListener('click', () => {
            document.getElementById('preview-panel')?.classList.toggle('collapsed');
            document.querySelector('.main-layout')?.classList.toggle('preview-collapsed');
        });

        document.getElementById('btn-toggle-preview')?.addEventListener('click', () => {
            document.getElementById('preview-panel')?.classList.toggle('collapsed');
            document.querySelector('.main-layout')?.classList.toggle('preview-collapsed');
        });
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
            // 打字机效果直接显示完整
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
                // 未知节点，直接跳到下一个
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
        // 延迟一帧让 UI 更新
        requestAnimationFrame(() => processCurrentNode());
    }

    function handleClick() {
        if (!isPlaying) return;
        if (isWaiting) return;

        const node = getNode(currentNodeId);
        if (!node) return;

        // 如果是对话或旁白，且正在打字机效果
        if (typing) {
            clearInterval(typing);
            typing = null;
            textEl.textContent = node.data.text || '';
            continueHint.style.display = 'block';
            return;
        }

        // 对话/旁白：点击继续
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

        // 显示角色立绘
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
            // 检查条件
            if (opt.condition && opt.condition.variable) {
                if (!VariableManager.evaluateCondition(
                    variables,
                    opt.condition.variable,
                    opt.condition.operator || '==',
                    opt.condition.value
                )) {
                    return; // 不显示
                }
            }

            const btn = document.createElement('button');
            btn.className = 'vn-choice-btn';
            btn.textContent = opt.text;
            btn.onclick = () => {
                choicesEl.style.display = 'none';
                choicesEl.innerHTML = '';
                // 跳转到目标场景/节点
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
            // 从整个 story 中找
            const scene = story.scenes.find(s => s.id === sceneId);
            if (scene) {
                currentScene = scene;
                currentNodeId = nodeId || scene.start_node_id;
                processCurrentNode();
                return;
            }
        }
        // 场景不变，只跳节点
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
        // 音效是可选功能，无音效文件时静默跳过
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
        continueHint.style.display = 'none';
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
        const speed = 30; // ms per char
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

        // 找立绘图片
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

        // 入场动画
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
                void effectsEl.offsetWidth; // 重绘
                effectsEl.classList.add('effect-shake');
                setTimeout(() => {
                    effectsEl.classList.remove('effect-shake');
                }, 300);
                break;
            case 'flash':
                const flash = document.createElement('div');
                flash.className = 'effect-flash';
                flash.style.cssText = 'position:absolute;inset:0;';
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
        // 独立嵌入时可用的 API
        VisualNovelPlayer: {
            create: (container, opts = {}) => {
                // 返回一个独立播放实例
                // TODO: 完整独立播放器实现，集成文档中详述
                return {
                    play: (storyData, startSceneId) => playStory(storyData, startSceneId, opts),
                    stop: reset,
                    onEnd: (cb) => { onEndCallback = cb; },
                    setVariable: (key, val) => { variables[key] = val; },
                    getVariable: (key) => variables[key]
                };
            }
        }
    };

})();
