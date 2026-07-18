/* ═══════════════════════════════════════════════════════════════
   Variable Manager - 变量管理
   ═══════════════════════════════════════════════════════════════ */

const VariableManager = (() => {

    let app = null;
    let container = null;

    function init(appRef) {
        app = appRef;
        container = document.getElementById('variable-list');

        document.getElementById('btn-add-var').addEventListener('click', () => {
            const name = prompt('变量名:');
            if (!name) return;
            const cleanName = name.trim().replace(/\s+/g, '_');
            if (!cleanName) return;
            const value = prompt('初始值 (数字或字符串):', '0');
            app.state.story.variables[cleanName] = value;
            app.render();
            app.markDirty();
        });
    }

    function render() {
        if (!container) return;

        container.innerHTML = '';
        const vars = app.state.story.variables || {};
        const keys = Object.keys(vars);

        if (keys.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'empty-state';
            empty.style.padding = '20px';
            empty.innerHTML = `
                <div class="empty-icon">⚙️</div>
                <p>暂无变量</p>
            `;
            container.appendChild(empty);
            return;
        }

        keys.forEach(key => {
            const item = document.createElement('div');
            item.className = 'var-item';

            const nameEl = document.createElement('span');
            nameEl.className = 'var-name';
            nameEl.textContent = key;
            nameEl.title = '点击修改变量名';
            nameEl.style.cursor = 'pointer';
            nameEl.onclick = () => renameVar(key);

            const valEl = document.createElement('span');
            valEl.className = 'var-value';
            valEl.textContent = JSON.stringify(vars[key]);
            valEl.title = '点击修改值';
            valEl.style.cursor = 'pointer';
            valEl.onclick = () => editValue(key);

            const delBtn = document.createElement('button');
            delBtn.className = 'btn-icon';
            delBtn.textContent = '✕';
            delBtn.title = '删除变量';
            delBtn.onclick = () => {
                if (confirm(`删除变量 "${key}"？`)) {
                    delete app.state.story.variables[key];
                    app.render();
                    app.markDirty();
                }
            };

            item.appendChild(nameEl);
            item.appendChild(valEl);
            item.appendChild(delBtn);
            container.appendChild(item);
        });

        const hint = document.createElement('div');
        hint.style.fontSize = '10px';
        hint.style.color = 'var(--text-muted)';
        hint.style.padding = '8px';
        hint.style.marginTop = '8px';
        hint.style.borderTop = '1px solid var(--border-color)';
        hint.innerHTML = `
            <strong>用法：</strong><br>
            • 条件分支节点判断变量<br>
            • set_var 节点修改变量<br>
            • 选择支可设置显示条件
        `;
        container.appendChild(hint);
    }

    function renameVar(oldKey) {
        const newKey = prompt('新变量名:', oldKey);
        if (!newKey || newKey === oldKey) return;
        const cleanName = newKey.trim().replace(/\s+/g, '_');
        if (!cleanName || cleanName === oldKey) return;
        if (app.state.story.variables[cleanName]) {
            alert('变量名已存在！');
            return;
        }
        const value = app.state.story.variables[oldKey];
        delete app.state.story.variables[oldKey];
        app.state.story.variables[cleanName] = value;
        app.render();
        app.markDirty();
    }

    function editValue(key) {
        const current = app.state.story.variables[key];
        const val = prompt('变量值:', JSON.stringify(current));
        if (val === null) return;
        // 尝试解析为数字
        const num = Number(val);
        if (!isNaN(num) && val.trim() !== '') {
            app.state.story.variables[key] = num;
        } else if (val === 'true') {
            app.state.story.variables[key] = true;
        } else if (val === 'false') {
            app.state.story.variables[key] = false;
        } else {
            // 去掉首尾引号，作为字符串
            let str = val;
            if ((str.startsWith('"') && str.endsWith('"')) ||
                (str.startsWith("'") && str.endsWith("'"))) {
                str = str.slice(1, -1);
            }
            app.state.story.variables[key] = str;
        }
        app.render();
        app.markDirty();
    }

    function evaluateCondition(variables, variable, operator, value) {
        const left = variables[variable];
        let right = value;

        // 尝试将 value 转为数字
        const numVal = Number(value);
        if (!isNaN(numVal) && value !== '') {
            right = numVal;
        }

        switch (operator) {
            case '==': return left == right;
            case '!=': return left != right;
            case '>': return Number(left) > Number(right);
            case '<': return Number(left) < Number(right);
            case '>=': return Number(left) >= Number(right);
            case '<=': return Number(left) <= Number(right);
            default: return false;
        }
    }

    function applyOperation(variables, variable, operation, value) {
        let val = value;
        const numVal = Number(value);
        if (!isNaN(numVal) && value !== '') {
            val = numVal;
        }

        switch (operation) {
            case 'set':
                variables[variable] = val;
                break;
            case 'add':
                variables[variable] = Number(variables[variable] || 0) + Number(val || 0);
                break;
            case 'sub':
                variables[variable] = Number(variables[variable] || 0) - Number(val || 0);
                break;
            case 'toggle':
                variables[variable] = !variables[variable];
                break;
        }
    }

    return { init, render, evaluateCondition, applyOperation };

})();
