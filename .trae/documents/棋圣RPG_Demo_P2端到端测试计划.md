# 棋圣 RPG Demo — P2 阶段 H 端到端测试计划

## 摘要

本计划是「棋圣 RPG Demo」收尾工作的最后阶段（P2 阶段 H）。
P0（cost_energy 链路修复）与 P1（dry_run 支持、纯 VN 章节自动推进、7 个章节 JSON、24 条对手台词）已全部完成。
本阶段只做**只读校验 + 服务启动 + 端到端冒烟测试**，不再修改业务代码（除非测试中发现 BUG）。

执行完毕后，应满足执行方案.md「验证标准」中的 9 项自测。

---

## 当前状态分析（Phase 1 探索结论）

### 已完成且已验证的文件

| 类别 | 文件 | 状态 |
|---|---|---|
| 后端 cost_energy | `xiangqi/ai_orchestrator.py` | 13 处 cost_energy 命中 ✓ |
| 后端 cost_energy | `wuziqi/ai_orchestrator.py` | 13 处 cost_energy 命中 ✓ |
| Prompt 扩展 | `xiangqi/prompts.py` / `wuziqi/prompts.py` | INTENT_PARSER_SYSTEM 已含 cost_energy 文档 ✓ |
| dry_run 支持 | `xiangqi/main.py` / `wuziqi/main.py` | 6 处 dry_run 命中 ✓ |
| 端口配置 | `xiangqi/main.py` | port=8000 ✓ |
| 端口配置 | `wuziqi/main.py` | port=8001 ✓ |
| RPG 后端 | `shared/rpg/rpg_server.py` | port=80，11 条路由 ✓ |
| 流程修复 | `shared/rpg/rpg_shell.js` | `_goNextChapter` 在 141/341/346/378 行 ✓ |
| 对手台词 | `shared/rpg/dialogue_templates.json` | 6 类 × 4 条 = 24 条 ✓ |
| 章节 JSON | `rpg_data/chapters/ch00-ch06` | 7 个文件齐全 ✓ |

### 已确认的架构事实

- **go/ 目录不存在**（D1 决策：跳过实现，ch03/ch06 章节为降级骨架，`service_up` 将返回 false）
- **API 密钥文件**：`xiangqi/api密钥.txt`（rpg_server 启动时自动读取）
- **rpg_server 路由清单**：`/` `/api/rpg/chapters` `/api/rpg/chapter/{id}` `/api/rpg/battle/start` `/api/rpg/cheat/assess` `/api/rpg/cheat/use` `/api/rpg/move_complete` `/api/rpg/battle/end` `/api/rpg/state` `/api/rpg/vn/{story_id}` `/api/rpg/apikey` `/api/rpg/health/{chess_type}`
- **跨域**：`allow_origins=["*"]` 已开启
- **静态资源**：`/shared/assets/characters/boy/` + `/shared/assets/characters/robot/` 由 rpg_server 挂载

---

## 测试计划（3 步）

### 步骤 15：静态校验（py_compile + JSON 校验）

**目标**：在不启动服务的前提下，捕获所有语法/格式错误。

**操作**：

```bash
# 15.1 Python 语法校验（所有改动过的 .py）
python -m py_compile \
  /workspace/xiangqi/ai_orchestrator.py \
  /workspace/xiangqi/main.py \
  /workspace/xiangqi/prompts.py \
  /workspace/wuziqi/ai_orchestrator.py \
  /workspace/wuziqi/main.py \
  /workspace/wuziqi/prompts.py \
  /workspace/shared/rpg/rpg_server.py

# 15.2 JSON 格式校验（所有新建 JSON）
python -c "
import json, sys
files = [
  '/workspace/shared/rpg/dialogue_templates.json',
  '/workspace/rpg_data/chapters/ch00_prologue.json',
  '/workspace/rpg_data/chapters/ch01_tutorial_wuziqi.json',
  '/workspace/rpg_data/chapters/ch02_city_xiangqi.json',
  '/workspace/rpg_data/chapters/ch03_go_intro.json',
  '/workspace/rpg_data/chapters/ch04_boss_wuziqi.json',
  '/workspace/rpg_data/chapters/ch05_final_xiangqi.json',
  '/workspace/rpg_data/chapters/ch06_finale_go.json',
]
ok = True
for f in files:
    try:
        json.load(open(f, encoding='utf-8'))
        print('OK  ', f)
    except Exception as e:
        print('FAIL', f, ':', e)
        ok = False
sys.exit(0 if ok else 1)
"
```

**通过标准**：所有 .py 无 SyntaxError；所有 JSON 可被 `json.load` 解析。

---

### 步骤 16：服务启动 + 健康探活

**目标**：启动 3 个服务（go 不启动），验证路由可达。

**操作**：

```bash
# 16.1 后台启动 3 个服务（各自独立终端，非阻塞）
cd /workspace/xiangqi && python main.py &          # 端口 8000
cd /workspace/wuziqi && python main.py &           # 端口 8001
cd /workspace/shared/rpg && python rpg_server.py & # 端口 80

# 16.2 等待 5 秒后健康探活
sleep 5

# 16.3 棋类服务探活（应返回 200 + JSON）
curl -s http://localhost:8000/api/config/all | head -c 200
curl -s http://localhost:8001/api/config/all | head -c 200

# 16.4 RPG 服务探活 + 章节列表
curl -s http://localhost/api/rpg/chapters
curl -s http://localhost/api/rpg/health/xiangqi   # 期望 up:true
curl -s http://localhost/api/rpg/health/wuziqi    # 期望 up:true
curl -s http://localhost/api/rpg/health/go        # 期望 up:false（go 未启动）
curl -s http://localhost/api/rpg/state
```

