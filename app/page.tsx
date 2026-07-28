"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ASSETS,
  BOARD_STAGES,
  CAREERS,
  KNOWLEDGE_MODELS,
  MODES,
  ROLES,
  SKILLS,
  THEMES,
} from "@/lib/content";
import {
  LIFE_ACTIONS,
  advanceTurn,
  buyAsset,
  changeTheme,
  createGame,
  formatMoney,
  formatSignedMoney,
  generateReview,
  getEmergencyMonths,
  getFinancialFreedomProgress,
  getNetWorth,
  learnSkill,
  resolveOpportunity,
  resolvePendingEvent,
  switchCareer,
  takeLifeAction,
} from "@/lib/engine";
import { generateOpportunityCards } from "@/lib/opportunity";
import type {
  GameState,
  ModeId,
  OpportunityCard,
  ThemeId,
} from "@/lib/types";

const SAVE_KEY = "wealth-life-save-v1";
type ModalName =
  | "skills"
  | "careers"
  | "assets"
  | "actions"
  | "opportunity"
  | "ledger"
  | "knowledge"
  | "network"
  | "audit"
  | "help"
  | null;

function formatCompactMoney(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `¥${(value / 1_000_000).toFixed(2)}m`;
  if (Math.abs(value) >= 10_000) return `¥${(value / 10_000).toFixed(1)}w`;
  return formatMoney(value);
}

