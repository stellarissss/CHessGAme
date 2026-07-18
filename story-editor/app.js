/* ═══════════════════════════════════════════════════════════════
   Story Editor - 主应用
   ═══════════════════════════════════════════════════════════════ */

const app = {
    // 状态
    state: {
        story: null,
        currentSceneId: null,
        selectedNodeId: null,
        dirty: false
    },

    // ═══════════════════════════════════════════════════════════
    // 初始化
    // ═══════════════════════════════════════════════════════════
    async init() {
        // 初始化各模块
        StorySchema; // ensure loaded
        StoryIO;
        Preview.init();
        SceneTree.init(this);
        NodeCanvas.init(this);
        Inspector.init(this);
        CharacterManager.init(this);
        CharacterCreator.init(this);
        BgManager.init(this);
        VariableManager.init(this);

        // 绑定顶栏按钮
        this.bindTopbar();

        // 绑定左侧 tab 切换
        this.bindTabs();

        // 尝试从 localStorage 恢复
        const saved = StoryIO.loadCurrent();
        if (saved) {
            this.state.story = saved;
            this.state.currentSceneId = saved.scenes?.[0]?.id || null;
        } else {
            // 创建新剧情
            this.newStory();
        }

        this.render();
        this.updateTitle();

        // 自动保存到 localStorage
        setInterval(() => {
            if (this.state.dirty) {
                StoryIO.saveCurrent(this.state.story);
                this.state.dirty = false;
            }
        }, 3000);

        // 页面离开提醒
        window.addEventListener('beforeunload', (e) => {
            if (this.state.dirty) {
                e.preventDefault();
                e.returnValue = '';
            }
        });
    },

    bindTopbar() {
        const titleInput = document.getElementById('project-title');
        titleInput.addEventListener('input', () => {
            if (this.state.story) {
                this.state.story.meta.title = titleInput.value;
                this.markDirty();
                this.updateTitle();
            }
        });

        document.getElementById('btn-new').addEventListener('click', () => {
            if (this.state.dirty && !confirm('当前剧情未保存，确定新建？')) return;
            this.newStory();
            this.render();
        });

        document.getElementById('btn-open').addEventListener('click', () => {
            this.openStoryList();
        });

        document.getElementById('btn-save').addEventListener('click', async () => {
            await this.saveToServer();
        });

        document.getElementById('btn-export').addEventListener('click', () => {
            if (this.state.story) {
                StoryIO.exportJSON(this.state.story);
                this.toast('已导出 JSON', 'success');
            }
        });

        document.getElementById('btn-import').addEventListener('click', async () => {
            try {
                const data = await StoryIO.triggerImportDialog();
                if (data && data.scenes) {
                    this.state.story = data;
                    this.state.currentSceneId = data.scenes?.[0]?.id || null;
                    this.state.selectedNodeId = null;
                    this.render();
                    this.markDirty();
                    this.toast('导入成功', 'success');
                } else {
                    this.toast('文件格式不正确', 'error');
                }
            } catch (e) {
                this.toast('导入失败: ' + e.message, 'error');
            }
        });

        // 模态框关闭
        document.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const modalId = e.target.dataset.modal;
                const modal = document.getElementById(modalId);
                if (modal) modal.classList.remove('show');
            });
        });

        // 点击模态框背景关闭
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) modal.classList.remove('show');
            });
        });
    },

    bindTabs() {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const tab = btn.dataset.tab;
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
                btn.classList.add('active');
                document.getElementById('tab-' + tab).classList.add('active');
            });
        });
    },

    // ═══════════════════════════════════════════════════════════
    // 剧情操作
    // ═══════════════════════════════════════════════════════════

    newStory() {
        this.state.story = StorySchema.createStory('我的剧情');
        this.state.currentSceneId = this.state.story.scenes[0].id;
        this.state.selectedNodeId = null;
        this.state.dirty = true;
        this.updateTitle();
    },

    async openStoryList() {
        const list = await StoryIO.listStories();
        const listEl = document.getElementById('story-list');
        listEl.innerHTML = '';

        if (!list || list.length === 0) {
            listEl.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px;">暂无保存的剧情</p>';
        } else {
            list.forEach(s => {
                const item = document.createElement('div');
                item.className = 'story-list-item';
                item.innerHTML = `
                    <div>
                        <div class="story-title">${s.meta?.title || s.id}</div>
                        <div class="story-meta">${s.scenes?.length || 0} 场景 · ${s.meta?.updated_at ? new Date(s.meta.updated_at).toLocaleString() : ''}</div>
                    </div>
                    <div class="story-actions">
                        <button class="btn btn-sm" data-action="load">打开</button>
                        <button class="btn btn-sm btn-danger" data-action="delete">删除</button>
                    </div>
                `;
                item.querySelector('[data-action="load"]').onclick = async () => {
                    try {
                        const story = await StoryIO.loadStory(s.id);
                        this.state.story = story;
                        this.state.currentSceneId = story.scenes?.[0]?.id || null;
                        this.state.selectedNodeId = null;
                        this.state.dirty = false;
                        this.render();
                        document.getElementById('modal-open').classList.remove('show');
                        this.toast('已加载: ' + (story.meta?.title || s.id), 'success');
                    } catch (e) {
                        this.toast('加载失败', 'error');
                    }
                };
                item.querySelector('[data-action="delete"]').onclick = async () => {
                    if (!confirm('确定删除此剧情？')) return;
                    try {
                        await StoryIO.deleteStory(s.id);
                        item.remove();
                        this.toast('已删除', 'success');
                    } catch (e) {
                        this.toast('删除失败', 'error');
                    }
                };
                listEl.appendChild(item);
            });
        }

        document.getElementById('modal-open').classList.add('show');
    },

    async saveToServer() {
        if (!this.state.story) return;
        try {
            // 更新时间
            this.state.story.meta.updated_at = new Date().toISOString();
            const result = await StoryIO.saveStory(this.state.story);
            this.state.dirty = false;
            this.toast('保存成功', 'success');
            return result;
        } catch (e) {
            this.toast('保存失败: ' + e.message, 'error');
            // fallback: 保存到 localStorage
            StoryIO.saveCurrent(this.state.story);
            return null;
        }
    },

    // ═══════════════════════════════════════════════════════════
    // 渲染
    // ═══════════════════════════════════════════════════════════

    render() {
        if (!this.state.story) return;

        // 标题
        const titleInput = document.getElementById('project-title');
        if (titleInput && document.activeElement !== titleInput) {
            titleInput.value = this.state.story.meta.title || '';
        }

        // 各面板
        SceneTree.render();
        NodeCanvas.render();
        Inspector.render();
        CharacterManager.render();
        BgManager.render();
        VariableManager.render();
    },

    // ═══════════════════════════════════════════════════════════
    // 选择操作
    // ═══════════════════════════════════════════════════════════

    selectScene(sceneId) {
        this.state.currentSceneId = sceneId;
        this.state.selectedNodeId = null;
        this.render();
    },

    selectNode(nodeId) {
        this.state.selectedNodeId = nodeId;
        // 只刷新节点画布和检查器
        NodeCanvas.render();
        Inspector.render();
    },

    getCurrentScene() {
        if (!this.state.story || !this.state.currentSceneId) return null;
        return this.state.story.scenes.find(s => s.id === this.state.currentSceneId);
    },

    getSelectedNode() {
        const scene = this.getCurrentScene();
        if (!scene || !this.state.selectedNodeId) return null;
        return scene.nodes.find(n => n.id === this.state.selectedNodeId);
    },

    // ═══════════════════════════════════════════════════════════
    // 工具方法
    // ═══════════════════════════════════════════════════════════

    markDirty() {
        this.state.dirty = true;
        this.updateTitle();
    },

    updateTitle() {
        const title = this.state.story?.meta?.title || '未命名剧情';
        const dirty = this.state.dirty ? ' •' : '';
        document.title = `${title}${dirty} - 剧情编辑器`;
    },

    toast(message, type = 'info') {
        const t = document.createElement('div');
        t.className = 'toast ' + type;
        t.textContent = message;
        document.body.appendChild(t);
        setTimeout(() => {
            t.style.opacity = '0';
            t.style.transform = 'translateX(100%)';
            t.style.transition = 'all 0.3s';
            setTimeout(() => t.remove(), 300);
        }, 2500);
    }
};

// 暴露给全局
window.app = app;

// 启动
document.addEventListener('DOMContentLoaded', () => app.init());
