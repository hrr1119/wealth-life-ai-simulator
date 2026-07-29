# 财富人生

AI 驱动的开放式人生财商模拟游戏。产品采用“精致桌游棋盘 + 现金流控制台 + 卡牌事件台”的核心界面，由本地规则引擎裁决结果，AI 仅负责把自然语言想法生成受约束的机会卡。

## 在线体验

**[打开财富人生](https://hrr1119.github.io/wealth-life-ai-simulator/)**

公开体验版是纯静态应用，无需注册、无需密码；游戏存档仅保存在当前浏览器。自然语言“自由机会”在静态版中使用本地规则映射，因此即使没有后端接口也能完整游玩。全栈部署会优先调用 `/api/opportunity`，接口不可用时自动回退到同一套本地规则。

## 当前交付

- **两种完整模式**：12 年快速模式、24 年标准模式。
- **独立世界**：世界种子、城市、经济周期、利率、通胀、行业趋势。
- **多线人生**：30 条职业路线、48 项技能、24 类资产、36 个事件原型。
- **自由机会**：自然语言输入 → 3 张现实机会卡 → 规则引擎裁决 → 概率快照。
- **长期因果**：人生记忆、隐藏天赋样本、技能组合、时代适配、延迟事件。
- **财务闭环**：主动收入、被动收入、支出、负债、资产估值、利息、应急金。
- **社会闭环**：3 位拥有独立目标和策略的 AI 同桌角色。
- **复盘闭环**：真实行动、关键转折、财务韧性、行为画像、运气/准备/决策归因。
- **产品能力**：4 套主题、响应式布局、自动本地存档、继续游戏、重新开始。

## 本地运行

项目需要 Node.js 22+ 和 pnpm。

```bash
pnpm install
pnpm dev
```

打开开发服务输出的本地地址。

若要预览与 GitHub Pages 完全一致的纯静态版本：

```bash
pnpm build:share
pnpm exec vite preview --config vite.share.config.ts
```

## 质量检查

```bash
pnpm check
```

检查包含规则测试、TypeScript、ESLint、全栈构建与公开静态构建。测试覆盖世界种子确定性、内容量、自由机会结构边界、资源消耗、审计日志、12 年完整闭环和 GitHub Pages 子路径兼容性。

## GitHub Pages 发布

推送到 `main` 后，`.github/workflows/deploy-pages.yml` 会自动：

1. 安装锁定版本的 Node.js 与 pnpm 依赖。
2. 运行测试、类型检查和代码检查。
3. 构建 `share-dist/` 静态版本。
4. 发布到 GitHub Pages。

若需要回滚，在 GitHub 中回退 `main` 到之前的提交并重新运行该工作流即可。公开页不依赖服务端 API，GitHub Pages 故障时仍可用任意静态主机托管 `share-dist/`。

## 架构

```text
自然语言输入 ──> 机会理解器 ──> 结构化机会卡
                                      │
普通行动 ────────────────> 规则/概率引擎 ──> 数值、记忆、审计快照
                                      │
世界种子 ──> 宏观/行业/事件选择 ───────┘
                                      │
                                      └──> 卡牌叙事与局末复盘
```

核心边界：

1. `lib/opportunity.ts` 只生成候选卡，不修改游戏状态。
2. `lib/engine.ts` 是数值与概率的唯一裁决层。
3. `app/api/opportunity/route.ts` 是可替换的 AI 接口；接入真实模型时保持输出结构不变。
4. `share/` 是公开静态入口；它会直接使用本地机会映射，避免在 GitHub Pages 上产生无效 API 请求。
5. 浏览器本地保存只承担单设备存档。后续账号与跨端存档可接 D1/其他持久化服务。

详细设计见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)，验收映射见 [docs/ACCEPTANCE.md](docs/ACCEPTANCE.md)。

## 目录

```text
app/
  api/opportunity/route.ts   # 受约束的自由机会接口
  page.tsx                   # 开局、棋盘、事件、行动、复盘
  globals.css                # 四主题设计系统与响应式布局
lib/
  content.ts                 # 职业、技能、资产、事件、知识模型
  engine.ts                  # 世界、概率、结算、长期因果与复盘
  opportunity.ts             # 自然语言意图到机会卡的本地模拟器
  types.ts                   # 可扩展领域模型
tests/
  engine.test.mjs            # 规则层自动测试
```

## 下一阶段接口

当前版本已经是可独立试玩和部署的单机产品。多人房间、账号体系、跨端存档、内容审核后台、复杂企业经营和深度模式属于规格书中定义的后续阶段；现有 `Player / World / AIPlayer / History / ProbabilitySnapshot` 状态结构已为这些能力预留边界。
