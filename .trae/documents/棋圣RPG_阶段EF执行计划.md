# 棋圣 RPG 项目 — 阶段 E + F 执行计划

**日期**：2026-07-19
**版本**：v2.1 执行计划
**作者**：继任开发者 GLM-5.2
**关联文档**：[棋圣RPG_继任开发计划.md](file:///workspace/.trae/documents/棋圣RPG_继任开发计划.md)

---

## 一、当前状态摘要（Phase 1 探索结论）

### 已落地（阶段 A-D 全部完成）
| 阶段 | 任务 | 状态 | 关键证据 |
|---|---|---|---|
| A | go/ 集成修复 | ✅ | `go/main.py` 端口 8002、3 个 `/api/rpg/*` 路由齐备、`go/static/index.html` 引入 rpg_adapter.js |
| B | U3 重构（直接改源码） | ✅ | `rpg_shell.js` 第 72-74/126-130 行有 `__RPG_TITLE_ACTIVE` 守卫；`rpg_extras.js` 已移除 monkey-patch |
| C | U6 章节背景图片化 | ✅ | ch00-ch06 主背景均为 image 类型；`assets/bgs/` 8 个 PNG 就位 |
| D | U7 ch03/ch06 扩展 | ✅ | ch03 4场景33节点、ch06 3场景24节点；「围棋局暂缺」字样已清除 |
| 像素资产 | U2 15 个 PNG | ✅ | `manifest.json` 15/15 ok=true |

### 待执行
| 阶段 | 任务 | 状态 | 阻塞 |
|---|---|---|---|
| E | U8 端到端测试 | 🚧 脚本就绪未运行 | 无阻塞，可直接执行 |
| F | 计划书 v2.0 → v2.1 | ⏳ 待执行 | 无阻塞，但需基于 E 的测试结果决定是否需要修复 |

### 关键文件清单（Phase 1 已核查存在）
- `/workspace/.trae/documents/e2e_test.py`（242 行 / 10 用例）
- `/workspace/.trae/documents/棋圣RPG_继任开发计划.md`（360 行）
- `/data/user/skills/webapp-testing/scripts/with_server.py`（106 行，多服务启动器）
- `/workspace/项目计划书_RPG大游戏.md`（v2.0，待更新）
- `/workspace/api密钥.txt`（DeepSeek + Seedream Key 均存在）

---

## 二、阶段 E：运行端到端测试（U8）

### E1. 启动 4 服务 + 运行 e2e_test.py

**命令**：
```bash
python /data/user/skills/webapp-testing/scripts/with_server.py \
  --server "cd /workspace/xiangqi && python main.py" --port 8000 \
  --server "cd /workspace/wuziqi && python main.py" --port 8001 \
  --server "cd /workspace/go && python main.py" --port 8002 \
  --server "cd /workspace/shared/rpg && python rpg_server.py" --port 80 \
  --timeout 60 \
  -- python /workspace/.trae/documents/e2e_test.py
```

**预期**：
- with_server.py 启动 4 个服务并探活端口
- 全部就绪后执行 e2e_test.py（sync_playwright + headless chromium）
- 10 个用例依次执行，截图保存到 `/workspace/.trae/documents/screenshots/`
- with_server.py finally 块清理所有服务进程

### E2. 收集测试结果

**预期通过用例**（10/10）：
1. 标题屏显示（`#rpg-title-screen` + 「棋圣」标题）
2. 开始游戏 → 序章 VN 切换
3. 文档模态框打开（? 按钮触发）
4. Esc 关闭文档模态框
5. 章节抽屉 7 章节
6. ch03 不再含「围棋局暂缺」
7. ch06 不再含「围棋局暂缺」
8. go 服务健康探活（`/api/rpg/health/go`）
9. go `/api/rpg/reset_battle` 路由可用
10. 像素资产可访问

### E3. 失败用例定位与修复策略

若某些用例失败，按下列决策树定位：

| 失败用例 | 可能原因 | 修复入口 |
|---|---|---|
| 用例 1-2（标题屏/VN） | rpg_shell.html 元素缺失或 rpg_extras.js 守卫失效 | `rpg_shell.html` / `rpg_extras.js` |
| 用例 3-4（文档模态框） | `#rpg-manual-modal` 或 `#rpg-btn-help` 缺失 / 事件绑定失败 | `rpg_shell.html` / `rpg_extras.js` |
| 用例 5（章节抽屉） | `/api/rpg/chapters` 路由异常 / 7 章节配置缺失 | `rpg_server.py` CHAPTERS 配置 |
| 用例 6-7（ch03/ch06） | 章节未加载或仍含「围棋局暂缺」 | `rpg_data/chapters/ch03_go_intro.json` / `ch06_finale_go.json` |
| 用例 8（go 健康） | go 服务未启动 / `/api/rpg/health/go` 路由异常 | `rpg_server.py` 健康检查 / `go/main.py` 启动 |
| 用例 9（reset_battle） | go/main.py 路由实现缺失 | `go/main.py` 第 728-732 行 |
| 用例 10（像素资产） | 静态文件挂载路径错误 / 资产缺失 | `rpg_server.py` StaticFiles 挂载 / `assets/manifest.json` |

### E4. 修复后重新运行

若 E3 触发了修复，则重新执行 E1 命令直到 10/10 通过或确认某用例需要降级处理。

### E5. 测试通过后的产物
- 截图目录：`/workspace/.trae/documents/screenshots/`（包含标题屏、VN、文档模态框、章节抽屉等截图）
- 测试日志：终端输出（保存到内存，作为阶段 F 变更记录的依据）

---

## 三、阶段 F：更新计划书 v2.0 → v2.1

### F1. 更新第 1.1 节「已完成且可用」清单

**新增条目**：
- **棋类子项目 `go/`**：端口 8002，已实现 `/api/rpg/apply_patch`、`/api/rpg/apply_rules`、`/api/rpg/reset_battle` 三个 RPG 代理路由；前端已引入 rpg_adapter.js
- **像素资产（U2）**：15 个 PNG 全部生成完毕（8 bgs + 5 icons + 2 ui），`assets/manifest.json` 15/15 ok=true
- **标题屏 + 加载遮罩（U3）**：`#rpg-title-screen`（含 logo/标题/4 菜单按钮/粒子动画）+ `#rpg-loading` 加载遮罩；按 D7-revised 决策直接修改 rpg_shell.js 源码添加 `__RPG_TITLE_ACTIVE` 守卫，移除 monkey-patch
- **游玩文档模态框（U4）**：`#rpg-manual-modal`（7 段文档：游戏理念/能量条/识破概率/作弊示例/三个结局/游戏流程/操作要点）+ 顶栏 `?` 帮助按钮
- **rpg_extras.js**：336 行，负责标题屏 UI / 加载遮罩 / 文档模态框 / 教程入口 / 章节背景切换 / 设置状态显示
- **ch01 教程扩展（U5）**：6 场景 46 节点
- **ch03 围棋章节完整剧情（U7）**：4 场景 33 节点（云子山·初遇 / 围棋之道 / 战前对白 / 开局）
- **ch06 终局章节完整剧情（U7）**：3 场景 24 节点（执念之渊 / 最终对白 / 终局之战）
- **章节背景图片化（U6）**：ch00-ch06 主背景均改为 image 类型，引用 `/shared/rpg/assets/bgs/*.png`
- **端到端测试脚本（U8）**：`/workspace/.trae/documents/e2e_test.py`（10 用例覆盖标题屏/VN/文档/章节抽屉/ch03+ch06/go 健康/RPG 路由/资产可访问性）

### F2. 更新第 1.2 节「未完成」清单

**调整条目**：
- U1 围棋接入：✅ 完成
- U2 像素画资产：✅ 完成
- U3 标题屏 + 加载遮罩 + rpg_extras.js：✅ 完成（按 D7-revised）
- U4 游玩文档模态框：✅ 完成
- U5 ch01 教程扩展：✅ 完成（6 场景 46 节点）
- U6 章节背景图片化：✅ 完成
- U7 ch02-ch06 完整剧情：🟡 **部分完成**（ch03/ch06 已完成；ch02/ch04/ch05 仍为骨架）
- U8 Playwright 端到端测试：✅ 完成
- U9 存档系统：⏳ 低优先级，未实现
- U10 BGM/音效：⏳ 低优先级，未实现
- U11 设置菜单扩展：⏳ 低优先级，未实现
- U12 章节切换动画：⏳ 低优先级，未实现

### F3. 更新第 7.2 节 D7 决策（D7 → D7-revised）

**原 D7 决策**：monkey-patch `RpgShell.loadChapter` 拦截章节加载
**失效原因**：`RpgShell` 是 IIFE 返回的顶层 const，非 window 属性；内部 `_goNextChapter`/`_renderChapterList` 走闭包引用，monkey-patch 只能拦截外部调用

**新 D7-revised 决策**：直接修改 `rpg_shell.js` 源码，在 `init()` 与 `loadChapter()` 入口添加 `__RPG_TITLE_ACTIVE` 守卫；`rpg_extras.js` 只负责 UI 与 `__RPG_TITLE_ACTIVE` 标志的生命周期管理

**实现位置**：
- `rpg_shell.js` 第 72-74 行（init 守卫）
- `rpg_shell.js` 第 126-130 行（loadChapter 守卫）
- `rpg_extras.js` 第 13 行（启动时设 `window.__RPG_TITLE_ACTIVE = true`）
- `rpg_extras.js` 第 96 行（点击「开始游戏」后设 `false` 并触发 loadChapter）

### F4. 第 9 章「变更记录」新增 2026-07-19 v2.1 条目

**模板**：
```markdown
### 2026-07-19 v2.1 — 继任开发者 GLM-5.2

**核心改动**：完成阶段 A-F 全部开发任务，计划书与代码状态对齐。

#### 新增 / 修复
1. **[阶段 A] go/ 围棋服务集成修复**
   - `go/main.py` 端口 8000 → 8002，URL 同步更新
   - `go/main.py` 新增 3 个 RPG 代理路由：`/api/rpg/apply_patch`、`/api/rpg/apply_rules`、`/api/rpg/reset_battle`
   - `go/static/index.html` 引入 `rpg_adapter.js`

2. **[阶段 B / U3] 标题屏 + 加载遮罩 + rpg_extras.js（D7-revised）**
   - `rpg_shell.js` 直接添加 `__RPG_TITLE_ACTIVE` 守卫（init + loadChapter）
   - `rpg_extras.js` 移除 monkey-patch 逻辑，改为 UI 与标志管理
   - `rpg_shell.html` 新增标题屏 / 加载遮罩 / 文档模态框 / ? 帮助按钮

3. **[阶段 C / U6] 章节背景图片化**
   - ch00-ch06 主背景 solid → image，引用 `/shared/rpg/assets/bgs/*.png`

4. **[阶段 D / U7] ch03/ch06 完整剧情扩展**
   - ch03_go_intro.json：4 场景 33 节点（云子山·初遇 / 围棋之道 / 战前对白 / 开局）
   - ch06_finale_go.json：3 场景 24 节点（执念之渊 / 最终对白 / 终局之战）

5. **[阶段 E / U8] 端到端测试**
   - `/workspace/.trae/documents/e2e_test.py`（10 用例）
   - 使用 webapp-testing skill 的 with_server.py 启动 4 服务

6. **[阶段 F] 计划书同步**
   - 1.1/1.2 节状态对齐磁盘真实状态
   - 7.2 节 D7 → D7-revised
   - 本条变更记录

#### 文件清单
- 修改：`go/main.py`、`go/static/index.html`、`shared/rpg/rpg_shell.js`、`shared/rpg/rpg_extras.js`、`shared/rpg/rpg_shell.html`、`rpg_data/chapters/ch02_city_xiangqi.json`、`rpg_data/chapters/ch03_go_intro.json`、`rpg_data/chapters/ch04_boss_wuziqi.json`、`rpg_data/chapters/ch05_final_xiangqi.json`、`rpg_data/chapters/ch06_finale_go.json`、`项目计划书_RPG大游戏.md`
- 新增：`.trae/documents/e2e_test.py`、`.trae/documents/棋圣RPG_继任开发计划.md`、`.trae/documents/棋圣RPG_阶段EF执行计划.md`、`.trae/documents/screenshots/`

#### 测试结果
- E2E 测试：10/10 通过（待 E1 执行后填入实际结果）
- 截图目录：`.trae/documents/screenshots/`
```

### F5. 更新计划书头部版本号

- 第 6 行：`**版本**：v2.0（基于真实代码核查重写）` → `**版本**：v2.1（继任开发阶段 A-F 全部完成）`
- 第 7 行：日期 `2026-07-18` → `2026-07-19`

---

## 四、假设与决策

### 假设
1. 阶段 A-D 的代码改动已稳定（Phase 1 探索确认守卫/路由/章节 JSON/资产均到位）
2. e2e_test.py 10 个用例的断言与当前代码状态一致（探索报告确认用例覆盖了已实现的功能）
3. 4 个服务（xiangqi/wuziqi/go/rpg）的依赖已安装（前序工作已 `pip install -r /workspace/requirements.txt`）
4. with_server.py 的 60 秒超时足够 4 个服务启动（默认 30 秒，加 --timeout 60 留余量）

### 决策
| # | 决策 | 理由 |
|---|---|---|
| D-E1 | 直接执行 with_server.py 启动 4 服务 + 运行 e2e_test.py | 脚本已就绪，无歧义 |
| D-E2 | 若个别用例失败，优先修复代码而非放宽断言 | 遵循「稳定性 > 完成度」原则 |
| D-E3 | 若某用例因外部依赖（如网络）失败且无法本地修复，记录为已知问题并降级 | 避免在不可控因素上反复重试 |
| D-F1 | 计划书更新一次性完成 4 个子节（1.1/1.2/7.2/9） | 单次编辑减少版本噪声 |
| D-F2 | 不主动实现 U9-U12 低优先级任务 | 用户明确「不要做计划书外的功能」 |
| D-F3 | 不主动扩展 ch02/ch04/ch05（U7 剩余部分） | 用户原决策只要求 ch03/ch06 完整扩展 |

---

## 五、验证步骤

### 阶段 E 验证
- [ ] with_server.py 启动 4 服务，全部端口探活成功（8000/8001/8002/80）
- [ ] e2e_test.py 10 个用例执行完毕
- [ ] 截图保存到 `/workspace/.trae/documents/screenshots/`
- [ ] 通过用例数 ≥ 9（允许 1 个用例因环境问题降级）
- [ ] 若有失败用例，修复后重新运行直到通过

### 阶段 F 验证
- [ ] `项目计划书_RPG大游戏.md` 版本号更新为 v2.1
- [ ] 第 1.1 节包含 go/、像素资产、标题屏、文档模态框、rpg_extras.js、ch01/ch03/ch06 扩展、U6 背景图片化、U8 测试脚本等条目
- [ ] 第 1.2 节 U1-U8 标记完成状态（U7 标记部分完成）
- [ ] 第 7.2 节 D7 改为 D7-revised，说明 monkey-patch 失效原因与新决策
- [ ] 第 9 章新增 2026-07-19 v2.1 条目，列出阶段 A-F 全部改动
- [ ] 通读计划书无前后矛盾

### 最终验证
- [ ] 计划书 v2.1 与磁盘真实状态一致
- [ ] git status 显示的修改文件清单合理（与 F4 文件清单一致）
- [ ] 用户可基于 v2.1 计划书准确判断项目下一步工作

---

## 六、执行顺序

1. **Phase 4 启动**：用户批准本计划后立即进入执行
2. **执行 E1**：运行 with_server.py + e2e_test.py
3. **执行 E2-E4**（条件性）：若测试失败则修复并重跑
4. **执行 F1-F5**：一次性更新计划书 4 个子节 + 版本号
5. **执行验证**：按第五节清单逐项核查
6. **返回最终响应**：向用户报告阶段 E 测试结果与阶段 F 更新摘要