function safeLoadSave(): GameState | null {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GameState;
    if (parsed.version !== 1 || !parsed.world || !parsed.roleId) return null;
    return parsed;
  } catch {
    return null;
  }
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? "brand--compact" : ""}`}>
      <span className="brand__mark" aria-hidden="true">
        <span>财</span>
      </span>
      <span className="brand__copy">
        <strong>财富人生</strong>
        {!compact && <small>WEALTH LIFE LAB</small>}
      </span>
    </div>
  );
}

function SetupScreen({
  savedGame,
  onStart,
  onContinue,
}: {
  savedGame: GameState | null;
  onStart: (mode: ModeId, theme: ThemeId, roleId: string) => void;
  onContinue: () => void;
}) {
  const [mode, setMode] = useState<ModeId>("quick");
  const [theme, setTheme] = useState<ThemeId>("emerald");
  const [roleId, setRoleId] = useState(ROLES[0].id);
  const role = ROLES.find((item) => item.id === roleId) ?? ROLES[0];
  const modeInfo = MODES.find((item) => item.id === mode) ?? MODES[0];

  return (
    <div className="setup" data-theme={theme}>
      <header className="setup__nav">
        <Brand />
        <div className="setup__nav-note">
          <span className="live-dot" />
          规则内自由 · 本地存档
        </div>
      </header>

      <main className="setup__main">
        <section className="setup__story">
          <p className="kicker">AI 驱动的开放式人生财商沙盘</p>
          <h1>
            先把人生，
            <span>走一遍。</span>
          </h1>
          <p className="setup__lead">
            职业、关系、健康、市场与运气会同时改变你的现金流。没有固定攻略，
            每一次结果都有规则快照可以解释。
          </p>
          <div className="setup__principles" aria-label="产品原则">
            <div>
              <b>01</b>
              <span>先看现金流，再谈收益</span>
            </div>
            <div>
              <b>02</b>
              <span>AI 生成机会，规则裁决结果</span>
            </div>
            <div>
              <b>03</b>
              <span>失败也是被保留的人生样本</span>
            </div>
          </div>
          <div className="setup__world-tease" aria-hidden="true">
            <span className="tease-node tease-node--one">职业</span>
            <span className="tease-line tease-line--one" />
            <span className="tease-node tease-node--two">家庭</span>
            <span className="tease-line tease-line--two" />
            <span className="tease-node tease-node--three">市场</span>
            <span className="tease-line tease-line--three" />
            <span className="tease-node tease-node--four">机会</span>
          </div>
        </section>

        <section className="setup-card" aria-label="创建一局新游戏">
          <div className="setup-card__header">
            <div>
              <span className="step-index">开局设置</span>
              <h2>生成你的独立世界</h2>
            </div>
            <span className="seed-chip">随机种子</span>
          </div>

          {savedGame && savedGame.phase === "playing" && (
            <button className="continue-card" onClick={onContinue}>
              <span>
                <small>发现本地存档</small>
                <strong>
                  {ROLES.find((item) => item.id === savedGame.roleId)?.name} · 第{" "}
                  {savedGame.turn} 年
                </strong>
              </span>
              <b>继续人生 →</b>
            </button>
          )}

          <fieldset className="option-group">
            <legend>
              <span>01</span> 选择模拟深度
            </legend>
            <div className="mode-grid">
              {MODES.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={`select-card ${mode === item.id ? "is-selected" : ""}`}
                  onClick={() => setMode(item.id)}
                  aria-pressed={mode === item.id}
                >
                  <span className="select-card__top">
                    <strong>{item.name}</strong>
                    <i>{item.turn} 年</i>
                  </span>
                  <small>{item.duration}</small>
                  <p>{item.description}</p>
                </button>
              ))}
              <div className="select-card is-locked" aria-label="深度人生，尚未开放">
                <span className="select-card__top">
                  <strong>深度人生</strong>
                  <i>实验中</i>
                </span>
                <small>40–60 年</small>
                <p>企业经营、税费、养老与长期宏观周期。</p>
              </div>
            </div>
          </fieldset>

          <fieldset className="option-group">
            <legend>
              <span>02</span> 选择起点身份
            </legend>
            <div className="role-selector">
              <div className="role-tabs" role="listbox" aria-label="角色">
                {ROLES.map((item) => (
                  <button
                    type="button"
                    role="option"
                    aria-selected={roleId === item.id}
                    key={item.id}
                    className={roleId === item.id ? "is-selected" : ""}
                    onClick={() => setRoleId(item.id)}
                  >
                    <span>{item.name.slice(0, 1)}</span>
                    {item.name}
                  </button>
                ))}
              </div>
              <div className="role-detail">
                <div>
                  <span className="micro-label">{role.category}</span>
                  <h3>{role.name}</h3>
                  <p>{role.story}</p>
                </div>
                <dl>
                  <div>
                    <dt>月收入</dt>
                    <dd>{formatMoney(role.monthlyIncome)}</dd>
                  </div>
                  <div>
                    <dt>现金</dt>
                    <dd>{formatMoney(role.cash)}</dd>
                  </div>
                  <div>
                    <dt>固定支出</dt>
                    <dd>{formatMoney(role.fixedExpense)}</dd>
                  </div>
                </dl>
              </div>
            </div>
          </fieldset>

          <fieldset className="option-group option-group--theme">
            <legend>
              <span>03</span> 选择桌面主题
            </legend>
            <div className="theme-grid">
              {THEMES.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={`theme-choice ${theme === item.id ? "is-selected" : ""}`}
                  onClick={() => setTheme(item.id)}
                  aria-pressed={theme === item.id}
                >
                  <span className="theme-choice__swatches">
                    {item.swatches.map((color) => (
                      <i key={color} style={{ background: color }} />
                    ))}
                  </span>
                  <span>
                    <strong>{item.name}</strong>
                    <small>{item.description}</small>
                  </span>
                </button>
              ))}
            </div>
          </fieldset>

          <button className="launch-button" onClick={() => onStart(mode, theme, roleId)}>
            <span>
              <small>{modeInfo.name} · {role.name}</small>
              开始人生实验
            </span>
            <b aria-hidden="true">↗</b>
          </button>
          <p className="setup-card__footnote">存档只保存在当前浏览器；你可以随时重开另一条人生。</p>
        </section>
      </main>

      <footer className="setup__footer">
        <span>30 条职业路线</span>
        <span>48 项技能</span>
        <span>24 类资产</span>
        <span>36 个动态事件原型</span>
        <span>4 套桌面主题</span>
      </footer>
    </div>
  );
}

function Board({ state, onOpportunity }: { state: GameState; onOpportunity: () => void }) {
  const normalized = state.maxTurns === 12
    ? state.turn
    : Math.max(1, Math.ceil((state.turn / state.maxTurns) * 12));

  return (
    <section className="board panel-frame" aria-label="人生路线棋盘">
      <header className="panel-heading">
        <div>
          <span className="micro-label">人生路线图</span>
          <h2>每条路，都有代价与可能</h2>
        </div>
        <div className="turn-seal">
          <small>当前年份</small>
          <b>{String(state.turn).padStart(2, "0")}</b>
          <span>/ {state.maxTurns}</span>
        </div>
      </header>

      <div className="board__surface">
        <div className="board__routes" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <div className="board__nodes">
          {BOARD_STAGES.map((stage, index) => {
            const status = stage.turn < normalized ? "done" : stage.turn === normalized ? "current" : "future";
            const isOpportunity = stage.key === "freedom";
            return (
              <button
                key={stage.key}
                className={`board-node board-node--${index + 1} is-${status} ${isOpportunity ? "is-opportunity" : ""}`}
                onClick={isOpportunity ? onOpportunity : undefined}
                aria-label={`${stage.label}，${status === "current" ? "当前位置" : status === "done" ? "已经历" : "未来节点"}`}
              >
                <span className="board-node__index">{String(index + 1).padStart(2, "0")}</span>
                <span className="board-node__icon" aria-hidden="true">
                  {["始", "学", "职", "市", "契", "家", "✦", "势", "身", "业", "护", "终"][index]}
                </span>
                <strong>{stage.label}</strong>
                <small>{stage.type}</small>
                {status === "current" && <span className="pawn" aria-hidden="true">你</span>}
              </button>
            );
          })}
        </div>
        <div className="board__legend">
          <span><i className="legend-dot is-current" />当前位置</span>
          <span><i className="legend-dot is-event" />人生节点</span>
          <span><i className="legend-dot is-free" />自由机会</span>
        </div>
      </div>

      <div className="tablemates">
        <span className="micro-label">同桌人生</span>
        <div className="tablemates__list">
          {state.aiPlayers.map((player) => (
            <div className="tablemate" key={player.id} title={`${player.goal} · ${player.currentMove}`}>
              <span className="avatar">{player.name.slice(0, 1)}</span>
              <span>
                <b>{player.name}</b>
                <small>{player.currentMove}</small>
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinanceConsole({
  state,
  onOpenLedger,
  onOpenKnowledge,
}: {
  state: GameState;
  onOpenLedger: () => void;
  onOpenKnowledge: () => void;
}) {
  const netWorth = getNetWorth(state);
  const emergency = getEmergencyMonths(state);
  const freedom = getFinancialFreedomProgress(state);
  const annualCashFlow =
    (state.monthlyIncome + state.passiveIncome - state.fixedExpense - state.variableExpense) * 12;
  const metrics = [
    ["可用现金", formatCompactMoney(state.cash), "cash"],
    ["净资产", formatCompactMoney(netWorth), "net"],
    ["月主动收入", formatCompactMoney(state.monthlyIncome), "income"],
    ["月被动收入", formatCompactMoney(state.passiveIncome), "passive"],
    ["月固定支出", formatCompactMoney(state.fixedExpense), "expense"],
    ["负债余额", formatCompactMoney(state.debt), "debt"],
  ];

  return (
    <aside className="finance-console panel-frame" aria-label="现金流控制台">
      <header className="panel-heading panel-heading--console">
        <div>
          <span className="micro-label">现金流控制台</span>
          <h2>你的财务底盘</h2>
        </div>
        <span className={`cashflow-sign ${annualCashFlow >= 0 ? "is-positive" : "is-negative"}`}>
          年现金流 {formatSignedMoney(annualCashFlow)}
        </span>
      </header>

      <div className="finance-metrics">
        {metrics.map(([label, value, kind]) => (
          <div className={`finance-metric finance-metric--${kind}`} key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>

      <div className="resilience">
        <div className="resilience__head">
          <span>应急金覆盖</span>
          <b>{emergency.toFixed(1)} 个月</b>
        </div>
        <div className="meter">
          <i style={{ width: `${Math.min(100, (emergency / 6) * 100)}%` }} />
        </div>
        <div className="resilience__head">
          <span>财务自由进度</span>
          <b>{Math.round(freedom * 100)}%</b>
        </div>
        <div className="meter meter--gold">
          <i style={{ width: `${Math.min(100, freedom * 100)}%` }} />
        </div>
      </div>

      <div className="life-stats">
        {[
          ["健康", state.health],
          ["精力", state.energy],
          ["幸福", state.happiness],
          ["信用", state.credit],
        ].map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <b>{Math.round(value as number)}</b>
            <i><em style={{ width: `${value}%` }} /></i>
          </div>
        ))}
      </div>

      <div className="console-actions">
        <button onClick={onOpenLedger}>资产负债表 <span>↗</span></button>
        <button onClick={onOpenKnowledge}>本局知识库 <span>{state.revealedKnowledge.length}</span></button>
      </div>
    </aside>
  );
}

function StoryStage({
  state,
  onResolveEvent,
  onOpenAudit,
}: {
  state: GameState;
  onResolveEvent: (choiceId: string) => void;
  onOpenAudit: () => void;
}) {
  const card = state.lastCard;
  const latestAudit = state.audits.at(-1);
  return (
    <section className={`story-stage ${state.pendingEvent ? "has-event" : ""}`} aria-live="polite">
      <div className="story-card">
        <div className="story-card__rail">
          <span>{card.eyebrow}</span>
          <i />
          <b>{String(state.turn).padStart(2, "0")}</b>
        </div>
        <div className="story-card__body">
          <div className="story-card__meta">
            {card.tags.map((tag) => <span key={tag}>{tag}</span>)}
          </div>
          <h2>{card.title}</h2>
          <p>{card.narrative}</p>
          {card.outcome && (
            <div className="outcome-note">
              <span>结果</span>
              <p>{card.outcome}</p>
            </div>
          )}
          {latestAudit && !state.pendingEvent && (
            <button className="audit-link" onClick={onOpenAudit}>
              查看本次规则快照 · 成功率 {Math.round(latestAudit.finalProbability * 100)}%
              <span>→</span>
            </button>
          )}
        </div>
        <div className="story-card__stamp" aria-hidden="true">
          {state.pendingEvent ? "待选" : "已裁决"}
        </div>
      </div>

      {state.pendingEvent && (
        <div className="event-choices">
          <div className="event-choices__heading">
            <span className="micro-label">这次你怎么选？</span>
            <p>每个选择都有成本，结果仍受准备、环境与运气影响。</p>
          </div>
          <div className="event-choices__grid">
            {state.pendingEvent.event.choices.map((choice, index) => (
              <button key={choice.id} onClick={() => onResolveEvent(choice.id)}>
                <span className="choice-number">0{index + 1}</span>
                <span>
                  <strong>{choice.label}</strong>
                  <small>{choice.description}</small>
                  <em>
                    {choice.cost ? `成本 ${formatMoney(choice.cost)}` : "无直接现金成本"}
                    <i> · {choice.risk}风险</i>
                  </em>
                </span>
                <b aria-hidden="true">↗</b>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function ActionDock({
  state,
  onOpen,
  onAdvance,
}: {
  state: GameState;
  onOpen: (modal: ModalName) => void;
  onAdvance: () => void;
}) {
  const disabled = Boolean(state.pendingEvent);
  const actions: Array<[ModalName, string, string, string]> = [
    ["careers", "职业", "转行与谈判", "职"],
    ["skills", "学习", "能力与天赋", "学"],
    ["actions", "行动", "副业·家庭·休整", "行"],
    ["assets", "投资", "资产与现金流", "投"],
    ["network", "关系", "查看同桌角色", "人"],
    ["opportunity", "自由机会", `剩余 ${state.opportunityTokens} 次`, "✦"],
  ];
  return (
    <nav className="action-dock" aria-label="本回合行动">
      <div className="action-points">
        <span className="micro-label">时间预算</span>
        <div>
          {Array.from({ length: 8 }, (_, index) => (
            <i key={index} className={index < state.actionPoints ? "is-filled" : ""} />
          ))}
        </div>
        <b>{state.actionPoints}/8</b>
      </div>
      <div className="action-dock__items">
        {actions.map(([modal, label, sub, icon]) => (
          <button
            key={label}
            disabled={disabled || (modal === "opportunity" && state.opportunityTokens <= 0)}
            onClick={() => onOpen(modal)}
          >
            <span aria-hidden="true">{icon}</span>
            <strong>{label}</strong>
            <small>{sub}</small>
          </button>
        ))}
      </div>
      <button className="advance-button" onClick={onAdvance} disabled={disabled}>
        <span>
          <small>完成行动后</small>
          推进一年
        </span>
        <b>→</b>
      </button>
    </nav>
  );
}

function BaseModal({
  title,
  eyebrow,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  eyebrow: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className={`modal-sheet ${wide ? "modal-sheet--wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal-sheet__header">
          <div>
            <span className="micro-label">{eyebrow}</span>
            <h2>{title}</h2>
          </div>
          <button className="close-button" onClick={onClose} aria-label="关闭">×</button>
        </header>
        <div className="modal-sheet__body">{children}</div>
      </section>
    </div>
  );
}

