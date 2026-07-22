# 棋圣 ChessSage

**利用AI大模型作弊的棋类策略游戏**

一个基于大语言模型(LLM)的创新棋类游戏平台,玩家可以通过自然语言与AI对战,并体验独特的"作弊"机制。

## 项目简介

棋圣是一个基于AI大模型的棋类策略游戏,核心玩法是**"利用AI大模型作弊"**。游戏支持象棋、围棋、五子棋、动物棋四种棋类,每种都有独特的AI对战机制。

### 核心特性

- **无限制对弈**: 传统棋类规则基础上的AI增强玩法
- **自然语言交互**: 通过命令行与AI对话,以自然语言方式下棋
- **AI策略引擎**: 利用大语言模型的推理能力制定策略
- **多种棋类支持**: 象棋、围棋、五子棋、动物棋各具特色

## 快速开始

### 环境要求

- Python 3.8+
- pip 包管理器

### 安装依赖

```bash
pip install -r requirements.txt
```

### 配置

编辑 `config.json` 文件,配置你的LLM API密钥:

```json
{
  "llm_api_key": "your-api-key-here",
  "llm_model": "gpt-4",
  "llm_base_url": "https://api.openai.com/v1"
}
```

### 启动服务

```bash
python main.py
```

服务启动后,可通过以下地址访问:

- **象棋**: http://localhost:8000/
- **五子棋**: http://localhost:8001/
- **围棋**: http://localhost:8002/
- **动物棋**: http://localhost:8003/

## 项目结构

```
chesssage/
├── main.py              # 统一启动器
├── config.json          # 全局配置文件
├── requirements.txt     # Python 依赖
│
├── xiangqi/             # 无限制象棋
│   ├── main.py          # 象棋服务入口
│   ├── game.py          # 游戏逻辑
│   ├── static/          # 前端界面
│   └── agent.py         # AI Agent
│
├── wuziqi/              # 无限制五子棋
│   ├── main.py          # 五子棋服务入口
│   ├── game.py          # 游戏逻辑
│   ├── static/          # 前端界面
│   └── agent.py         # AI Agent
│
└── go/                  # 无限制围棋
    ├── main.py          # 围棋服务入口
    ├── game.py          # 游戏逻辑
    ├── static/          # 前端界面
    └── agent.py         # AI Agent

└── dongwuqi/            # 无限制动物棋（斗兽棋）
    ├── main.py          # 动物棋服务入口
    ├── rule_engine.py   # 规则引擎（jump/ray/capture）
    ├── chess_ai.py      # Minimax AI
    ├── static/          # 前端界面（emoji 棋子）
    └── configs/         # JSON 配置（灵活编码）
```

## 游戏玩法

### 无限制象棋

在传统中国象棋规则基础上,AI会根据你的走法实时调整策略。你可以:

- **自然语言下棋**: 输入 "炮二平五" 或 "把马向前走"
- **AI辅助**: 让AI分析当前局面并推荐最佳走法
- **局势分析**: 随时询问当前棋局优劣

### 无限制五子棋

经典的五子连珠游戏,但AI会:

- **预判多步**: 计算未来的威胁和机会
- **策略建议**: 分析当前最佳落子位置
- **实时评估**: 显示双方的胜率变化

### 无限制围棋

围棋AI提供:

- **死活题分析**: 判断棋子的死活状态
- **形势判断**: 计算双方的领地和目数
- **定式建议**: 根据当前局面推荐定式

### 无限制动物棋（斗兽棋）

7×9 格子制斗兽棋,8 种动物循环克制（鼠克象、象克众）,含河流/陷阱/兽穴:

- **自然语言下棋**: 输入 "狮子跳河" 或 "让老鼠能斜着走"
- **AI自由修改**: AI 可通过 JSON Patch 实时修改规则（rank/capture/path_constraint）
- **emoji 棋子**: 🐘🦁🐯🐆🐺🐶🐱🐭,红黑双方以边框色区分

## 技术架构

### 前端
- 纯HTML/CSS/JavaScript实现
- 极简黑白线条风格设计
- 响应式布局,支持桌面端游玩

### 后端
- FastAPI 框架
- 异步处理LLM请求
- 流式响应支持

### AI引擎
- 基于大语言模型(LLM)
- 支持OpenAI API兼容接口
- 可配置不同模型

## 开发指南

### 添加新棋类

1. 在项目根目录创建新目录
2. 实现 `game.py` 游戏逻辑
3. 实现 `agent.py` AI逻辑
4. 创建 `static/` 目录添加前端界面
5. 在 `main.py` 中添加服务启动逻辑

### 自定义AI策略

编辑各棋类的 `agent.py` 文件,修改AI的提示词和策略逻辑。

## 许可证

MIT License

---

**棋圣 ChessSage** - 重新定义棋类游戏的AI体验