**通过标准**：
- 3 个进程均启动无报错
- xiangqi/wuziqi 健康探活返回 `up:true`
- go 健康探活返回 `up:false`（符合 D1 决策）
- `/api/rpg/chapters` 返回 7 个章节
- `/api/rpg/state` 返回 `energy:0, detection:0, current_chapter:"ch00_prologue"`

---

### 步骤 17：端到端 9 项自测（执行方案验证标准）

**目标**：验证从序章到第 1 章首战的完整链路。

由于无浏览器自动化（CI=true, no TTY），9 项中能自动化验证的用 curl，需浏览器的用 API 链路模拟。

| # | 自测项 | 验证方式 | 通过标准 |
|---|---|---|---|
| 1 | py_compile 无语法错误 | 步骤 15.1 | 退出码 0 |
| 2 | 启动 4 服务（go 不启动） | 步骤 16.1 | 3 进程存活 |
| 3 | 访问 http://localhost/ 进入序章 | `curl -s http://localhost/ \| grep -c 'rpg-shell'` | 含 RPG 外壳 HTML |
| 4 | 序章 VN 能加载 | `curl -s http://localhost/api/rpg/vn/ch00_prologue \| python -c "import json,sys; d=json.load(sys.stdin); print(len(d.get('scenes',[])))"` | 返回 ≥1 |
| 5 | 第 0 章五子棋教程可加载 | `curl -s http://localhost/api/rpg/vn/ch01_tutorial_wuziqi \| python -c "import json,sys; d=json.load(sys.stdin); print(len(d.get('scenes',[])))"` | 返回 ≥1 |
| 6 | 棋圣系统能评估作弊（assess） | `curl -s -X POST http://localhost/api/rpg/cheat/assess -H 'Content-Type: application/json' -d '{"command":"让我的棋子连成五子","chapter_id":"ch01_tutorial_wuziqi"}'` | 返回 JSON 含 `cost_energy` 字段（若 wuziqi 服务可达，需 API Key；无 Key 时返回明确错误而非 500） |
| 7 | 作弊后触发对手台词 | `curl -s http://localhost/api/rpg/state` 后手动检查 `dialogue_templates.json` 已被加载 | rpg_server 启动日志/状态无异常 |
| 8 | 能量条正确扣减 | `curl -s -X POST http://localhost/api/rpg/move_complete -H 'Content-Type: application/json' -d '{"is_five_in_a_row":true,"mover":"black"}'` | 返回 `energy` 增加 15 |
| 9 | 端到端能从序章打到第 1 章首战 | `curl -s http://localhost/api/rpg/chapter/ch02_city_xiangqi` | 返回 `service_up:true`（xiangqi 在线） |

**注意事项**：
- 自测 6 需要 DeepSeek API Key。若 `xiangqi/api密钥.txt` 存在且有效，rpg_server 会自动加载并广播给棋类服务；若无效，assess 应返回明确错误（非 500 崩溃）。
- 自测 7 的对手台词在 `cheat/use` 成功后由 `rpg_shell.js` 调用 `StoryLayer.playOpponentDialogue()` 触发，需浏览器环境。API 层验证：`rpg_server.get_opponent_dialogue()` 能从 `dialogue_templates.json` 取到非空字符串。
- 自测 8 的 `move_complete` 不要求对战进行中，可直接调用验证能量加成逻辑。

---

## 假设与决策

### 假设

1. **Python 环境已安装** fastapi / uvicorn / httpx / pydantic（前序阶段已验证可启动）
2. **DeepSeek API Key** 在 `xiangqi/api密钥.txt`（rpg_server 自动读取）；若 Key 失效，assess 链路降级但不崩溃
3. **端口 80/8000/8001 空闲**（无占用）
4. **go 服务不启动**（D1 决策保持不变）

### 决策

- **D-T1**：若步骤 15 发现语法错误 → 立即修复后重跑步骤 15，不进入步骤 16。
- **D-T2**：若步骤 16 某服务启动失败 → 排查依赖/端口占用，修复后重启该服务。
- **D-T3**：若步骤 17 自测 6（assess）因 API Key 失败 → 记录为「已知限制」，不阻塞其他自测；自测 6 的最低要求是「不返回 500」。
- **D-T4**：若步骤 17 自测 7（对手台词）因无浏览器无法端到端验证 → 用 `curl http://localhost/api/rpg/state` 间接验证 `dialogue_templates` 已加载（rpg_server 启动时读取），并人工 review `rpg_shell.js` 的 `_onCheatSuccess` 调用链。
- **D-T5**：本阶段**不**修复非阻塞性问题（如样式微调、文案润色），只确保 9 项自测全通过或明确降级。

---

## 验证步骤（本计划自身完成标准）

1. 步骤 15 输出全部 `OK` / 退出码 0
2. 步骤 16 三个 `curl` 健康探活符合预期（xiangqi/wuziqi up:true，go up:false）
3. 步骤 17 9 项自测全部通过或明确标记降级原因
4. 若发现 BUG，修复后回到步骤 15 重跑
5. 全部通过后，向用户汇报最终状态 + 9 项自测结果表

---

## 不在本计划范围内（避免范围蔓延）

- ❌ 不修改业务代码（除非测试发现阻塞性 BUG）
- ❌ 不实现 go/ 子项目（D1 保持）
- ❌ 不补全 ch03-ch06 骨架章节的完整剧情（P1 已定为骨架降级）
- ❌ 不做样式/文案优化
- ❌ 不写新的测试框架/单测代码（只做冒烟测试）
