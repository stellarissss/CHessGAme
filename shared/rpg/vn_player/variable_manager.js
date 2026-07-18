/* ═══════════════════════════════════════════════════════════════
   Variable Manager (RPG 精简版)
   仅保留 evaluateCondition / applyOperation，供 preview.js 调用。
   移除了原 story-editor 中的 init/render 等编辑器逻辑。
   ═══════════════════════════════════════════════════════════════ */

const VariableManager = (() => {

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

    return { evaluateCondition, applyOperation };

})();