function CatalogModal({
  type,
  state,
  onClose,
  onSkill,
  onCareer,
  onAsset,
  onLifeAction,
}: {
  type: "skills" | "careers" | "assets" | "actions";
  state: GameState;
  onClose: () => void;
  onSkill: (id: string) => void;
  onCareer: (id: string) => void;
  onAsset: (id: string) => void;
  onLifeAction: (id: string) => void;
}) {
  const [filter, setFilter] = useState("全部");
  const [search, setSearch] = useState("");
  const config = {
    skills: ["学习市场", "把时间变成人力资本", "选择技能后，隐藏天赋会通过真实样本逐步揭示。"],
    careers: ["职业分岔", "不被一张职业卡定义", "转行需要现金、时间、技能与环境共同支持。"],
    assets: ["资产市场", "让现金承担不同任务", "系统同时模拟收益、波动、流动性与集中风险。"],
    actions: ["人生行动", "钱不是唯一资源", "副业、家庭、关系和健康会共同改变长期结果。"],
  }[type];

  const items =
    type === "skills"
      ? SKILLS
      : type === "careers"
        ? CAREERS
        : type === "assets"
          ? ASSETS
          : LIFE_ACTIONS;
  const categories = [
    "全部",
    ...new Set(
      items.map((item) =>
        "category" in item ? item.category : "行动",
      ),
    ),
  ];
  const shown = items.filter((item) => {
    const category = "category" in item ? item.category : "行动";
    const name = "name" in item ? item.name : "";
    return (filter === "全部" || category === filter) && name.includes(search.trim());
  });

  return (
    <BaseModal eyebrow={config[0]} title={config[1]} onClose={onClose} wide>
      <p className="modal-intro">{config[2]}</p>
      <div className="catalog-tools">
        <div className="filter-tabs">
          {categories.slice(0, 9).map((category) => (
            <button
              key={category}
              className={filter === category ? "is-selected" : ""}
              onClick={() => setFilter(category)}
            >
              {category}
            </button>
          ))}
        </div>
        <label className="search-field">
          <span>搜索</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="输入名称" />
        </label>
      </div>

      <div className="catalog-grid">
        {shown.map((item) => {
          if (type === "skills") {
            const skill = item as (typeof SKILLS)[number];
            const level = state.skills[skill.id] ?? 0;
            return (
              <button className="catalog-card" key={skill.id} onClick={() => onSkill(skill.id)}>
                <span className="catalog-card__label">{skill.category}</span>
                <h3>{skill.name}</h3>
                <p>{skill.description}</p>
                <div className="skill-level">
                  <span>掌握度</span>
                  <i><em style={{ width: `${(level / 5) * 100}%` }} /></i>
                  <b>{level.toFixed(1)}</b>
                </div>
                <footer>
                  <span>{formatMoney(skill.cost)}</span>
                  <span>{skill.timeCost} 点时间</span>
                </footer>
              </button>
            );
          }
          if (type === "careers") {
            const career = item as (typeof CAREERS)[number];
            const current = state.currentCareerId === career.id;
            const matched = career.requiredSkills.filter((id) => (state.skills[id] ?? 0) >= 1).length;
            return (
              <button className={`catalog-card ${current ? "is-current" : ""}`} key={career.id} disabled={current} onClick={() => onCareer(career.id)}>
                <span className="catalog-card__label">{career.category}</span>
                <h3>{career.name}</h3>
                <p>稳定性 {Math.round(career.stability * 100)} · 压力 {career.stress} · 需要 {career.requiredSkills.length} 项技能</p>
                <div className="career-match">
                  <span>技能匹配</span>
                  <b>{matched}/{career.requiredSkills.length}</b>
                </div>
                <footer>
                  <span>{current ? "当前职业" : `月收入 ${formatMoney(career.monthlyIncome)}`}</span>
                  <span>{formatMoney(career.entryCost)} 转型成本</span>
                </footer>
              </button>
            );
          }
          if (type === "assets") {
            const asset = item as (typeof ASSETS)[number];
            return (
              <button className="catalog-card" key={asset.id} onClick={() => onAsset(asset.id)}>
                <span className="catalog-card__label">{asset.category} · {asset.risk}风险</span>
                <h3>{asset.name}</h3>
                <p>{asset.description}</p>
                <div className="asset-bars">
                  <span>波动 <i><em style={{ width: `${asset.volatility * 180}%` }} /></i></span>
                  <span>流动 <i><em style={{ width: `${asset.liquidity * 100}%` }} /></i></span>
                </div>
                <footer>
                  <span>起投 {formatMoney(asset.minimum)}</span>
                  <span>预期年化 {(asset.expectedAnnualReturn * 100).toFixed(1)}%</span>
                </footer>
              </button>
            );
          }
          const action = item as (typeof LIFE_ACTIONS)[number];
          return (
            <button className="catalog-card" key={action.id} onClick={() => onLifeAction(action.id)}>
              <span className="catalog-card__label">{action.category}</span>
              <h3>{action.name}</h3>
              <p>{action.description}</p>
              <div className="tag-row">{action.knowledge.map((tag) => <span key={tag}>{tag}</span>)}</div>
              <footer>
                <span>{action.cashCost ? formatMoney(action.cashCost) : "无直接支出"}</span>
                <span>{action.points} 点时间</span>
              </footer>
            </button>
          );
        })}
      </div>
    </BaseModal>
  );
}

