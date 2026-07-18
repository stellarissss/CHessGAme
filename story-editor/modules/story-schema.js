/* ═══════════════════════════════════════════════════════════════
   Story Schema - 剧情数据结构定义与校验
   ═══════════════════════════════════════════════════════════════ */

const StorySchema = (() => {

    // ──────────────────────────────────────────────────────────
    // 节点类型定义
    // ──────────────────────────────────────────────────────────
    const NODE_TYPES = {
        dialogue: {
            label: '对话',
            icon: '💬',
            color: '#4ade80',
            description: '角色说话，显示角色名和对话文本',
            defaultData: () => ({
                character_id: '',
                expression: 'neutral',
                text: '',
                next: null
            })
        },
        narration: {
            label: '旁白',
            icon: '📖',
            color: '#60a5fa',
            description: '旁白叙述，无角色名',
            defaultData: () => ({
                text: '',
                next: null
            })
        },
        choice: {
            label: '选择支',
            icon: '🔀',
            color: '#f59e0b',
            description: '玩家选择，分支剧情',
            defaultData: () => ({
                options: [
                    { text: '选项一', next_scene_id: null, next_node_id: null, condition: null }
                ]
            })
        },
        jump: {
            label: '跳转',
            icon: '➡️',
            color: '#a78bfa',
            description: '跳转到指定场景的指定节点',
            defaultData: () => ({
                target_scene_id: null,
                target_node_id: null
            })
        },
        condition: {
            label: '条件分支',
            icon: '❓',
            color: '#f472b6',
            description: '根据变量值判断走不同分支',
            defaultData: () => ({
                variable: '',
                operator: '==',
                value: '',
                true_next: null,
                false_next: null
            })
        },
        set_var: {
            label: '设置变量',
            icon: '⚙️',
            color: '#fb923c',
            description: '设置或修改变量值',
            defaultData: () => ({
                variable: '',
                value: '',
                operation: 'set',
                next: null
            })
        },
        bg: {
            label: '切换背景',
            icon: '🖼️',
            color: '#38bdf8',
            description: '切换场景背景图',
            defaultData: () => ({
                bg_id: '',
                transition: 'fade',
                next: null
            })
        },
        show_char: {
            label: '显示角色',
            icon: '👤',
            color: '#34d399',
            description: '在指定位置显示角色立绘',
            defaultData: () => ({
                character_id: '',
                expression: 'neutral',
                position: 'center',
                transition: 'fade',
                next: null
            })
        },
        hide_char: {
            label: '隐藏角色',
            icon: '👻',
            color: '#94a3b8',
            description: '隐藏指定角色立绘',
            defaultData: () => ({
                character_id: '',
                transition: 'fade',
                next: null
            })
        },
        wait: {
            label: '等待',
            icon: '⏱️',
            color: '#eab308',
            description: '延时等待指定毫秒',
            defaultData: () => ({
                duration_ms: 1000,
                next: null
            })
        },
        effect: {
            label: '特效',
            icon: '✨',
            color: '#c084fc',
            description: '屏幕特效（震动/闪白/渐暗等）',
            defaultData: () => ({
                effect_type: 'shake',
                params: '{}',
                next: null
            })
        },
        sound: {
            label: '音效',
            icon: '🔊',
            color: '#2dd4bf',
            description: '播放/停止 音效或BGM',
            defaultData: () => ({
                sound_id: '',
                action: 'play',
                volume: 1.0,
                next: null
            })
        },
        end: {
            label: '结局',
            icon: '🏁',
            color: '#ef4444',
            description: '剧情结束，标记结局类型',
            defaultData: () => ({
                ending_type: 'neutral',
                text: ''
            })
        }
    };

    // ──────────────────────────────────────────────────────────
    // 工具函数
    // ──────────────────────────────────────────────────────────
    function genId(prefix = 'node') {
        return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
    }

    function createNode(type, data = {}) {
        const def = NODE_TYPES[type];
        if (!def) throw new Error('Unknown node type: ' + type);
        const nodeData = def.defaultData();
        Object.assign(nodeData, data);
        return {
            id: genId('node'),
            type: type,
            data: nodeData,
            x: 100,
            y: 100
        };
    }

    function createScene(name = '新场景') {
        const startNode = createNode('narration', { text: '开始你的故事...' });
        return {
            id: genId('scene'),
            name: name,
            start_node_id: startNode.id,
            nodes: [startNode]
        };
    }

    function createStory(title = '未命名剧情') {
        const scene = createScene('序幕');
        return {
            meta: {
                title: title,
                author: '',
                version: '1.0.0',
                description: '',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            },
            characters: [],
            backgrounds: [],
            variables: {},
            scenes: [scene],
            start_scene_id: scene.id
        };
    }

    // ──────────────────────────────────────────────────────────
    // 校验
    // ──────────────────────────────────────────────────────────
    function validateStory(story) {
        const errors = [];
        if (!story || typeof story !== 'object') {
            return ['story must be an object'];
        }
        if (!story.meta || typeof story.meta !== 'object') {
            errors.push('missing meta');
        }
        if (!Array.isArray(story.scenes)) {
            errors.push('scenes must be an array');
        } else {
            const sceneIds = new Set();
            for (const scene of story.scenes) {
                if (!scene.id) errors.push('scene missing id');
                if (sceneIds.has(scene.id)) errors.push('duplicate scene id: ' + scene.id);
                sceneIds.add(scene.id);
                if (!Array.isArray(scene.nodes)) {
                    errors.push('scene ' + (scene.id || '(no id)') + ' has no nodes array');
                    continue;
                }
                const nodeIds = new Set();
                for (const node of scene.nodes) {
                    if (!node.id) errors.push('node missing id in scene ' + scene.id);
                    if (nodeIds.has(node.id)) errors.push('duplicate node id: ' + node.id + ' in ' + scene.id);
                    nodeIds.add(node.id);
                    if (!NODE_TYPES[node.type]) errors.push('unknown node type: ' + node.type);
                }
                if (scene.start_node_id && !nodeIds.has(scene.start_node_id)) {
                    errors.push('scene ' + scene.id + ' start_node_id not found: ' + scene.start_node_id);
                }
            }
        }
        return errors;
    }

    // ──────────────────────────────────────────────────────────
    // 导出
    // ──────────────────────────────────────────────────────────
    return {
        NODE_TYPES,
        genId,
        createNode,
        createScene,
        createStory,
        validateStory
    };

})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = StorySchema;
}
