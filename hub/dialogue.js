/**
 * 剧情对话系统（v1.3）
 * 功能：打字机效果、立绘切换、选择面板、祈求低语、识破警告
 */
(function() {
    'use strict';

    const API_BASE = '/samsara/story';
    let currentRealm = null;
    let currentLevel = null;
    let levelData = null;
    let dialogueQueue = [];
    let dialogueIndex = 0;
    let isTyping = false;
    let typeTimer = null;
    let currentPhase = 'dialogues'; // dialogues / dialogues_before / dialogues_after
    let choicesShown = false;
    let storyData = null;

    // ── URL 参数解析 ──
    function getParams() {
        const params = new URLSearchParams(window.location.search);
        return {
            realm: params.get('realm') || 'hell',
            level: params.get('level') || '1',
            mode: params.get('mode') || 'level', // level / prologue
        };
    }

    // ── 初始化 ──
    async function init() {
        const params = getParams();
        if (params.mode === 'prologue') {
            await loadPrologue();
        } else {
            currentRealm = params.realm;
            currentLevel = params.level;
            await loadLevelDialogue(currentRealm, currentLevel);
        }
    }

    // ── 加载序章 ──
    async function loadPrologue() {
        try {
            const resp = await fetch(`${API_BASE}/api/story/prologue`);
            const data = await resp.json();
            document.getElementById('realm-name').textContent = '序章';
            document.getElementById('level-title').textContent = data.title || '';
            // 序章有多个 act，按顺序串联
            dialogueQueue = [];
            for (const act of data.acts || []) {
                for (const d of act.dialogues || []) {
                    dialogueQueue.push(d);
                }
            }
            setBackground(data.background);
            dialogueIndex = 0;
            showNextDialogue();
        } catch (e) {
            console.error('加载序章失败:', e);
        }
    }

    // ── 加载关卡对话 ──
    async function loadLevelDialogue(realm, level) {
        try {
            const resp = await fetch(`${API_BASE}/api/story/realm/${realm}/level/${level}`);
            const data = await resp.json();
            if (!data.success) {
                console.error('加载失败:', data.message);
                return;
            }
            levelData = data.data;
            storyData = data.state;

            // 更新顶部信息
            const realmResp = await fetch(`${API_BASE}/api/story/realm/${realm}`);
            const realmData = await realmResp.json();
            document.getElementById('realm-name').textContent = realmData.data?.name || realm;
            document.getElementById('level-title').textContent = `· ${levelData.title || ''}`;

            setBackground(realmData.data?.background);

            // 根据关卡类型决定对话流
            dialogueQueue = [];
            if (levelData.dialogues) {
                currentPhase = 'dialogues';
                dialogueQueue = [...levelData.dialogues];
            } else if (levelData.dialogues_before) {
                currentPhase = 'dialogues_before';
                dialogueQueue = [...levelData.dialogues_before];
            }

            dialogueIndex = 0;
            showNextDialogue();
        } catch (e) {
            console.error('加载对话失败:', e);
        }
    }

    // ── 设置背景 ──
    function setBackground(bg) {
        if (!bg) return;
        const scene = document.getElementById('dialogue-scene');
        scene.style.backgroundImage = `url(/shared/assets/backgrounds/${bg})`;
    }

    // ── 显示下一条对话 ──
    function showNextDialogue() {
        if (dialogueIndex >= dialogueQueue.length) {
            // 当前队列结束
            onDialogueQueueEnd();
            return;
        }

        const dialogue = dialogueQueue[dialogueIndex];
        const isNarrator = dialogue.speaker === 'narrator' || !dialogue.portrait;

        // 更新立绘
        updatePortraits(dialogue);

        // 显示对话框
        const box = document.getElementById('dialogue-box');
        box.style.display = 'block';

        // 说话者名称
        const nameEl = document.getElementById('speaker-name');
        if (isNarrator) {
            nameEl.innerHTML = '<span class="narrator-tag">旁白</span>';
        } else {
            nameEl.textContent = dialogue.speaker;
        }

        // 打字机效果
        typewriter(dialogue.text || '');

        dialogueIndex++;
    }

    // ── 打字机效果 ──
    function typewriter(text) {
        isTyping = true;
        const textEl = document.getElementById('dialogue-text');
        const hintEl = document.getElementById('dialogue-hint');
        const nextBtn = document.getElementById('dialogue-next-btn');
        hintEl.textContent = '点击加速...';
        nextBtn.disabled = true;

        let charIndex = 0;
        if (typeTimer) clearInterval(typeTimer);

        textEl.innerHTML = '<span class="cursor"></span>';

        typeTimer = setInterval(() => {
            if (charIndex < text.length) {
                textEl.innerHTML = text.substring(0, charIndex + 1) + '<span class="cursor"></span>';
                charIndex++;
                playBlip();
            } else {
                clearInterval(typeTimer);
                typeTimer = null;
                isTyping = false;
                textEl.innerHTML = text;
                hintEl.textContent = '点击或空格继续';
                nextBtn.disabled = false;
            }
        }, 40);
    }

    // ── 跳过打字机 ──
    function skipTypewriter() {
        if (!isTyping) return;
        if (typeTimer) {
            clearInterval(typeTimer);
            typeTimer = null;
        }
        const dialogue = dialogueQueue[dialogueIndex - 1];
        if (dialogue) {
            document.getElementById('dialogue-text').textContent = dialogue.text || '';
        }
        isTyping = false;
        document.getElementById('dialogue-hint').textContent = '点击或空格继续';
        document.getElementById('dialogue-next-btn').disabled = false;
    }

    // ── 播放对话音效 ──
    function playBlip() {
        // 轻量文字音效（可静默）
    }

    // ── 更新立绘 ──
    function updatePortraits(dialogue) {
        const container = document.getElementById('dialogue-characters');
        container.innerHTML = '';

        if (!dialogue.portrait || dialogue.speaker === 'narrator') {
            return;
        }

        const folder = getCharacterPath(dialogue).replace(/\/[^/]+$/, '');
        const jpgName = dialogue.portrait;
        // 优先使用抠图后的透明 PNG，回退到 JPG
        const pngName = jpgName.replace(/\.jpg$/i, '.png');

        const img = document.createElement('img');
        img.className = 'character-portrait speaking';
        img.alt = dialogue.speaker;
        img.dataset.pngUrl = `/shared/assets/characters/${folder}/${pngName}`;
        img.dataset.jpgUrl = `/shared/assets/characters/${folder}/${jpgName}`;
        img.src = img.dataset.pngUrl;

        // PNG 加载失败 → 回退到 JPG
        img.addEventListener('error', function onError() {
            if (this.src === this.dataset.pngUrl) {
                this.src = this.dataset.jpgUrl;
            } else if (this.src === this.dataset.jpgUrl) {
                // JPG 也失败，隐藏
                this.style.visibility = 'hidden';
                this.removeEventListener('error', onError);
            }
        });

        container.appendChild(img);
    }

    // ── 获取角色立绘路径 ──
    function getCharacterPath(dialogue) {
        const speaker = dialogue.speaker;
        const portrait = dialogue.portrait;

        // 根据说话者映射到对应文件夹
        const charMap = {
            '林夜': 'boy',
            '小林夜': 'boy',
            'guide': 'guide',
            '引路人': 'guide',
            '翻覆者': 'flipper',
            '饕餮者': 'glutton',
            '秩序者': 'orderer',
            '算计者': 'calculator',
            '狂乱者': 'chaos',
            '禅定者': 'zen',
            '天道': 'tiandao',
            '陈默': 'chenmo',
            '林父': 'father',
            '班主任': 'teacher',
            '初中班主任': 'teacher',
            '小宇': 'xiaoyu',
        };

        const folder = charMap[speaker] || 'boy';
        return `${folder}/${portrait}`;
    }

    // ── 对话队列结束处理 ──
    function onDialogueQueueEnd() {
        if (currentPhase === 'dialogues_before' && levelData) {
            // Boss 战前对话结束 → 显示选择或进入游戏
            if (levelData.choices && levelData.choices.length > 0) {
                showChoices();
            } else {
                // 无选择，进入游戏
                enterGame();
            }
            return;
        }

        if (currentPhase === 'dialogues' && levelData) {
            // 普通对话结束
            if (levelData.choices && levelData.choices.length > 0) {
                showChoices();
            } else if (levelData.dialogues_after) {
                // 有后置对话（Boss 战后）
                // 先进入游戏，游戏结束后再显示
                enterGame();
            } else {
                // 检查是否有 guide_whisper
                if (levelData.guide_whisper) {
                    showWhisper(levelData.guide_whisper);
                }
                // 完成
                onLevelComplete();
            }
            return;
        }

        if (currentPhase === 'dialogues_after') {
            onLevelComplete();
            return;
        }

        // 序章结束
        if (!currentRealm) {
            markPrologueSeen();
        }
    }

    // ── 显示选择面板 ──
    function showChoices() {
        if (!levelData || !levelData.choices) return;

        const choices = levelData.choices;
        let choiceIndex = 0;
        const choicePanel = choices[choiceIndex];

        // 检查是否应跳过（识破路径下跳过最终选择）
        if (choicePanel.should_skip || (choicePanel.skip_if_exposure_path && storyData?.detection_state?.exposure_path_triggered)) {
            // 跳过选择，直接进入下一阶段
            onChoicesComplete();
            return;
        }

        const panel = document.getElementById('choice-panel');
        const promptEl = document.getElementById('choice-prompt');
        const optionsEl = document.getElementById('choice-options');

        promptEl.textContent = choicePanel.prompt || '请选择';
        optionsEl.innerHTML = '';

        const options = choicePanel.options || [];
        options.forEach((opt, idx) => {
            const optEl = document.createElement('div');
            optEl.className = 'choice-option';

            // 根据 effect 添加颜色标识
            const effect = opt.effect || {};
            if (effect.enlightenment) optEl.classList.add('enlightenment');
            if (effect.corruption) optEl.classList.add('corruption');
            if (effect.rationality) optEl.classList.add('rationality');
            if (effect.emotion) optEl.classList.add('emotion');

            optEl.innerHTML = `
                <span class="choice-option-text">${opt.text}</span>
                ${opt.hint ? `<span class="choice-option-hint">${opt.hint}</span>` : ''}
            `;

            optEl.addEventListener('click', () => onChoiceSelected(choiceIndex, idx));
            optionsEl.appendChild(optEl);
        });

        // 隐藏对话框，显示选择面板
        document.getElementById('dialogue-box').style.display = 'none';
        panel.classList.add('active');
        choicesShown = true;
    }

    // ── 选择被选中 ──
    async function onChoiceSelected(choiceIndex, optionIndex) {
        try {
            const resp = await fetch(`${API_BASE}/api/choices/apply`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    realm: currentRealm,
                    level: currentLevel,
                    choice_index: choiceIndex,
                    option_index: optionIndex,
                }),
            });
            const result = await resp.json();

            // 隐藏选择面板
            document.getElementById('choice-panel').classList.remove('active');
            choicesShown = false;

            // 显示选择后的响应对话
            if (result.response) {
                dialogueQueue = [result.response];
                currentPhase = 'dialogues';
                dialogueIndex = 0;
                showNextDialogue();
                return;
            }

            // 如果直接触发结局
            if (result.ending) {
                window.location.href = `/ending?ending=${result.ending}`;
                return;
            }

            // 检查是否有后续对话（Boss 战后）
            if (levelData.dialogues_after) {
                dialogueQueue = [...levelData.dialogues_after];
                currentPhase = 'dialogues_after';
                dialogueIndex = 0;
                showNextDialogue();
                return;
            }

            onChoicesComplete();
        } catch (e) {
            console.error('选择失败:', e);
        }
    }

    // ── 选择完成 ──
    function onChoicesComplete() {
        if (levelData.dialogues_after) {
            dialogueQueue = [...levelData.dialogues_after];
            currentPhase = 'dialogues_after';
            dialogueIndex = 0;
            showNextDialogue();
        } else {
            onLevelComplete();
        }
    }

    // ── 进入游戏（棋局） ──
    function enterGame() {
        if (!levelData) return;
        const gameType = levelData.game_type || storyData?.current_realm;
        // 跳转到对应棋类游戏
        const gamePorts = {
            heibaiqi: 8005, tiaoqi: 8004, dongwuqi: 8003,
            xiangqi: 8000, weiqi: 8002, wuziqi: 8001,
        };
        const port = gamePorts[gameType];
        if (port) {
            window.location.href = `http://${window.location.hostname}:${port}/`;
        }
    }

    // ── 关卡完成 ──
    function onLevelComplete() {
        // 检查 guide_whisper
        if (levelData && levelData.guide_whisper) {
            showWhisper(levelData.guide_whisper, () => {
                checkNextStep();
            });
        } else {
            checkNextStep();
        }
    }

    // ── 检查下一步 ──
    function checkNextStep() {
        // 如果是最终关，检查是否需要进入天道 Boss 战
        if (storyData?.should_trigger_boss || storyData?.tiandao_boss_state?.can_enter) {
            window.location.href = '/heaven-boss';
            return;
        }

        // 显示完成提示
        const box = document.getElementById('dialogue-box');
        box.innerHTML = `
            <div style="text-align:center; padding:20px;">
                <div style="font-size:20px; color:var(--accent-gold); margin-bottom:12px;">剧情完成</div>
                <div style="font-size:14px; color:var(--text-dim); margin-bottom:20px;">点击进入下一关或返回总坛</div>
                <a href="/hub" style="color:var(--accent-gold); text-decoration:none; border:1px solid var(--accent-gold); padding:8px 24px; border-radius:4px;">返回总坛</a>
            </div>
        `;
        box.style.display = 'block';
    }

    // ── 显示低语 ──
    function showWhisper(text, callback) {
        const overlay = document.getElementById('prayer-overlay');
        const whisperEl = document.getElementById('whisper-text');
        whisperEl.textContent = text;
        overlay.classList.add('active');
        whisperEl.classList.add('show');

        setTimeout(() => {
            overlay.classList.remove('active');
            whisperEl.classList.remove('show');
            if (callback) callback();
        }, 3000);
    }

    // ── 标记序章已看 ──
    async function markPrologueSeen() {
        try {
            await fetch(`${API_BASE}/api/story/mark-prologue-seen`, { method: 'POST' });
        } catch (e) {}
        const box = document.getElementById('dialogue-box');
        box.innerHTML = `
            <div style="text-align:center; padding:20px;">
                <div style="font-size:20px; color:var(--accent-gold); margin-bottom:12px;">序章完</div>
                <div style="font-size:14px; color:var(--text-dim); margin-bottom:16px;">轮回之门已开启，前往总坛选择章节</div>
                <a href="/hub" style="color:var(--accent-gold); text-decoration:none; border:1px solid var(--accent-gold); padding:8px 24px; border-radius:4px; display:inline-block; margin-top:12px;">进入总坛 ▶</a>
            </div>
        `;
        box.style.display = 'block';
    }

    // ── 事件绑定 ──
    function bindEvents() {
        const nextBtn = document.getElementById('dialogue-next-btn');
        const box = document.getElementById('dialogue-box');

        function handleNext() {
            if (isTyping) {
                skipTypewriter();
            } else if (!choicesShown) {
                showNextDialogue();
            }
        }

        nextBtn.addEventListener('click', handleNext);
        box.addEventListener('click', handleNext);

        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space' || e.code === 'Enter') {
                e.preventDefault();
                handleNext();
            }
        });
    }

    // ── 启动 ──
    document.addEventListener('DOMContentLoaded', () => {
        bindEvents();
        init();
    });

})();