function OpportunityModal({
  state,
  onClose,
  onChoose,
}: {
  state: GameState;
  onClose: () => void;
  onChoose: (card: OpportunityCard) => void;
}) {
  const [intent, setIntent] = useState("");
  const [cards, setCards] = useState<OpportunityCard[]>([]);
  const [mapping, setMapping] = useState<string[]>([]);
  const [normalizedGoal, setNormalizedGoal] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function generate() {
    setError("");
    setLoading(true);
    try {
      let result: ReturnType<typeof generateOpportunityCards>;
      try {
        const response = await fetch("/api/opportunity", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ intent }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error);
        result = payload;
      } catch {
        result = generateOpportunityCards(intent);
      }
      setCards(result.cards);
      setMapping(result.ruleMapping);
      setNormalizedGoal(result.normalizedGoal);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法解析这次想法。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <BaseModal eyebrow={`自由机会 · 剩余 ${state.opportunityTokens} 次`} title="把你的想法变成一组可裁决的机会卡" onClose={onClose} wide>
      <div className="opportunity-intro">
        <span className="free-orb" aria-hidden="true">✦</span>
        <div>
          <p>AI 只负责理解和拆解，不会直接宣布成功、修改资产或凭空发放奖励。</p>
          <small>例：我不辞职，晚上学习俄语，半年内尝试采访本地外国人做视频。</small>
        </div>
      </div>
      <label className="intent-field">
        <span>你真正想尝试什么？</span>
        <textarea
          value={intent}
          onChange={(event) => setIntent(event.target.value)}
          maxLength={240}
          placeholder="描述目标、是否保留主业、愿意投入的时间和你担心的风险……"
          rows={4}
        />
        <small>{intent.length}/240</small>
      </label>
      <button className="generate-button" disabled={loading || intent.trim().length < 4} onClick={generate}>
        {loading ? "正在映射到规则原子…" : "生成 3 张现实机会卡"}
        <span>→</span>
      </button>
      {error && <p className="form-error">{error}</p>}

      {cards.length > 0 && (
        <div className="opportunity-results">
          <div className="mapping-note">
            <span>归一化目标</span>
            <strong>{normalizedGoal}</strong>
            <div>{mapping.map((item) => <small key={item}>{item}</small>)}</div>
          </div>
          <div className="opportunity-grid">
            {cards.map((card, index) => (
              <button className="opportunity-card" key={card.id} onClick={() => onChoose(card)}>
                <header>
                  <span>方案 0{index + 1}</span>
                  <i>{card.risk}风险</i>
                </header>
                <h3>{card.title}</h3>
                <p>{card.description}</p>
                <dl>
                  <div><dt>周期</dt><dd>{card.duration}</dd></div>
                  <div><dt>现金</dt><dd>{formatMoney(card.cashCost)}</dd></div>
                  <div><dt>时间</dt><dd>{card.timeCost} 点</dd></div>
                  <div><dt>基础概率</dt><dd>{Math.round(card.baseProbability * 100)}%</dd></div>
                </dl>
                <footer>选择并交给规则引擎裁决 <span>↗</span></footer>
              </button>
            ))}
          </div>
        </div>
      )}
    </BaseModal>
  );
}

