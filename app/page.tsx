"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ASSETS,
  CAREERS,
  KNOWLEDGE_MODELS,
  MODES,
  ROLES,
  SKILLS,
  THEMES,
} from "@/lib/content";
import {
  AI_INTERACTIONS,
  DEEP_ACTIONS,
  LIFE_ACTIONS,
  changeTheme,
  continueAfterLearningPhase,
  createGame,
  enterOrdinaryActionPhase,
  finishOrdinaryActionPhase,
  finishPlayerInteractionPhase,
  formatMoney,
  formatSignedMoney,
  generateReview,
  getEmergencyMonths,
  getFinancialFreedomProgress,
  getLifeYear,
  getNetWorth,
  getPeriodLabel,
  getQuarter,
  removePlannedAction,
  resolveMacroEventPhase,
  resolvePersonalEventPhase,
  scheduleAIInteraction,
  scheduleAsset,
  scheduleAssetSale,
  scheduleCareer,
  scheduleContractAction,
  scheduleDeepAction,
  scheduleLifeAction,
  scheduleOpportunity,
  scheduleSkill,
  settleTurnPhase,
  skipEmptyPersonalEventPhase,
  upgradeGameState,
} from "@/lib/engine";
import {
  SKILL_COMBINATIONS,
  getAssetSaleQuote,
  getCareerReadiness,
  getMasteryBand,
  getPortfolioDiagnostics,
  getSkillPrerequisites,
  getUnmetSkillPrerequisites,
} from "@/lib/progression";
import { getFamilyPressure } from "@/lib/relationships";
import { generateOpportunityCards } from "@/lib/opportunity";
import MultiplayerScreen from "@/app/multiplayer";
import type {
  GameState,
  DeepActionId,
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
  | "deep"
  | "opportunity"
  | "ledger"
  | "knowledge"
  | "network"
  | "family"
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
    return upgradeGameState(parsed);
  } catch {
    return null;
  }
}

function copyTextFallback(text: string): boolean {
  const field = document.createElement("textarea");
  field.value = text;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.appendChild(field);
  field.select();
  const copied = document.execCommand("copy");
  field.remove();
  return copied;
}

function ShareButton({
  compact = false,
  className = "",
}: {
  compact?: boolean;
  className?: string;
}) {
  const [feedback, setFeedback] = useState("");

  async function share() {
    const data = {
      title: "财富人生｜先把人生，走一遍",
      text: "在一个独立世界里，提前模拟职业、现金流、投资、关系与人生选择。",
      url: window.location.href,
    };

    try {
      if (navigator.share) {
        await navigator.share(data);
        setFeedback("已分享");
      } else {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(data.url);
        } else if (!copyTextFallback(data.url)) {
          throw new Error("copy failed");
        }
        setFeedback("链接已复制");
      }
      window.setTimeout(() => setFeedback(""), 2200);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setFeedback("请复制地址栏链接");
      window.setTimeout(() => setFeedback(""), 2600);
    }
  }

  return (
    <button
      type="button"
      className={`share-trigger ${className}`.trim()}
      onClick={share}
      aria-label="分享财富人生体验链接"
    >
      <span aria-hidden="true">↗</span>
      <b>{feedback || (compact ? "分享" : "分享体验")}</b>
    </button>
  );
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
  onMultiplayer,
}: {
  savedGame: GameState | null;
  onStart: (mode: ModeId, theme: ThemeId, roleId: string) => void;
  onContinue: () => void;
  onMultiplayer: () => void;
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
        <div className="setup__nav-actions">
          <button className="multiplayer-trigger" onClick={onMultiplayer}>
            <span>●</span> 2–4 人联机
          </button>
          <div className="setup__nav-note">
            <span className="live-dot" />
            规则内自由 · 本地存档
          </div>
          <ShareButton />
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
                  {ROLES.find((item) => item.id === savedGame.roleId)?.name} ·{" "}
                  {getPeriodLabel(savedGame)}
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
                    <i>{item.timeScale === "quarter" ? `${item.turns} 季度` : `${item.turns} 年`}</i>
                  </span>
                  <small>{item.timeScale === "quarter" ? `${item.years} 年 · ${item.duration}` : item.duration}</small>
                  <p>{item.description}</p>
                </button>
              ))}
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
        <span>86 个动态事件原型</span>
        <span>4 套桌面主题</span>
      </footer>
    </div>
  );
}

