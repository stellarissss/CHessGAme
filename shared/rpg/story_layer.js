/* ═══════════════════════════════════════════════════════════════
   StoryLayer - RPG 剧情层封装
   基于 Preview.playStory()，提供章节播放 / 对手台词 / 系统消息。
   ═══════════════════════════════════════════════════════════════ */

const StoryLayer = (() => {

    let vnStage = null;
    let onEndCallback = null;
    let isShowing = false;

    function init() {
        vnStage = document.getElementById('vn-stage');
        if (typeof Preview !== 'undefined') {
            Preview.init();
            Preview.setOnEnd((info) => {
                _handleEnd(info);
            });
        }
    }

    function _handleEnd(info) {
        // end 节点或故事流自然结束
        const cb = onEndCallback;
        onEndCallback = null;
        // 短暂停留后隐藏
        setTimeout(() => {
            if (cb) cb(info);
        }, 100);
    }

    function show() {
        if (!vnStage) return;
        vnStage.style.display = 'block';
        isShowing = true;
    }

    function hide() {
        if (!vnStage) return;
        vnStage.style.display = 'none';
        isShowing = false;
        if (typeof Preview !== 'undefined') {
            Preview.reset();
        }
    }

    /**
     * 播放章节剧情
     * @param {string} storyId - rpg_data/chapters/{storyId}.json
     * @param {string} startSceneId - 起始场景 id（可选，默认用 story.start_scene_id）
     * @param {object} opts - { onEnd: 回调 }
     */
    async function playChapter(storyId, startSceneId, opts = {}) {
        try {
            const resp = await fetch(`/api/rpg/vn/${storyId}`);
            if (!resp.ok) {
                throw new Error(`加载章节失败: ${resp.status}`);
            }
            const storyData = await resp.json();
            onEndCallback = opts.onEnd || null;
            show();
            Preview.playStory(storyData, startSceneId, {
                onEnd: (info) => _handleEnd(info),
            });
        } catch (e) {
            console.error('[StoryLayer] playChapter failed:', e);
            _fallbackAlert(`章节加载失败: ${e.message}`);
        }
    }

    /**
     * 播放对手合理化台词（核心爽点）
     * 动态构造临时 story JSON：1 个 dialogue + 1 个 end
     */
    function playOpponentDialogue(charId, charName, text, opts = {}) {
        const tempStory = {
            characters: [{
                id: charId,
                name: charName || '对手',
                color: '#ef4444',
                portraits: _getCharacterPortraits(charId),
            }],
            backgrounds: [
                { id: 'bg_black', name: '黑屏', type: 'solid', color: '#000000' },
            ],
            variables: {},
            start_scene_id: 'scene_opponent_dialogue',
            scenes: [{
                id: 'scene_opponent_dialogue',
                name: '对手台词',
                start_node_id: 'node_1',
                nodes: [
                    {
                        id: 'node_1',
                        type: 'bg',
                        x: 100, y: 100,
                        data: { bg_id: 'bg_black', transition: 'fade', next: 'node_2' },
                    },
                    {
                        id: 'node_2',
                        type: 'show_char',
                        x: 200, y: 100,
                        data: {
                            character_id: charId,
                            expression: _getOpponentExpression(),
                            position: 'center',
                            transition: 'fade',
                            next: 'node_3',
                        },
                    },
                    {
                        id: 'node_3',
                        type: 'dialogue',
                        x: 300, y: 100,
                        data: {
                            character_id: charId,
                            expression: _getOpponentExpression(),
                            text: text,
                            next: 'node_4',
                        },
                    },
                    {
                        id: 'node_4',
                        type: 'end',
                        x: 400, y: 100,
                        data: {
                            ending_type: 'neutral',
                            text: '（对手的认知已被扭曲……）',
                        },
                    },
                ],
            }],
        };

        onEndCallback = opts.onEnd || null;
        show();
        Preview.playStory(tempStory, 'scene_opponent_dialogue', {
            onEnd: (info) => _handleEnd(info),
        });
    }

    /**
     * 播放棋圣系统消息（用 robot 立绘）
     */
    function playSystemMessage(text, opts = {}) {
        const tempStory = {
            characters: [{
                id: 'robot',
                name: '棋圣系统',
                color: '#06b6d4',
                portraits: _getCharacterPortraits('robot'),
            }],
            backgrounds: [
                { id: 'bg_cyber', name: '网络空间', type: 'solid', color: '#0a1628' },
            ],
            variables: {},
            start_scene_id: 'scene_system_msg',
            scenes: [{
                id: 'scene_system_msg',
                name: '系统消息',
                start_node_id: 'node_1',
                nodes: [
                    {
                        id: 'node_1',
                        type: 'bg',
                        x: 100, y: 100,
                        data: { bg_id: 'bg_cyber', transition: 'fade', next: 'node_2' },
                    },
                    {
                        id: 'node_2',
                        type: 'show_char',
                        x: 200, y: 100,
                        data: {
                            character_id: 'robot',
                            expression: 'front_idle',
                            position: 'center',
                            transition: 'fade',
                            next: 'node_3',
                        },
                    },
                    {
                        id: 'node_3',
                        type: 'dialogue',
                        x: 300, y: 100,
                        data: {
                            character_id: 'robot',
                            expression: 'scheming',
                            text: text,
                            next: 'node_4',
                        },
                    },
                    {
                        id: 'node_4',
                        type: 'end',
                        x: 400, y: 100,
                        data: { ending_type: 'neutral', text: '' },
                    },
                ],
            }],
        };

        onEndCallback = opts.onEnd || null;
        show();
        Preview.playStory(tempStory, 'scene_system_msg', {
            onEnd: (info) => _handleEnd(info),
        });
    }

    /**
     * 播放纯旁白
     */
    function playNarration(text, opts = {}) {
        const tempStory = {
            characters: [],
            backgrounds: [
                { id: 'bg_black', name: '黑屏', type: 'solid', color: '#000000' },
            ],
            variables: {},
            start_scene_id: 'scene_narration',
            scenes: [{
                id: 'scene_narration',
                name: '旁白',
                start_node_id: 'node_1',
                nodes: [
                    {
                        id: 'node_1',
                        type: 'bg',
                        x: 100, y: 100,
                        data: { bg_id: 'bg_black', transition: 'fade', next: 'node_2' },
                    },
                    {
                        id: 'node_2',
                        type: 'narration',
                        x: 200, y: 100,
                        data: { text: text, next: 'node_3' },
                    },
                    {
                        id: 'node_3',
                        type: 'end',
                        x: 300, y: 100,
                        data: { ending_type: 'neutral', text: '' },
                    },
                ],
            }],
        };

        onEndCallback = opts.onEnd || null;
        show();
        Preview.playStory(tempStory, 'scene_narration', {
            onEnd: (info) => _handleEnd(info),
        });
    }

    // ---------- 辅助 ----------

    function _getCharacterPortraits(charId) {
        // 立绘路径与 xiangqi/wuziqi 共用：/assets/characters/{charId}/{charId}_{expression}.png
        if (charId === 'boy') {
            return [
                { expression: 'neutral', image: '/shared/assets/characters/boy/boy_neutral.png' },
                { expression: 'thinking', image: '/shared/assets/characters/boy/boy_thinking.png' },
                { expression: 'surprised', image: '/shared/assets/characters/boy/boy_surprised.png' },
                { expression: 'happy', image: '/shared/assets/characters/boy/boy_happy.png' },
                { expression: 'sad', image: '/shared/assets/characters/boy/boy_sad.png' },
                { expression: 'determined', image: '/shared/assets/characters/boy/boy_determined.png' },
                { expression: 'confident', image: '/shared/assets/characters/boy/boy_confident.png' },
                { expression: 'defeated', image: '/shared/assets/characters/boy/boy_defeated.png' },
                { expression: 'victory', image: '/shared/assets/characters/boy/boy_victory.png' },
            ];
        }
        if (charId === 'robot') {
            return [
                { expression: 'front_idle', image: '/shared/assets/characters/robot/robot_front_idle.png' },
                { expression: 'thinking', image: '/shared/assets/characters/robot/robot_thinking.png' },
                { expression: 'scheming', image: '/shared/assets/characters/robot/robot_scheming.png' },
                { expression: 'surprised', image: '/shared/assets/characters/robot/robot_surprised.png' },
                { expression: 'angry', image: '/shared/assets/characters/robot/robot_angry.png' },
                { expression: 'laughing', image: '/shared/assets/characters/robot/robot_laughing.png' },
                { expression: 'victory', image: '/shared/assets/characters/robot/robot_victory.png' },
                { expression: 'defeat', image: '/shared/assets/characters/robot/robot_defeat.png' },
            ];
        }
        return [];
    }

    function _getOpponentExpression() {
        // 对手合理化台词时的表情：默认 scheming（阴谋）
        return 'scheming';
    }

    function _fallbackAlert(text) {
        // preview.js 播放失败的兜底
        alert(text);
    }

    function isPlaying() {
        return isShowing;
    }

    return {
        init,
        show,
        hide,
        playChapter,
        playOpponentDialogue,
        playSystemMessage,
        playNarration,
        isPlaying,
    };

})();