function InfoModal({
  type,
  state,
  onClose,
}: {
  type: "ledger" | "knowledge" | "network" | "audit" | "help";
  state: GameState;
  onClose: () => void;
}) {
  if (type === "ledger") {
    return (
      <BaseModal eyebrow="资产负债表" title="钱在哪里，以及为什么变化" onClose={onClose} wide>
        <div className="ledger-summary">
          <div><span>现金</span><b>{formatMoney(state.cash)}</b></div>
          <div><span>资产市值</span><b>{formatMoney(state.assets.reduce((sum, item) => sum + item.value, 0))}</b></div>
          <div><span>负债</span><b>{formatMoney(state.debt)}</b></div>
          <div><span>净资产</span><b>{formatMoney(getNetWorth(state))}</b></div>
        </div>
        <h3 className="section-title">持有资产</h3>
        <div className="ledger-table">
          {state.assets.length ? state.assets.map((asset) => (
            <div key={asset.id}>
              <span><b>{asset.name}</b><small>{asset.category} · {asset.risk}风险</small></span>
              <span>成本 {formatMoney(asset.costBasis)}</span>
              <strong>{formatMoney(asset.value)}</strong>
            </div>
          )) : <p className="empty-note">你还没有持有投资资产。现金本身也承担流动性任务。</p>}
        </div>
        <h3 className="section-title">最近现金变动</h3>
        <div className="history-list">
          {state.history.slice(-10).reverse().map((entry) => (
            <div key={entry.id}>
              <span><b>{entry.title}</b><small>第 {entry.turn} 年 · {entry.description}</small></span>
              <em className={(entry.cashDelta ?? 0) >= 0 ? "is-positive" : "is-negative"}>
                {entry.cashDelta === undefined ? "—" : formatSignedMoney(entry.cashDelta)}
              </em>
            </div>
          ))}
        </div>
      </BaseModal>
    );
  }
  if (type === "knowledge") {
    return (
      <BaseModal eyebrow="本局知识库" title="你的选择触发了这些经济模型" onClose={onClose} wide>
        <div className="knowledge-grid">
          {state.revealedKnowledge.map((tag, index) => (
            <article key={tag}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <h3>{tag}</h3>
              <p>{KNOWLEDGE_MODELS[tag] ?? "这个模型已被你的行动触发，更多解释会出现在局末复盘。"}</p>
            </article>
          ))}
        </div>
        <h3 className="section-title">隐藏天赋样本</h3>
        <div className="talent-list">
          {Object.entries(state.talents).map(([name, talent]) => (
            <div key={name}>
              <span>
                <b>{name}</b>
                <small>{talent.revealed ? talent.level : "需要更多真实行动才能揭示"}</small>
              </span>
              <div>{Array.from({ length: 8 }, (_, index) => <i key={index} className={index < talent.samples ? "is-filled" : ""} />)}</div>
              <em>{talent.revealed ? (talent.multiplier >= 1.08 ? "适配良好" : talent.multiplier < 0.92 ? "当前阻力" : "表现平稳") : "未知"}</em>
            </div>
          ))}
        </div>
      </BaseModal>
    );
  }
  if (type === "network") {
    return (
      <BaseModal eyebrow="单机 AI 同桌" title="他们有自己的目标，也会拒绝、竞争和改变策略" onClose={onClose}>
        <div className="network-list">
          {state.aiPlayers.map((player) => (
            <article key={player.id}>
              <span className="avatar avatar--large">{player.name.slice(0, 1)}</span>
              <div>
                <span className="micro-label">{player.archetype}</span>
                <h3>{player.name}</h3>
                <p>目标：{player.goal}</p>
                <small>当前行动：{player.currentMove}</small>
              </div>
              <dl>
                <div><dt>关系</dt><dd>{player.relationship}</dd></div>
                <div><dt>现金</dt><dd>{formatCompactMoney(player.cash)}</dd></div>
              </dl>
            </article>
          ))}
        </div>
        <p className="modal-footnote">首版为单机独立决策。数据模型已保留借款、担保、交易与合伙的后续联机接口。</p>
      </BaseModal>
    );
  }
  if (type === "audit") {
    const audit = state.audits.at(-1);
    return (
      <BaseModal eyebrow="规则引擎审计" title={audit?.label ?? "暂无概率快照"} onClose={onClose}>
        {audit ? (
          <>
            <div className={`audit-result ${audit.success ? "is-success" : "is-failure"}`}>
              <span>最终成功率</span>
              <b>{Math.round(audit.finalProbability * 100)}%</b>
              <span>随机落点</span>
              <b>{Math.round(audit.roll * 100)}%</b>
              <strong>{audit.success ? "本次成功" : "本次未成功"}</strong>
            </div>
            <div className="audit-factors">
              {[
                ["基础概率", audit.base],
                ["技能修正", audit.skillModifier],
                ["资源修正", audit.resourceModifier],
                ["关系修正", audit.relationshipModifier],
                ["环境修正", audit.environmentModifier],
                ["隐藏适配", audit.talentModifier],
              ].map(([label, value], index) => (
                <div key={label as string}>
                  <span>{label}</span>
                  <i><em style={{ width: `${Math.abs(value as number) * 300 + (index === 0 ? 25 : 0)}%` }} /></i>
                  <b>{index === 0 ? `${Math.round((value as number) * 100)}%` : `${(value as number) >= 0 ? "+" : ""}${Math.round((value as number) * 100)}%`}</b>
                </div>
              ))}
            </div>
            <ul className="audit-summary">
              {audit.summary.map((item) => <li key={item}>{item}</li>)}
            </ul>
            <p className="modal-footnote">隐藏适配不会展示精确天赋数值，只解释其方向；完整快照仍保留在本局存档中。</p>
          </>
        ) : <p className="empty-note">完成一次需要概率裁决的行动后，这里会出现可审计快照。</p>}
      </BaseModal>
    );
  }
  return (
    <BaseModal eyebrow="如何游玩" title="每个回合，只看三件事" onClose={onClose}>
      <ol className="help-steps">
        <li><b>01</b><span><strong>看路线</strong>确认当前人生节点、世界周期和同桌角色的动向。</span></li>
        <li><b>02</b><span><strong>看现金流</strong>不是只看净资产，而是确认流动性、支出与负债是否可承受。</span></li>
        <li><b>03</b><span><strong>做行动</strong>用 8 点时间预算安排学习、职业、投资、关系或休整，然后推进一年。</span></li>
      </ol>
      <div className="help-rule">
        <span>自由机会</span>
        <p>当固定选项没有你想要的方向时，用自然语言提出想法。AI生成 3 张受约束机会卡，规则引擎再进行裁决。</p>
      </div>
    </BaseModal>
  );
}