function Board({ state, onOpportunity }: { state: GameState; onOpportunity: () => void }) {
  const quarter = getQuarter(state);
  const recentRouteNodes = state.routeGraph.nodes
    .filter((node) => node.category !== "origin")
    .slice(-4);
  const laneDefinitions = [
    {
      id: "career",
      title: "职业与能力",
      color: "jade",
    },
    {
      id: "capital",
      title: "现金与资产",
      color: "gold",
    },
    {
      id: "life",
      title: "关系与生活",
      color: "copper",
    },
  ] as const;
  const routeLanes = laneDefinitions.map((lane) => {
    const reached = state.routeGraph.nodes.filter((node) => node.lane === lane.id).slice(-3);
    const candidate = state.routeGraph.candidates
      .filter((item) => item.lane === lane.id)
      .sort((a, b) => Number(b.ready) - Number(a.ready))[0];
    return {
      ...lane,
      nodes: [
        ...reached.map((node) => ({ ...node, candidate: false })),
        ...(candidate
          ? [{
              id: candidate.id,
              label: candidate.label,
              detail: candidate.detail,
              evidence: candidate.reason,
              status: candidate.ready ? "unlocked" as const : "locked" as const,
              candidate: true,
            }]
          : []),
      ].slice(-4),
    };
  });

  return (
    <section className="board board--routes panel-frame" aria-label="多路径人生棋盘">
      <header className="panel-heading">
        <div>
          <span className="micro-label">动态人生路线棋盘</span>
          <h2>选择会让路线生长，而不是沿固定格子前进</h2>
        </div>
        <div className="turn-seal">
          <small>{quarter ? `年龄 ${state.age} · Q${quarter}` : "人生年份"}</small>
          <b>{String(getLifeYear(state)).padStart(2, "0")}</b>
          <span>/ {state.timeScale === "quarter" ? 60 : state.maxTurns}</span>
        </div>
      </header>

      <div className="route-board">
        <div className="route-board__origin">
          <span className="route-pawn">你</span>
          <small>{getPeriodLabel(state)}</small>
        </div>
        <div className="route-board__lanes">
          {routeLanes.map((lane, laneIndex) => (
            <div className={`route-lane route-lane--${lane.color}`} key={lane.id}>
              <header>
                <span>0{laneIndex + 1}</span>
                <b>{lane.title}</b>
              </header>
              <div className="route-lane__track">
                {lane.nodes.map((node, index) => {
                  const isReached = node.status === "reached" || node.status === "scar";
                  const isCurrent = !node.candidate && index === lane.nodes.length - (lane.nodes.at(-1)?.candidate ? 2 : 1);
                  return (
                    <article
                      className={`${isReached ? "is-reached" : ""} ${node.status === "scar" ? "is-scar" : ""} ${node.status === "unlocked" ? "is-unlocked" : ""} ${node.status === "locked" ? "is-locked" : ""} ${isCurrent ? "is-current" : ""}`}
                      key={node.id}
                      title={node.evidence}
                    >
                      <i>{node.status === "scar" ? "×" : node.status === "unlocked" ? "◇" : isReached ? "•" : ""}</i>
                      <span>
                        <b>{node.label}</b>
                        <small>{node.detail}</small>
                      </span>
                      {isCurrent && <em>当前证据</em>}
                      {node.candidate && <em>{node.status === "unlocked" ? "已满足" : "待解锁"}</em>}
                    </article>
                  );
                })}
                {lane.id === "career" && (
                  <button className="route-opportunity" onClick={onOpportunity} disabled={state.opportunityTokens <= 0}>
                    <i>✦</i>
                    <span><b>自由机会格</b><small>剩余 {state.opportunityTokens} 次</small></span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <footer className="board-evidence">
        <div>
          <span className="micro-label">最近留下的路线证据</span>
          {recentRouteNodes.length ? recentRouteNodes.map((item) => (
            <span key={item.id} title={item.evidence}><i />{item.label}</span>
          )) : <small>完成普通行动后，棋盘会记录真实路径，而不是预设剧情。</small>}
        </div>
        <div>
          <span className="micro-label">AI 同桌正在走自己的路</span>
          {state.aiPlayers.map((player) => (
            <span className="board-mate" key={player.id} title={player.goal}>
              <b>{player.name}</b><small>{player.currentMove}</small>
            </span>
          ))}
        </div>
      </footer>
    </section>
  );
}

function FinanceConsole({
  state,
  onOpenLedger,
  onOpenKnowledge,
  onOpenNetwork,
  onOpenFamily,
}: {
  state: GameState;
  onOpenLedger: () => void;
  onOpenKnowledge: () => void;
  onOpenNetwork: () => void;
  onOpenFamily: () => void;
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
        <button onClick={onOpenFamily}>家庭责任账本 <span>{state.familyLedger.responsibilities.filter((item) => item.status === "active").length}</span></button>
        <button onClick={onOpenNetwork}>关系与合同 <span>{state.contracts.filter((item) => item.status === "active").length}</span></button>
      </div>
    </aside>
  );
}

function DeepSystems({ state, onOpen }: { state: GameState; onOpen: () => void }) {
  const deep = state.deep;
  if (!deep) return null;
  const homeEquity = Math.max(0, deep.housing.propertyValue - deep.housing.mortgageBalance);
  const childFund = deep.family.children.reduce((sum, child) => sum + child.educationFund, 0);
  const items = [
    {
      label: "税务",
      value: `${Math.round(deep.tax.withholdingRate * 100)}% 预缴`,
      detail: `本年已缴 ${formatCompactMoney(deep.tax.yearTaxPaid)} · 扣除 ${formatCompactMoney(deep.tax.deductions)}`,
    },
    {
      label: "保障",
      value: formatCompactMoney(
        deep.insurance.healthCoverage +
          deep.insurance.lifeCoverage +
          deep.insurance.disabilityCoverage,
      ),
      detail: `年保费 ${formatCompactMoney(deep.insurance.annualPremium)}`,
    },
    {
      label: "养老金",
      value: formatCompactMoney(deep.pension.balance),
      detail: `个人 ${Math.round(deep.pension.contributionRate * 100)}% + 雇主 ${Math.round(deep.pension.employerMatch * 100)}%`,
    },
    {
      label: "住房",
      value: deep.housing.tenure === "owner" ? formatCompactMoney(homeEquity) : "租住",
      detail:
        deep.housing.tenure === "owner"
          ? `房贷 ${formatCompactMoney(deep.housing.mortgageBalance)} · 剩 ${deep.housing.termQuarters} 季`
          : "保留迁移与流动性",
    },
    {
      label: "家庭",
      value: deep.family.partnered ? `${deep.family.children.length} 名子女` : "独立财务",
      detail: `家庭信任 ${Math.round(deep.family.familyTrust)} · 教育金 ${formatCompactMoney(childFund)}`,
    },
    {
      label: "企业",
      value: deep.business.active ? `${deep.business.employees} 人团队` : "尚未创办",
      detail: deep.business.active
        ? `企业现金 ${formatCompactMoney(deep.business.cash)} · 月营收 ${formatCompactMoney(deep.business.monthlyRevenue)}`
        : "企业账户与个人账户独立",
    },
    {
      label: "代际",
      value: `${Math.round(deep.legacy.generationScore)} 分`,
      detail: `${deep.legacy.willReady ? "遗嘱已建立" : "尚无遗嘱"} · ${deep.legacy.heirs} 位继承人`,
    },
  ];
  return (
    <section className="deep-systems panel-frame" aria-label="深度人生长期系统">
      <header>
        <div>
          <span className="micro-label">60 年长期账本 · 年龄 {state.age}</span>
          <h2>七套系统正在同时运转</h2>
        </div>
        <button onClick={onOpen}>安排长期行动 <span>→</span></button>
      </header>
      <div className="deep-systems__grid">
        {items.map((item) => (
          <article key={item.label}>
            <span>{item.label}</span>
            <b>{item.value}</b>
            <small>{item.detail}</small>
          </article>
        ))}
      </div>
    </section>
  );
}

function StoryStage({
  state,
  onResolvePersonal,
  onResolveMacro,
  onOpenAudit,
  onEnterActions,
  onFinishActions,
  onFinishInteraction,
  onAIInteraction,
  onRemovePlan,
  onSkipPersonal,
  onSettle,
  onContinueLearning,
}: {
  state: GameState;
  onResolvePersonal: (choiceId: string) => void;
  onResolveMacro: (choiceId: string) => void;
  onOpenAudit: () => void;
  onEnterActions: () => void;
  onFinishActions: () => void;
  onFinishInteraction: () => void;
  onAIInteraction: (playerId: string, interactionId: string) => void;
  onRemovePlan: (planId: string) => void;
  onSkipPersonal: () => void;
  onSettle: () => void;
  onContinueLearning: () => void;
}) {
  const latestAudit = state.audits.at(-1);
  const periodNoun = state.timeScale === "quarter" ? "季度" : "年度";
  const periodLabel = getPeriodLabel(state);
  const months = state.timeScale === "quarter" ? 3 : 12;
  const plannedTime = state.plan.reduce((sum, item) => sum + item.timeCost, 0);
  const completedTurn = Math.max(1, state.turnPhase === "learning" ? state.turn - 1 : state.turn);
  const recentOutcomes = state.history
    .filter((item) => item.turn === completedTurn && (item.type === "action" || item.type === "event"))
    .slice(-6);
  const latestSettlement = [...state.history].reverse().find((item) => item.type === "settlement");
  const phaseSteps = [
    ["world", "世界观察"],
    ["action", "普通行动"],
    ["interaction", "玩家互动"],
    ["macro", "宏观事件"],
    ["personal", "个人事件"],
    ["settlement", "统一结算"],
    ["learning", "学习反馈"],
  ] as const;
  const activeIndex = phaseSteps.findIndex(([phase]) => phase === state.turnPhase);

  return (
    <section className={`story-stage turn-table turn-table--${state.turnPhase}`} aria-live="polite">
      <div className="year-flow year-flow--spec" aria-label={`${periodNoun}回合流程`}>
        {phaseSteps.map(([phase, label], index) => {
          return (
            <span
              key={phase}
              className={index === activeIndex ? "is-current" : index < activeIndex ? "is-done" : ""}
            >
              <i>{index < activeIndex ? "✓" : index + 1}</i>
              {label}
            </span>
          );
        })}
      </div>

      {state.turnPhase === "world" && (
        <div className="turn-scene world-scene">
          <header className="scene-heading">
            <div><span>01 · 世界与个人状态</span><h2>{state.annualBriefing.headline}</h2></div>
            <b>{periodLabel}</b>
          </header>
          <div className="world-scene__grid">
            <article className="table-card table-card--news">
              <span className="card-suit">世界</span>
              <h3>{state.world.cycle}期的城市新闻</h3>
              <p>{state.annualBriefing.cityNews}</p>
              <footer><b>风险观察</b><small>{state.annualBriefing.riskNote}</small></footer>
            </article>
            <article className="table-card table-card--identity">
              <span className="card-suit">个人</span>
              <div className="identity-reading">
                <b>{ROLES.find((item) => item.id === state.roleId)?.name}</b>
                <small>{CAREERS.find((item) => item.id === state.currentCareerId)?.name}</small>
              </div>
              <dl>
                <div><dt>可支配时间</dt><dd>{state.actionBudget} 点</dd></div>
                <div><dt>精力 / 压力</dt><dd>{Math.round(state.energy)} / {Math.round(state.stress)}</dd></div>
                <div><dt>现金缓冲</dt><dd>{getEmergencyMonths(state).toFixed(1)} 月</dd></div>
              </dl>
            </article>
            <article className="table-card table-card--message">
              <span className="card-suit">来信</span>
              <div className="message-speaker"><i>{state.annualBriefing.message.sender.slice(0, 1)}</i><span><b>{state.annualBriefing.message.sender}</b><small>{state.annualBriefing.message.role}</small></span></div>
              <p>{state.annualBriefing.message.body}</p>
              <footer><small>{state.annualBriefing.routeUpdate}</small></footer>
            </article>
          </div>
          <div className="phase-actions phase-actions--scene">
            <span><b>先读局势，再做决定</b><small>下一阶段会同时占用时间、现金、精力、信用与关系资源。</small></span>
            <button className="primary-button" onClick={onEnterActions}>进入普通行动 <span>→</span></button>
          </div>
        </div>
      )}

      {state.turnPhase === "action" && (
        <div className="turn-scene action-scene">
          <header className="scene-heading">
            <div><span>02 · 普通行动</span><h2>经营多条人生路线，但必须承担资源冲突</h2></div>
            <b>{plannedTime}/{state.actionBudget} 时间</b>
          </header>
          <div className="action-plan-board">
            {state.plan.map((item) => (
              <article key={item.id} className={`plan-card plan-card--${item.kind}`}>
                <span>{item.category}</span><h3>{item.label}</h3>
                <p>{item.timeCost} 点时间{item.cashCost ? ` · ${formatMoney(item.cashCost)}` : " · 无直接现金成本"}</p>
                {item.kind !== "core" && <button onClick={() => onRemovePlan(item.id)} aria-label={`移除${item.label}`}>移除</button>}
              </article>
            ))}
            {Array.from({ length: Math.max(0, state.actionBudget - plannedTime) }, (_, index) => (
              <i className="action-time-slot" key={index}>可用时间</i>
            ))}
          </div>
          <div className="resource-conflict">
            <b>资源冲突</b>
            <p>{plannedTime >= state.actionBudget ? "时间已经排满，过劳会放大个人事件的代价。" : `仍保留 ${state.actionBudget - plannedTime} 点恢复空间；保留时间也是一种选择。`}</p>
          </div>
          <div className="phase-actions phase-actions--scene">
            <span><b>普通行动完成后不能再添加职业、投资或学习</b><small>玩家互动会单独进入下一阶段，不再混在同一张计划表里。</small></span>
            <button className="primary-button" onClick={onFinishActions}>完成普通行动 <span>→</span></button>
          </div>
        </div>
      )}

      {state.turnPhase === "interaction" && (
        <div className="turn-scene interaction-scene">
          <header className="scene-heading">
            <div><span>03 · 玩家互动</span><h2>他们有自己的目标，也可以拒绝你</h2></div>
            <b>{state.plan.filter((item) => item.kind === "social").length} 项互动</b>
          </header>
          <div className="interaction-table">
            {state.aiPlayers.map((player) => {
              const alreadyPlanned = state.plan.some((item) => item.kind === "social" && item.targetPlayerId === player.id);
              return (
                <article key={player.id}>
                  <header><i>{player.name.slice(0, 1)}</i><span><b>{player.name}</b><small>{player.archetype} · 信任 {Math.round(player.trust)}</small></span></header>
                  <p><b>目标</b>{player.goal}</p>
                  <p><b>底线</b>{player.boundary}</p>
                  <div>
                    {AI_INTERACTIONS.slice(0, 3).map((interaction) => (
                      <button key={interaction.id} disabled={alreadyPlanned} onClick={() => onAIInteraction(player.id, interaction.id)}>
                        {interaction.label}<small>{interaction.timeCost} 时间{interaction.cashCost ? ` · ${formatMoney(interaction.cashCost)}` : ""}</small>
                      </button>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
          <div className="phase-actions phase-actions--scene">
            <span><b>允许保持独立</b><small>没有互动也是选择；同桌角色仍会按自己的目标继续行动。</small></span>
            <button className="primary-button" onClick={onFinishInteraction}>锁定行动并进入宏观事件 <span>→</span></button>
          </div>
        </div>
      )}

      {state.turnPhase === "macro" && state.macroEvent && (
        <div className="turn-scene event-table event-table--macro">
          <header className="event-card-hero">
            <span>04 · 宏观公共事件</span><h2>{state.macroEvent.title}</h2>
            <p>{state.macroEvent.narrative}</p>
            <small>{state.macroEvent.background}</small>
            <div>{state.macroEvent.affected.map((item) => <i key={item}>{item}</i>)}</div>
          </header>
          <div className="choice-cards">
            {state.macroEvent.choices.map((choice, index) => (
              <button key={choice.id} onClick={() => onResolveMacro(choice.id)}>
                <span>0{index + 1}</span><h3>{choice.label}</h3><p>{choice.description}</p>
                <footer><b>{choice.risk}风险</b><small>{(choice.effects.cash ?? 0) < 0 ? `投入 ${formatMoney(Math.abs(choice.effects.cash ?? 0))}` : "不要求直接投入"}</small></footer>
              </button>
            ))}
          </div>
        </div>
      )}

      {state.turnPhase === "personal" && (
        <div className="turn-scene event-table event-table--personal">
          {state.pendingEvent ? (
            <>
              <header className="event-card-hero">
                <span>05 · {state.pendingEvent.event.type}事件</span><h2>{state.pendingEvent.event.title}</h2>
                <p>{state.pendingEvent.event.narrative}</p>
                <small>
                  事件导演：{state.eventDirector.lastDecision?.reasons.join("；") ?? "读取行动历史、关系状态与世界环境"}。
                  同一选择不会保证同一结果。
                </small>
              </header>
              <div className="choice-cards">
                {state.pendingEvent.event.choices.map((choice, index) => (
                  <button key={choice.id} onClick={() => onResolvePersonal(choice.id)}>
                    <span>0{index + 1}</span><h3>{choice.label}</h3><p>{choice.description}</p>
                    <footer><b>{choice.risk}风险</b><small>{choice.cost ? `投入 ${formatMoney(choice.cost)}` : "无直接现金成本"}</small></footer>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="empty-event"><span>05 · 个人与关系事件</span><h2>这一期没有额外事件牌</h2><p>没有突发事件不等于没有代价；普通行动与宏观选择仍会进入结算。</p><button className="primary-button" onClick={onSkipPersonal}>进入统一结算 <span>→</span></button></div>
          )}
        </div>
      )}

      {state.turnPhase === "settlement" && (
        <div className="turn-scene settlement-scene">
          <header className="scene-heading"><div><span>06 · 资产与状态结算</span><h2>把叙事重新落回现金流和承受力</h2></div><b>{periodLabel}</b></header>
          <div className="settlement-ledger">
            <article><span>主动收入</span><b className="is-positive">{formatSignedMoney(state.monthlyIncome * months)}</b><small>{months} 个月</small></article>
            <article><span>被动收入</span><b className="is-positive">{formatSignedMoney(state.passiveIncome * months)}</b><small>{state.assets.length} 项资产</small></article>
            <article><span>固定与可变支出</span><b className="is-negative">{formatSignedMoney(-(state.fixedExpense + state.variableExpense) * months)}</b><small>不含债务利息</small></article>
            <article><span>当前负债</span><b>{formatMoney(state.debt)}</b><small>利率 {(state.world.interestRate * 100 + 2.5).toFixed(1)}%</small></article>
          </div>
          <div className="settlement-exposure"><span>结算还会更新</span><p>市场价格、债务利息、健康与精力、AI角色行动{state.deep ? "、税务、养老、保险、住房、家庭与企业" : ""}。</p></div>
          <div className="phase-actions phase-actions--scene"><span><b>结算不是奖励动画</b><small>它会把所有选择的收入、支出、风险与延迟后果统一记账。</small></span><button className="primary-button" onClick={onSettle}>执行本{periodNoun}结算 <span>→</span></button></div>
        </div>
      )}

      {state.turnPhase === "learning" && (
        <div className="turn-scene learning-scene">
          <header className="scene-heading"><div><span>07 · 学习反馈</span><h2>这次结果由什么造成？</h2></div>{state.chapterSummary ? <b>章节 {state.chapterSummary.index}</b> : <b>已记录</b>}</header>
          <div className="learning-grid">
            <article className="learning-ledger"><span>本期账目</span><h3>{latestSettlement?.title ?? "统一结算完成"}</h3><p>{latestSettlement?.description ?? "本期状态已经写入人生账本。"}</p></article>
            <article className="learning-audit"><span>规则快照</span>{latestAudit ? <><h3>{latestAudit.success ? "准备与运气落在成功区间" : "这次结果落在失败区间"}</h3><p>{latestAudit.summary.slice(0, 3).join("；")}。</p><button onClick={onOpenAudit}>查看完整概率快照 →</button></> : <><h3>尚无概率裁决</h3><p>确定性行动仍会记录现金和时间成本。</p></>}</article>
          </div>
          <div className="outcome-timeline">
            <span>行动与事件留下的因果</span>
            {recentOutcomes.length ? recentOutcomes.map((item) => <article key={item.id}><i /><div><b>{item.title}</b><p>{item.description}</p></div>{item.cashDelta ? <em className={item.cashDelta >= 0 ? "is-positive" : "is-negative"}>{formatSignedMoney(item.cashDelta)}</em> : null}</article>) : <p>本期没有额外行动记录。</p>}
          </div>
          {state.chapterSummary && (
            <div className="chapter-inline"><span>人生章节 · {state.chapterSummary.years}</span><b>{state.chapterSummary.title} · 韧性 {state.chapterSummary.resilience}</b><p>{state.chapterSummary.headline}</p></div>
          )}
          <div className="phase-actions phase-actions--scene"><span><b>反馈只解释，不替你决定</b><small>下一期仍要重新观察世界，不存在固定必胜路线。</small></span><button className="primary-button" onClick={onContinueLearning}>进入下一期世界观察 <span>→</span></button></div>
        </div>
      )}
    </section>
  );
}

function ActionDock({
  state,
  onOpen,
  onFinish,
}: {
  state: GameState;
  onOpen: (modal: ModalName) => void;
  onFinish: () => void;
}) {
  const plannedTime = state.plan.reduce((sum, item) => sum + item.timeCost, 0);
  const remainingTime = Math.max(0, state.actionBudget - plannedTime);
  const actions: Array<[ModalName, string, string, string]> = [
    ["careers", "职业", "跳槽·转行·晋升", "职"],
    ["skills", "学习", "技能组合·证据", "学"],
    ["actions", "收入与生活", "副业·家庭·休整", "生"],
    ["assets", "投资", "资产·风险·流动性", "投"],
    ["opportunity", "自由机会", `剩余 ${state.opportunityTokens} 次`, "✦"],
  ];
  if (state.deep) {
    actions.splice(4, 0, ["deep", "长期责任", "税·保·房·企·家", "久"]);
  }
  return (
    <nav className="action-dock" aria-label="本回合行动">
      <div className="action-points">
        <span className="micro-label">时间预算</span>
        <div>
          {Array.from({ length: state.actionBudget }, (_, index) => (
            <i key={index} className={index < plannedTime ? "is-filled" : ""} />
          ))}
        </div>
        <b>{plannedTime}/{state.actionBudget}</b>
      </div>
      <div className="action-dock__items">
        {actions.map(([modal, label, sub, icon]) => (
          <button
            key={label}
            disabled={modal === "opportunity" && state.opportunityTokens <= 0}
            onClick={() => onOpen(modal)}
          >
            <span aria-hidden="true">{icon}</span>
            <strong>{label}</strong>
            <small>{sub}</small>
          </button>
        ))}
      </div>
      <button className="advance-button" onClick={onFinish}>
        <span>
          <small>{remainingTime === 0 ? "时间预算已排满" : `保留 ${remainingTime} 点恢复空间`}</small>
          完成普通行动
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
  onDeepAction,
}: {
  type: "skills" | "careers" | "assets" | "actions" | "deep";
  state: GameState;
  onClose: () => void;
  onSkill: (id: string) => void;
  onCareer: (id: string) => void;
  onAsset: (id: string) => void;
  onLifeAction: (id: string) => void;
  onDeepAction: (id: DeepActionId) => void;
}) {
  const [filter, setFilter] = useState("全部");
  const [search, setSearch] = useState("");
  const config = {
    skills: ["学习市场", "把时间变成人力资本", "选择技能后，隐藏天赋会通过真实样本逐步揭示。"],
    careers: ["职业分岔", "不被一张职业卡定义", "转行需要现金、时间、技能与环境共同支持。"],
    assets: ["资产市场", "让现金承担不同任务", "系统同时模拟收益、波动、流动性与集中风险。"],
    actions: ["人生行动", "钱不是唯一资源", "副业、家庭、关系和健康会共同改变长期结果。"],
    deep: ["长期系统", "让 60 年不只是一个计数器", "税费、保障、养老金、住房、家庭、企业与传承会在每个季度持续结算。"],
  }[type];

  const items =
    type === "skills"
      ? SKILLS
      : type === "careers"
        ? CAREERS
        : type === "assets"
          ? ASSETS
          : type === "deep"
            ? DEEP_ACTIONS
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
  const portfolio = getPortfolioDiagnostics(state);

  return (
    <BaseModal eyebrow={config[0]} title={config[1]} onClose={onClose} wide>
      <p className="modal-intro">{config[2]}</p>
      {type === "assets" && state.assets.length > 0 && (
        <div className="portfolio-strip">
          <span><small>组合市值</small><b>{formatMoney(portfolio.totalValue)}</b></span>
          <span><small>未实现盈亏</small><b className={portfolio.unrealizedGain >= 0 ? "is-positive" : "is-negative"}>{formatSignedMoney(portfolio.unrealizedGain)}</b></span>
          <span><small>最大持仓</small><b>{Math.round(portfolio.largestPositionShare * 100)}%</b></span>
          <span><small>加权流动性</small><b>{Math.round(portfolio.weightedLiquidity * 100)}</b></span>
        </div>
      )}
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
            const prerequisites = getSkillPrerequisites(skill.id);
            const unmet = getUnmetSkillPrerequisites(state.skills, skill.id);
            const combinations = SKILL_COMBINATIONS.filter((combination) => combination.skillIds.includes(skill.id));
            return (
              <button className="catalog-card" key={skill.id} disabled={unmet.length > 0} onClick={() => onSkill(skill.id)}>
                <span className="catalog-card__label">{skill.category}</span>
                <h3>{skill.name}</h3>
                <p>{skill.description}</p>
                <div className="skill-level">
                  <span>{getMasteryBand(level)}</span>
                  <i><em style={{ width: `${(level / 5) * 100}%` }} /></i>
                  <b>{level.toFixed(1)}</b>
                </div>
                {prerequisites.length > 0 && (
                  <div className={`catalog-requirement ${unmet.length ? "is-blocked" : "is-ready"}`}>
                    <span>{unmet.length ? "前置未满足" : "前置已满足"}</span>
                    <small>{prerequisites.map((entry) => `${SKILLS.find((candidate) => candidate.id === entry.skillId)?.name} ${entry.level.toFixed(1)}`).join(" · ")}</small>
                  </div>
                )}
                {combinations.length > 0 && <small className="combo-hint">可组成：{combinations.map((entry) => entry.name).join(" / ")}</small>}
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
            const readiness = getCareerReadiness(state, career);
            return (
              <button className={`catalog-card ${current ? "is-current" : ""}`} key={career.id} disabled={current} onClick={() => onCareer(career.id)}>
                <span className="catalog-card__label">{career.category}</span>
                <h3>{career.name}</h3>
                <p>稳定性 {Math.round(career.stability * 100)} · 压力 {career.stress} · 目标熟练度 {readiness.requiredLevel.toFixed(1)}</p>
                <div className="career-match">
                  <span>{readiness.label}</span>
                  <i><em style={{ width: `${readiness.score * 100}%` }} /></i>
                  <b>{Math.round(readiness.score * 100)}%</b>
                </div>
                <small className="combo-hint">{readiness.skills.map((entry) => `${entry.name} ${entry.current.toFixed(1)}/${entry.required.toFixed(1)}`).join(" · ")}</small>
                {readiness.blockers.length > 0 && <div className="catalog-requirement is-blocked"><span>主要缺口</span><small>{readiness.blockers.slice(0, 2).join("；")}</small></div>}
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
          if (type === "deep") {
            const action = item as (typeof DEEP_ACTIONS)[number];
            const available = !action.requires || action.requires(state);
            return (
              <button
                className="catalog-card"
                key={action.id}
                disabled={!available}
                onClick={() => onDeepAction(action.id)}
              >
                <span className="catalog-card__label">{action.category} · 按季度持续</span>
                <h3>{action.name}</h3>
                <p>{action.description}</p>
                <div className="tag-row">
                  <span>长期账本</span>
                  <span>{available ? getPeriodLabel(state) : action.requiresLabel}</span>
                </div>
                <footer>
                  <span>{action.cashCost ? formatMoney(action.cashCost) : "无直接支出"}</span>
                  <span>{action.points} 点时间</span>
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
  const [generationSource, setGenerationSource] = useState<"openai" | "local" | "">("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function generate() {
    setError("");
    setLoading(true);
    try {
      let result: ReturnType<typeof generateOpportunityCards>;
      if (document.body.dataset.runtime === "static") {
        result = generateOpportunityCards(intent);
      } else {
        try {
          const response = await fetch("/api/opportunity", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              intent,
              context: {
                turn: state.turn,
                maxTurns: state.maxTurns,
                city: state.world.city,
                cycle: state.world.cycle,
                roleName: ROLES.find((item) => item.id === state.roleId)?.name,
                cash: state.cash,
                monthlyIncome: state.monthlyIncome,
                fixedExpense: state.fixedExpense,
                energy: state.energy,
                relationship: state.relationship,
                skills: Object.entries(state.skills)
                  .filter(([, level]) => level > 0)
                  .map(([id]) => id),
                memories: Object.entries(state.memory)
                  .filter(([, count]) => count > 0)
                  .map(([tag]) => tag),
              },
            }),
          });
          const payload = await response.json();
          if (!response.ok) throw new Error(payload.error);
          result = payload;
        } catch {
          result = generateOpportunityCards(intent);
        }
      }
      setCards(result.cards);
      setMapping(result.ruleMapping);
      setNormalizedGoal(result.normalizedGoal);
      setGenerationSource(result.source);
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
            <span>
              归一化目标
              <i className={`ai-source ai-source--${generationSource}`}>
                {generationSource === "openai" ? "真实 AI" : "本地规则"}
              </i>
            </span>
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
                <footer>加入普通行动，稍后查看因果 <span>↗</span></footer>
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
  onAIInteraction,
  onAssetSale,
  onContractAction,
}: {
  type: "ledger" | "knowledge" | "network" | "family" | "audit" | "help";
  state: GameState;
  onClose: () => void;
  onAIInteraction?: (playerId: string, interactionId: string) => void;
  onAssetSale?: (assetId: string, fraction: 0.25 | 1) => void;
  onContractAction?: (contractId: string, action: "fulfill" | "exit") => void;
}) {
  if (type === "ledger") {
    const portfolio = getPortfolioDiagnostics(state);
    return (
      <BaseModal eyebrow="资产负债表" title="钱在哪里，以及为什么变化" onClose={onClose} wide>
        <div className="ledger-summary">
          <div><span>现金</span><b>{formatMoney(state.cash)}</b></div>
          <div><span>资产市值</span><b>{formatMoney(state.assets.reduce((sum, item) => sum + item.value, 0))}</b></div>
          <div><span>负债</span><b>{formatMoney(state.debt)}</b></div>
          <div><span>净资产</span><b>{formatMoney(getNetWorth(state))}</b></div>
        </div>
        {state.assets.length > 0 && (
          <>
            <h3 className="section-title">组合风险诊断</h3>
            <div className="portfolio-diagnostics">
              <article><span>分散度</span><b>{Math.round(portfolio.diversificationScore * 100)}</b><small>越高越不依赖单一持仓</small></article>
              <article><span>最大持仓</span><b>{Math.round(portfolio.largestPositionShare * 100)}%</b><small>单一判断的结果权重</small></article>
              <article><span>高风险占比</span><b>{Math.round(portfolio.highRiskShare * 100)}%</b><small>高与极高风险持仓</small></article>
              <article><span>组合流动性</span><b>{Math.round(portfolio.weightedLiquidity * 100)}</b><small>急需现金时的可变现能力</small></article>
            </div>
            <div className="allocation-list">
              {portfolio.allocations.map((allocation) => (
                <span key={allocation.category}><b>{allocation.category}</b><i><em style={{ width: `${allocation.share * 100}%` }} /></i><small>{Math.round(allocation.share * 100)}%</small></span>
              ))}
            </div>
            {portfolio.warnings.length > 0 && <div className="portfolio-warnings">{portfolio.warnings.map((warning) => <p key={warning}>风险提示 · {warning}</p>)}</div>}
          </>
        )}
        {state.deep && (
          <>
            <h3 className="section-title">深度人生长期账户</h3>
            <div className="ledger-table">
              <div>
                <span><b>养老金账户</b><small>个人缴费 + 雇主匹配 + 长期收益</small></span>
                <span>{Math.round(state.deep.pension.contributionRate * 100)}% 缴费</span>
                <strong>{formatMoney(state.deep.pension.balance)}</strong>
              </div>
              <div>
                <span><b>住房权益</b><small>{state.deep.housing.tenure === "owner" ? `剩余 ${state.deep.housing.termQuarters} 季` : "当前租住"}</small></span>
                <span>房贷 {formatMoney(state.deep.housing.mortgageBalance)}</span>
                <strong>{formatMoney(Math.max(0, state.deep.housing.propertyValue - state.deep.housing.mortgageBalance))}</strong>
              </div>
              <div>
                <span><b>企业账户</b><small>{state.deep.business.active ? `${state.deep.business.employees} 人 · 治理 ${state.deep.business.governance}` : "尚未创业"}</small></span>
                <span>库存 {formatMoney(state.deep.business.inventory)}</span>
                <strong>{formatMoney(state.deep.business.cash)}</strong>
              </div>
              <div>
                <span><b>家庭与教育金</b><small>{state.deep.family.children.length} 名子女 · 信任 {Math.round(state.deep.family.familyTrust)}</small></span>
                <span>共同现金 {formatMoney(state.deep.family.sharedCash)}</span>
                <strong>{formatMoney(state.deep.family.children.reduce((sum, child) => sum + child.educationFund, 0))}</strong>
              </div>
            </div>
          </>
        )}
        <h3 className="section-title">持有资产</h3>
        <div className="ledger-table">
          {state.assets.length ? state.assets.map((asset) => {
            const quote = getAssetSaleQuote(state, asset.id, 1);
            return (
              <div key={asset.id} className="ledger-holding">
                <span><b>{asset.name}</b><small>{asset.category} · {asset.risk}风险 · 盈亏 {formatSignedMoney(asset.value - asset.costBasis)}</small></span>
                <span>成本 {formatMoney(asset.costBasis)}<small>{quote ? `全部变现预计折价 ${(quote.haircutRate * 100).toFixed(1)}%` : ""}</small></span>
                <strong>{formatMoney(asset.value)}</strong>
                <aside className="holding-actions">
                  <button disabled={state.yearPhase !== "planning"} onClick={() => onAssetSale?.(asset.id, 0.25)}>计划卖出 25%</button>
                  <button disabled={state.yearPhase !== "planning"} onClick={() => onAssetSale?.(asset.id, 1)}>计划全部变现</button>
                </aside>
              </div>
            );
          }) : <p className="empty-note">你还没有持有投资资产。现金本身也承担流动性任务。</p>}
        </div>
        <h3 className="section-title">最近现金变动</h3>
        <div className="history-list">
          {state.history.slice(-10).reverse().map((entry) => (
            <div key={entry.id}>
              <span><b>{entry.title}</b><small>{getPeriodLabel({ turn: entry.turn, timeScale: state.timeScale })} · {entry.description}</small></span>
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
  if (type === "family") {
    const pressure = getFamilyPressure(state.familyLedger);
    const stageNames = {
      independent: "独立财务",
      partnered: "共同家庭",
      caregiving: "代际照护",
      parenting: "育儿阶段",
      multigenerational: "多代责任",
    } as const;
    return (
      <BaseModal eyebrow="家庭责任账本" title="爱与责任也需要现金、时间和边界" onClose={onClose} wide>
        <div className="family-summary">
          <article><span>家庭阶段</span><b>{stageNames[state.familyLedger.stage]}</b><small>阶段来自真实行动与事件</small></article>
          <article><span>家庭信任</span><b>{Math.round(state.familyLedger.trust)}</b><small>透明沟通与履约共同积累</small></article>
          <article><span>责任负荷</span><b>{Math.round(pressure.pressureScore)}</b><small>{pressure.activeCount} 项持续责任</small></article>
          <article><span>共同现金</span><b>{formatMoney(state.familyLedger.sharedCash)}</b><small>不等于玩家可随意支配现金</small></article>
        </div>
        <p className="family-pressure-note">{pressure.warning}</p>
        <h3 className="section-title">持续责任</h3>
        <div className="responsibility-list">
          {state.familyLedger.responsibilities.length ? state.familyLedger.responsibilities.map((responsibility) => (
            <article key={responsibility.id}>
              <span><b>{responsibility.title}</b><small>{responsibility.owner === "shared" ? "共同承担" : "由你承担"} · {responsibility.priority}</small></span>
              <span>{formatMoney(responsibility.cashPerPeriod)} / 期</span>
              <span>{responsibility.timePerPeriod} 点关注</span>
              <em>{responsibility.status === "active" ? "持续中" : responsibility.status === "paused" ? "已暂停" : "已完成"}</em>
            </article>
          )) : <p className="empty-note">当前尚未建立共同财务、保障、育儿或照护责任。家庭路线会由实际选择开始生长。</p>}
        </div>
        <h3 className="section-title">家庭决策记录</h3>
        <div className="family-decisions">
          {state.familyLedger.decisions.slice(-8).reverse().map((decision) => (
            <article key={decision.id}><span>第 {decision.turn} 期 · {decision.title}</span><b>{decision.choice}</b><p>{decision.outcome} · 信任 {decision.trustDelta >= 0 ? "+" : ""}{decision.trustDelta}</p></article>
          ))}
          {!state.familyLedger.decisions.length && <p className="empty-note">还没有家庭共同决策记录。</p>}
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
                {player.lastDecision && <p className="ai-decision-reason">判断理由：{player.lastDecision.reason}</p>}
                <p className="character-trait">{player.personality}</p>
                <small>底线：{player.boundary}</small>
              </div>
              <dl>
                <div><dt>信任</dt><dd>{player.trust}</dd></div>
                <div><dt>现金</dt><dd>{formatCompactMoney(player.cash)}</dd></div>
                <div><dt>收入</dt><dd>{formatCompactMoney(player.monthlyIncome)}</dd></div>
                <div><dt>压力</dt><dd>{Math.round(player.stress)}</dd></div>
              </dl>
              <div className="character-memory">
                <span>长期记忆</span>
                <small>{player.memories.slice(-2).join(" · ")}</small>
              </div>
              {state.turnPhase === "interaction" && onAIInteraction && (
                <div className="character-actions">
                  {AI_INTERACTIONS.map((interaction) => (
                    <button
                      key={interaction.id}
                      onClick={() => onAIInteraction(player.id, interaction.id)}
                      title={interaction.description}
                    >
                      {interaction.label}
                      <small>{interaction.timeCost} 点</small>
                    </button>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
        <h3 className="section-title">合同簿</h3>
        <div className="contract-book">
          {state.contracts.length ? state.contracts.slice().reverse().map((contract) => (
            <article key={contract.id} className={`contract-card contract-card--${contract.status}`}>
              <header><span>{contract.type === "joint_project" ? "联合项目" : contract.type}</span><b>{contract.status === "active" ? "生效中" : contract.status === "rejected" ? "已拒绝" : contract.status === "completed" ? "已完成" : contract.status === "breached" ? "已违约" : "已终止"}</b></header>
              <h3>{contract.title}</h3>
              <p>你的义务：{contract.playerDuty}</p>
              <p>对方义务：{contract.counterpartyDuty}</p>
              <small>下次履约：第 {contract.nextDueTurn} 期 · 退出成本 {formatMoney(contract.exitCost)}</small>
              <div className="contract-records">{contract.records.slice(-3).map((record, index) => <span key={`${record.turn}-${record.action}-${index}`}>第 {record.turn} 期 · {record.detail}</span>)}</div>
              {contract.status === "active" && state.turnPhase === "action" && (
                <footer>
                  <button onClick={() => onContractAction?.(contract.id, "fulfill")}>加入本期履约计划</button>
                  <button onClick={() => onContractAction?.(contract.id, "exit")}>按条款退出</button>
                </footer>
              )}
            </article>
          )) : <p className="empty-note">尚未形成正式合同。联合项目只有被对方接受后才会进入合同簿。</p>}
        </div>
        <p className="modal-footnote">
          角色会依据目标、信任、财务状态与底线独立回应；互动会进入长期记忆，不是固定加成。
        </p>
      </BaseModal>
    );
  }
  if (type === "audit") {
    const activeReveal = state.reveals[state.revealIndex];
    const audit = activeReveal?.auditId
      ? state.audits.find((item) => item.id === activeReveal.auditId)
      : state.audits.at(-1);
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
        <li><b>01</b><span><strong>读开场</strong>城市新闻、人物消息与过去承诺会一起改变本期棋盘。</span></li>
        <li><b>02</b><span><strong>排计划</strong>主业占用基础时间，剩余时间同时安排学习、关系、家庭、投资或休整。</span></li>
        <li><b>03</b><span><strong>看揭晓</strong>卡牌逐张翻开，概率修正、数值变化、人物回应和延迟后果分阶段出现。</span></li>
        <li><b>04</b><span><strong>过章节</strong>每三年生成一段人生章节；深度人生在每个季度额外结算长期账本。</span></li>
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
        <span>{role?.name} · {state.timeScale === "quarter" ? "60 年 · 240 季度" : `${state.maxTurns} 年`}人生实验</span>
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
                <span>{getPeriodLabel({ turn: item.turn, timeScale: state.timeScale })}</span>
                <div><h3>{item.title}</h3><p>{item.description}</p></div>
                <b className={(item.cashDelta ?? 0) >= 0 ? "is-positive" : "is-negative"}>
                  {item.cashDelta === undefined ? "非现金影响" : formatSignedMoney(item.cashDelta)}
                </b>
              </article>
            ))}
          </div>
          {report.causalChains.length > 0 && (
            <div className="causal-chains">
              <span className="micro-label">由路线图回放的真实因果链</span>
              {report.causalChains.map((chain) => (
                <article key={chain.lane}>
                  <small>{chain.title} · 涉及第 {chain.turns.join("、")} 年</small>
                  <h3>{chain.cause}</h3>
                  <p>{chain.effect}</p>
                  <blockquote>{chain.evidence}</blockquote>
                </article>
              ))}
            </div>
          )}
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
            <ShareButton className="share-trigger--review" />
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
  const [soundOn, setSoundOn] = useState(true);
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
      if (soundOn) {
        try {
          const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
          if (AudioContextClass) {
            const context = new AudioContextClass();
            const oscillator = context.createOscillator();
            const gain = context.createGain();
            oscillator.type = result.state.turnPhase === "macro" || result.state.turnPhase === "personal" ? "triangle" : "sine";
            oscillator.frequency.setValueAtTime(
              result.state.turnPhase === "learning" ? 392 : result.state.turnPhase === "settlement" ? 330 : 260,
              context.currentTime,
            );
            gain.gain.setValueAtTime(0.0001, context.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.055, context.currentTime + 0.015);
            gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.16);
            oscillator.connect(gain);
            gain.connect(context.destination);
            oscillator.start();
            oscillator.stop(context.currentTime + 0.18);
            oscillator.addEventListener("ended", () => void context.close());
          }
        } catch {
          // Audio feedback is progressive enhancement.
        }
      }
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
          {state.deep && <span><small>人生</small>{state.age} 岁 · Q{getQuarter(state)}</span>}
        </div>
        <div className="game-topbar__actions">
          <label className="theme-switcher">
            <span>主题</span>
            <select value={state.theme} onChange={(event) => onState(changeTheme(state, event.target.value as ThemeId))}>
              {THEMES.map((theme) => <option value={theme.id} key={theme.id}>{theme.name}</option>)}
            </select>
          </label>
          <ShareButton compact className="share-trigger--topbar" />
          <button
            className="sound-button"
            onClick={() => setSoundOn((current) => !current)}
            aria-label={soundOn ? "关闭声音反馈" : "开启声音反馈"}
            title={soundOn ? "声音反馈已开启" : "声音反馈已关闭"}
          >
            {soundOn ? "♪" : "—"}
          </button>
          <button className="help-button" onClick={() => setModal("help")} aria-label="帮助">?</button>
          <button className="identity-button" onClick={onExit}>
            <span>{role?.name.slice(0, 1)}</span>
            <b>{role?.name}</b>
          </button>
        </div>
      </header>

      <main className="game-main">
        <div className="game-grid">
          <Board state={state} onOpportunity={() => setModal("opportunity")} />
          <FinanceConsole
            state={state}
            onOpenLedger={() => setModal("ledger")}
            onOpenKnowledge={() => setModal("knowledge")}
            onOpenFamily={() => setModal("family")}
            onOpenNetwork={() => setModal("network")}
          />
        </div>
        {state.deep && <DeepSystems state={state} onOpen={() => setModal("deep")} />}
        <StoryStage
          state={state}
          onResolvePersonal={(choiceId) => applyResult(resolvePersonalEventPhase(state, choiceId), false)}
          onResolveMacro={(choiceId) => applyResult(resolveMacroEventPhase(state, choiceId), false)}
          onOpenAudit={() => setModal("audit")}
          onEnterActions={() => applyResult(enterOrdinaryActionPhase(state), false)}
          onFinishActions={() => applyResult(finishOrdinaryActionPhase(state), false)}
          onFinishInteraction={() => applyResult(finishPlayerInteractionPhase(state), false)}
          onAIInteraction={(playerId, interactionId) => applyResult(scheduleAIInteraction(state, playerId, interactionId), false)}
          onRemovePlan={(planId) => applyResult(removePlannedAction(state, planId), false)}
          onSkipPersonal={() => applyResult(skipEmptyPersonalEventPhase(state), false)}
          onSettle={() => applyResult(settleTurnPhase(state), false)}
          onContinueLearning={() => applyResult(continueAfterLearningPhase(state), false)}
        />
      </main>
      {state.turnPhase === "action" && (
        <ActionDock state={state} onOpen={setModal} onFinish={() => applyResult(finishOrdinaryActionPhase(state), false)} />
      )}

      {(modal === "skills" || modal === "careers" || modal === "assets" || modal === "actions" || modal === "deep") && (
        <CatalogModal
          type={modal}
          state={state}
          onClose={() => setModal(null)}
          onSkill={(id) => applyResult(scheduleSkill(state, id))}
          onCareer={(id) => applyResult(scheduleCareer(state, id))}
          onAsset={(id) => applyResult(scheduleAsset(state, id))}
          onLifeAction={(id) => applyResult(scheduleLifeAction(state, id))}
          onDeepAction={(id) => applyResult(scheduleDeepAction(state, id))}
        />
      )}
      {modal === "opportunity" && (
        <OpportunityModal state={state} onClose={() => setModal(null)} onChoose={(card) => applyResult(scheduleOpportunity(state, card))} />
      )}
      {(modal === "ledger" || modal === "knowledge" || modal === "network" || modal === "family" || modal === "audit" || modal === "help") && (
        <InfoModal
          type={modal}
          state={state}
          onClose={() => setModal(null)}
          onAIInteraction={(playerId, interactionId) => applyResult(scheduleAIInteraction(state, playerId, interactionId))}
          onAssetSale={(assetId, fraction) => applyResult(scheduleAssetSale(state, assetId, fraction))}
          onContractAction={(contractId, action) => applyResult(scheduleContractAction(state, contractId, action))}
        />
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [savedGame, setSavedGame] = useState<GameState | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const [multiplayerOpen, setMultiplayerOpen] = useState(false);
  const screen = state?.phase ?? "setup";

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSavedGame(safeLoadSave());
      const params = new URLSearchParams(window.location.search);
      setMultiplayerOpen(params.get("multi") === "1" || Boolean(params.get("room")));
      setMounted(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!state || !mounted) return;
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({ ...state, savedAt: Date.now() }));
  }, [state, mounted]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [screen]);

  if (!mounted) {
    return (
      <div className="boot-screen" data-theme="emerald">
        <Brand />
        <span>正在展开人生棋盘…</span>
      </div>
    );
  }

  if (multiplayerOpen) {
    return (
      <MultiplayerScreen
        theme={state?.theme ?? "emerald"}
        onExit={() => setMultiplayerOpen(false)}
      />
    );
  }

  if (!state) {
    return (
      <SetupScreen
        savedGame={savedGame}
        onContinue={() => savedGame && setState(savedGame)}
        onMultiplayer={() => setMultiplayerOpen(true)}
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
