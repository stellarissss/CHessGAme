/* ═══════════════════════════════════════════════════════════════
   Story IO - 剧情文件存取模块
   ═══════════════════════════════════════════════════════════════ */

const StoryIO = (() => {

    const LS_KEY = 'story-editor-current';
    const LS_LIST_KEY = 'story-editor-list';

    // ──────────────────────────────────────────────────────────
    // LocalStorage 操作
    // ──────────────────────────────────────────────────────────

    function saveCurrent(story) {
        try {
            localStorage.setItem(LS_KEY, JSON.stringify(story));
            return true;
        } catch (e) {
            console.error('Failed to save to localStorage:', e);
            return false;
        }
    }

    function loadCurrent() {
        try {
            const raw = localStorage.getItem(LS_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            console.error('Failed to load from localStorage:', e);
            return null;
        }
    }

    function clearCurrent() {
        localStorage.removeItem(LS_KEY);
    }

    // ──────────────────────────────────────────────────────────
    // 服务器 API 操作
    // ──────────────────────────────────────────────────────────

    async function listStories() {
        try {
            const resp = await fetch('/api/stories');
            if (!resp.ok) return [];
            return await resp.json();
        } catch (e) {
            console.warn('Failed to list stories from server:', e);
            return [];
        }
    }

    async function loadStory(id) {
        try {
            const resp = await fetch(`/api/stories/${encodeURIComponent(id)}`);
            if (!resp.ok) throw new Error('Load failed: ' + resp.status);
            return await resp.json();
        } catch (e) {
            console.error('Failed to load story:', e);
            throw e;
        }
    }

    async function saveStory(story) {
        try {
            const resp = await fetch('/api/stories', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(story)
            });
            if (!resp.ok) throw new Error('Save failed: ' + resp.status);
            return await resp.json();
        } catch (e) {
            console.error('Failed to save story:', e);
            throw e;
        }
    }

    async function deleteStory(id) {
        try {
            const resp = await fetch(`/api/stories/${encodeURIComponent(id)}`, {
                method: 'DELETE'
            });
            if (!resp.ok) throw new Error('Delete failed: ' + resp.status);
            return await resp.json();
        } catch (e) {
            console.error('Failed to delete story:', e);
            throw e;
        }
    }

    // ──────────────────────────────────────────────────────────
    // JSON 文件导入导出
    // ──────────────────────────────────────────────────────────

    function exportJSON(story) {
        const blob = new Blob([JSON.stringify(story, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const safeTitle = (story.meta?.title || 'story').replace(/[\\/:*?"<>|]/g, '_');
        a.download = `${safeTitle}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function importJSON(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    resolve(data);
                } catch (err) {
                    reject(new Error('JSON 解析失败: ' + err.message));
                }
            };
            reader.onerror = () => reject(new Error('文件读取失败'));
            reader.readAsText(file);
        });
    }

    function triggerImportDialog() {
        return new Promise((resolve, reject) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json,application/json';
            input.onchange = () => {
                const file = input.files?.[0];
                if (file) {
                    importJSON(file).then(resolve).catch(reject);
                } else {
                    reject(new Error('未选择文件'));
                }
            };
            input.click();
        });
    }

    return {
        // localStorage
        saveCurrent,
        loadCurrent,
        clearCurrent,
        // server API
        listStories,
        loadStory,
        saveStory,
        deleteStory,
        // file import/export
        exportJSON,
        importJSON,
        triggerImportDialog
    };

})();