function ReviewScreen({
  state,
  onRestart,
  onReturn,
}: {
  state: GameState;
  onRestart: () => void;
  onReturn: () => void;
}) {
  const report = useMemo(() => generateReview(state), [state]);
  const role = ROLES.find((item) => item.id === state.roleId);
  return (
    <div className="review-page" data-theme={state.theme}>
      <header className="review-topbar">
        <Brand />
        <span>{role?.name} · {state.maxTurns} 年人生实验</span>
      </header>
      <main className="review-report">
        <section className="review-hero">
          <span className="micro-label">局末个性化复盘</span>
          <h1>你不是赢了或输了，<br />你走出了一种<strong>选择方式。</strong></h1>
          <p>{report.styleDescription}</p>
          <div className="review-style">
            <span>本局决策画像</span>
            <b>{report.style}</b>
          </div>
        </section>

        <section className="review-metrics">
          <div><span>最终净资产</span><b>{formatCompactMoney(report.netWorth)}</b><small>含资产市值并扣除负债</small></div>
          <div><span>现金缓冲</span><b>{report.emergencyMonths.toFixed(1)} 月</b><small>必要支出覆盖</small></div>
          <div><span>财务韧性</span><b>{report.resilienceScore}</b><small>/ 100</small></div>
          <div><span>学习探索</span><b>{report.learningScore}</b><small>/ 100</small></div>
        </section>

        <section className="review-section">
          <div className="review-section__head">
            <span>01</span>
            <div><small>结果从哪里来</small><h2>运气、准备与决策共同塑造这一局</h2></div>
          </div>
          <div className="attribution">
            {[
              ["运气", report.luckVsPreparation.luck, "世界种子与随机落点"],
              ["准备", report.luckVsPreparation.preparation, "技能、现金与关系缓冲"],
              ["决策", report.luckVsPreparation.decisions, "时机、取舍与行动规则"],
            ].map(([label, value, copy]) => (
              <div key={label as string}>
                <header><span>{label}</span><b>{Math.round((value as number) * 100)}%</b></header>
                <i><em style={{ width: `${(value as number) * 100}%` }} /></i>
                <p>{copy}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="review-section">
          <div className="review-section__head">
            <span>02</span>
            <div><small>关键判断</small><h2>你的优势与脆弱点</h2></div>
          </div>
          <div className="insight-grid">
            {report.insights.map((insight) => (
              <article className={`insight-card insight-card--${insight.tone}`} key={insight.title}>
                <span>{insight.tone === "positive" ? "保持" : insight.tone === "watch" ? "关注" : "观察"}</span>
                <h3>{insight.title}</h3>
                <p>{insight.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="review-section">
          <div className="review-section__head">
            <span>03</span>
            <div><small>人生记忆</small><h2>改变结果的关键转折</h2></div>
          </div>
          <div className="turning-points">
            {report.turningPoints.map((item) => (
              <article key={item.id}>
                <span>第 {item.turn} 年</span>
                <div><h3>{item.title}</h3><p>{item.description}</p></div>
                <b className={(item.cashDelta ?? 0) >= 0 ? "is-positive" : "is-negative"}>
                  {item.cashDelta === undefined ? "非现金影响" : formatSignedMoney(item.cashDelta)}
                </b>
              </article>
            ))}
          </div>
        </section>

        <section className="review-section">
          <div className="review-section__head">
            <span>04</span>
            <div><small>带回现实</small><h2>本局真正触发的知识模型</h2></div>
          </div>
          <div className="review-knowledge">
            {report.knowledge.map((tag) => (
              <article key={tag}><b>{tag}</b><p>{KNOWLEDGE_MODELS[tag]}</p></article>
            ))}
          </div>
        </section>

        <section className="review-final">
          <span className="micro-label">核心原则</span>
          <blockquote>先确认自己能否承受最坏结果，再决定是否下注；把每次选择当成一场小型实验。</blockquote>
          <div>
            <button className="secondary-button" onClick={onReturn}>返回开局</button>
            <button className="primary-button" onClick={onRestart}>用同一身份再走一遍 <span>→</span></button>
          </div>
        </section>
      </main>
    </div>
  );
}

function GameScreen({
  state,
  onState,
  onExit,
}: {
  state: GameState;
  onState: (state: GameState) => void;
  onExit: () => void;
}) {
  const [modal, setModal] = useState<ModalName>(null);
  const [toast, setToast] = useState("");
  const role = ROLES.find((item) => item.id === state.roleId);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") setModal(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  function applyResult(result: { state: GameState; success: boolean; message: string }, close = true) {
    if (result.success) {
      onState(result.state);
      if (close) setModal(null);
    }
    setToast(result.message);
    window.setTimeout(() => setToast(""), 2800);
  }

  return (
    <div className="game" data-theme={state.theme}>
      <header className="game-topbar">
        <Brand compact />
        <div className="world-strip">
          <span><small>世界</small>#{String(state.world.seed).slice(-6)}</span>
          <span><small>城市</small>{state.world.city}</span>
          <span><small>周期</small><i className={`cycle cycle--${state.world.cycle}`}>{state.world.cycle}</i></span>
          <span><small>利率</small>{(state.world.interestRate * 100).toFixed(1)}%</span>
          <span><small>趋势</small>{state.world.platformTrend}</span>
        </div>
        <div className="game-topbar__actions">
          <label className="theme-switcher">
            <span>主题</span>
            <select value={state.theme} onChange={(event) => onState(changeTheme(state, event.target.value as ThemeId))}>
              {THEMES.map((theme) => <option value={theme.id} key={theme.id}>{theme.name}</option>)}
            </select>
          </label>
          <button onClick={() => setModal("help")} aria-label="帮助">?</button>
          <button className="identity-button" onClick={onExit}>
            <span>{role?.name.slice(0, 1)}</span>
            <b>{role?.name}</b>
          </button>
        </div>
      </header>

      <main className="game-main">
        <div className="game-grid">
          <Board state={state} onOpportunity={() => setModal("opportunity")} />
          <FinanceConsole state={state} onOpenLedger={() => setModal("ledger")} onOpenKnowledge={() => setModal("knowledge")} />
        </div>
        <StoryStage state={state} onResolveEvent={(choiceId) => applyResult(resolvePendingEvent(state, choiceId), false)} onOpenAudit={() => setModal("audit")} />
      </main>
      <ActionDock state={state} onOpen={setModal} onAdvance={() => applyResult(advanceTurn(state), false)} />

      {(modal === "skills" || modal === "careers" || modal === "assets" || modal === "actions") && (
        <CatalogModal
          type={modal}
          state={state}
          onClose={() => setModal(null)}
          onSkill={(id) => applyResult(learnSkill(state, id))}
          onCareer={(id) => applyResult(switchCareer(state, id))}
          onAsset={(id) => applyResult(buyAsset(state, id))}
          onLifeAction={(id) => applyResult(takeLifeAction(state, id))}
        />
      )}
      {modal === "opportunity" && (
        <OpportunityModal state={state} onClose={() => setModal(null)} onChoose={(card) => applyResult(resolveOpportunity(state, card))} />
      )}
      {(modal === "ledger" || modal === "knowledge" || modal === "network" || modal === "audit" || modal === "help") && (
        <InfoModal type={modal} state={state} onClose={() => setModal(null)} />
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [savedGame, setSavedGame] = useState<GameState | null>(null);
  const [state, setState] = useState<GameState | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSavedGame(safeLoadSave());
      setMounted(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!state || !mounted) return;
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({ ...state, savedAt: Date.now() }));
  }, [state, mounted]);

  if (!mounted) {
    return (
      <div className="boot-screen" data-theme="emerald">
        <Brand />
        <span>正在展开人生棋盘…</span>
      </div>
    );
  }

  if (!state) {
    return (
      <SetupScreen
        savedGame={savedGame}
        onContinue={() => savedGame && setState(savedGame)}
        onStart={(mode, theme, roleId) => {
          const next = createGame({ mode, theme, roleId });
          setSavedGame(next);
          setState(next);
        }}
      />
    );
  }

  if (state.phase === "review") {
    return (
      <ReviewScreen
        state={state}
        onRestart={() => {
          const next = createGame({ mode: state.mode, theme: state.theme, roleId: state.roleId });
          setSavedGame(next);
          setState(next);
        }}
        onReturn={() => setState(null)}
      />
    );
  }

  return (
    <GameScreen
      state={state}
      onState={(next) => {
        setSavedGame(next);
        setState(next);
      }}
      onExit={() => {
        if (window.confirm("返回开局不会删除当前存档，你可以稍后继续。")) setState(null);
      }}
    />
  );
}
