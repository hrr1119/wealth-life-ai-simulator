"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  multiplayerApiBase,
  type MultiplayerPlanItem,
  type MultiplayerRoomSnapshot,
  type MultiplayerSession,
} from "@/lib/multiplayer";
import { formatMoney, formatSignedMoney } from "@/lib/engine";
import type { ThemeId } from "@/lib/types";

const SESSION_KEY = "wealth-life-multiplayer-v1";

const ACTION_KIND_LABELS: Record<string, string> = {
  career_work: "主业",
  career: "转型",
  skill: "技能",
  asset_buy: "买入",
  asset_sell: "卖出",
  life: "生活",
  contract: "合同",
  event: "事件",
  settlement: "结算",
};

const FAMILY_STAGE_LABELS: Record<string, string> = {
  independent: "独立生活",
  partnered: "共同生活",
  caregiving: "照护阶段",
  parenting: "育儿阶段",
  multigenerational: "多代家庭",
};

const CONTRACT_STATUS_LABELS: Record<string, string> = {
  active: "履约中",
  completed: "已完成",
  breached: "已违约",
  terminated: "已退出",
};

function apiUrl(): string {
  return `${multiplayerApiBase()}/api/multiplayer`;
}

function loadSession(code?: string): MultiplayerSession | null {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MultiplayerSession;
    return !code || parsed.code === code ? parsed : null;
  } catch {
    return null;
  }
}

async function parseResponse<T>(response: Response): Promise<T> {
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "房间服务暂时不可用。");
  return data;
}

export default function MultiplayerScreen({
  theme,
  onExit,
}: {
  theme: ThemeId;
  onExit: () => void;
}) {
  const inviteCode =
    typeof window === "undefined"
      ? ""
      : new URLSearchParams(window.location.search).get("room")?.toUpperCase() ?? "";
  const [session, setSession] = useState<MultiplayerSession | null>(() =>
    typeof window === "undefined" ? null : loadSession(inviteCode),
  );
  const [room, setRoom] = useState<MultiplayerRoomSnapshot | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState(inviteCode);
  const [mode, setMode] = useState<"quick" | "standard">("quick");
  const [selected, setSelected] = useState<MultiplayerPlanItem[]>([]);
  const [selectedTurn, setSelectedTurn] = useState(0);
  const [eventChoiceId, setEventChoiceId] = useState("");
  const [eventChoiceTurn, setEventChoiceTurn] = useState(0);
  const [actionQuery, setActionQuery] = useState("");
  const [actionCategory, setActionCategory] = useState("推荐");
  const [tradeTarget, setTradeTarget] = useState("");
  const [tradeCash, setTradeCash] = useState("0");
  const [tradeTerms, setTradeTerms] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [connection, setConnection] = useState<"connecting" | "live" | "retrying">(
    session ? "connecting" : "live",
  );

  const request = useCallback(
    async (
      body?: Record<string, unknown>,
      method: "GET" | "POST" = "POST",
      currentSession = session,
    ) => {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (currentSession) {
        headers.Authorization = `Bearer ${currentSession.token}`;
        headers["X-Player-Id"] = currentSession.playerId;
      }
      const response = await fetch(
        method === "GET" && currentSession
          ? `${apiUrl()}?code=${encodeURIComponent(currentSession.code)}`
          : apiUrl(),
        {
          method,
          headers,
          body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
        },
      );
      return parseResponse<MultiplayerRoomSnapshot & { session?: MultiplayerSession }>(response);
    },
    [session],
  );

  const applySnapshot = useCallback((next: MultiplayerRoomSnapshot) => {
    setRoom(next);
    if (next.phase !== "planning") return;
    if (selectedTurn !== next.turn) {
      setSelected([]);
      setSelectedTurn(next.turn);
    }
    if (eventChoiceTurn !== next.turn) {
      setEventChoiceId(next.worldEvent?.choices?.[0]?.id ?? "");
      setEventChoiceTurn(next.turn);
      setActionCategory("推荐");
      setActionQuery("");
    }
  }, [eventChoiceTurn, selectedTurn]);

  const refresh = useCallback(async () => {
    if (!session) return;
    try {
      const next = await request(undefined, "GET", session);
      applySnapshot(next);
      setConnection("live");
      setError("");
    } catch (caught) {
      setConnection("retrying");
      setError(caught instanceof Error ? caught.message : "正在重新连接房间。");
    }
  }, [applySnapshot, request, session]);

  useEffect(() => {
    if (!session) return;
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    const initial = window.setTimeout(() => void refresh(), 0);
    const interval = window.setInterval(() => void refresh(), 3_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [refresh, session]);

  async function createOrJoin(kind: "create" | "join") {
    setBusy(true);
    setError("");
    try {
      const result = await request({
        action: kind,
        name,
        code: code.trim().toUpperCase(),
        mode,
      });
      if (!result.session) throw new Error("房间没有返回有效身份。");
      setSession(result.session);
      window.localStorage.setItem(SESSION_KEY, JSON.stringify(result.session));
      setNotice(kind === "create" ? "房间已创建，把邀请码发给朋友。" : "已经进入房间。");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法进入房间。");
    } finally {
      setBusy(false);
    }
  }

  async function act(action: string, payload: Record<string, unknown> = {}) {
    if (!session) return;
    setBusy(true);
    setError("");
    try {
      const next = await request({ action, code: session.code, ...payload });
      applySnapshot(next);
      setConnection("live");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "操作没有完成。");
    } finally {
      setBusy(false);
    }
  }

  function togglePlan(action: MultiplayerPlanItem) {
    const activePlayer = room?.players.find((player) => player.id === session?.playerId);
    if (
      activePlayer?.submitted ||
      action.locked ||
      action.cashCost > (activePlayer?.cash ?? 0)
    ) return;
    if (selectedTurn !== room?.turn) {
      setSelectedTurn(room?.turn ?? 0);
      setSelected([action]);
      return;
    }
    setSelected((current) => {
      if (current.some((item) => item.id === action.id)) {
        return current.filter((item) => item.id !== action.id);
      }
      if (
        action.kind === "contract" &&
        current.some((item) => item.kind === "contract" && item.targetId === action.targetId)
      ) {
        return current;
      }
      const next = [...current, action];
      const totalTime = next.reduce((sum, item) => sum + item.timeCost, 0);
      const totalCash = next.reduce((sum, item) => sum + item.cashCost, 0);
      const self = room?.players.find((player) => player.id === session?.playerId);
      if (next.length > 3 || totalTime > 8 || totalCash > (self?.cash ?? 0)) return current;
      return next;
    });
  }

  async function shareInvite() {
    if (!session) return;
    const url = new URL(window.location.href);
    url.searchParams.set("room", session.code);
    url.searchParams.set("multi", "1");
    const text = `加入我的《财富人生》房间：${session.code}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "财富人生多人房间", text, url: url.toString() });
      } else {
        await navigator.clipboard.writeText(`${text}\n${url}`);
      }
      setNotice("邀请链接已准备好。");
    } catch {
      setNotice(`邀请码：${session.code}`);
    }
  }

  async function leaveRoom() {
    if (session && room && room.phase !== "complete") {
      try {
        await request({ action: "leave", code: session.code });
      } catch {
        // Leaving locally still succeeds; the server will switch the stale seat to AI.
      }
    }
    window.localStorage.removeItem(SESSION_KEY);
    setSession(null);
    setRoom(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("room");
    url.searchParams.delete("multi");
    window.history.replaceState({}, "", url);
    onExit();
  }

  const self = room?.players.find((player) => player.id === session?.playerId);
  const isHost = Boolean(self?.isHost);
  const activeSelected = selectedTurn === room?.turn ? selected : [];
  const plannedTime = activeSelected.reduce((sum, item) => sum + item.timeCost, 0);
  const plannedCash = activeSelected.reduce((sum, item) => sum + item.cashCost, 0);
  const activeEventChoiceId =
    eventChoiceTurn === room?.turn
      ? eventChoiceId
      : room?.worldEvent?.choices?.[0]?.id ?? "";
  const secondsLeft = room
    ? Math.max(0, Math.ceil((room.phaseDeadline - room.serverNow) / 1_000))
    : 0;
  const targetOptions = room?.players.filter((player) => player.id !== session?.playerId) ?? [];
  const scoreboard = useMemo(
    () => [...(room?.players ?? [])].sort((a, b) => b.netWorth - a.netWorth),
    [room?.players],
  );
  const actionCategories = useMemo(
    () => ["推荐", "全部", ...new Set((room?.availableActions ?? []).map((action) => action.category))],
    [room?.availableActions],
  );
  const visibleActions = useMemo(() => {
    const query = actionQuery.trim().toLocaleLowerCase("zh-CN");
    return (room?.availableActions ?? []).filter((action) => {
      const categoryMatch = actionCategory === "推荐"
        ? action.recommended
        : actionCategory === "全部" || action.category === actionCategory;
      const queryMatch = !query || [action.label, action.description, ...action.tags]
        .join(" ")
        .toLocaleLowerCase("zh-CN")
        .includes(query);
      return categoryMatch && queryMatch;
    });
  }, [actionCategory, actionQuery, room?.availableActions]);

  if (!session) {
    return (
      <div className="multiplayer-page" data-theme={theme}>
        <header className="multiplayer-topbar">
          <button onClick={onExit} className="multi-back">← 单人人生</button>
          <span>2–4 人 · 七阶段共同行动 · 真实网络房间</span>
        </header>
        <main className="multi-entry">
          <section className="multi-entry__story">
            <span className="micro-label">财富人生 · 多人实验室</span>
            <h1>不再轮流等，<br /><strong>一起做决定。</strong></h1>
            <p>
              每个人先秘密完成普通行动，再进入借款、合作和交易窗口；互动结束后才会统一翻开宏观影响、
              个人结果和学习反馈。断线席位会由 AI 接管，原玩家回来后可继续控制。
            </p>
            <div>
              <span><b>01</b>世界观察</span>
              <span><b>02</b>普通行动</span>
              <span><b>03</b>玩家互动</span>
              <span><b>04</b>揭晓与学习</span>
            </div>
          </section>
          <section className="multi-entry__card">
            <span className="micro-label">创建或加入房间</span>
            <h2>先告诉同桌怎么称呼你</h2>
            <label>
              <span>玩家名</span>
              <input value={name} onChange={(event) => setName(event.target.value)} maxLength={18} placeholder="2–18 个字符" />
            </label>
            <div className="multi-mode">
              {(["quick", "standard"] as const).map((item) => (
                <button
                  key={item}
                  className={mode === item ? "is-selected" : ""}
                  onClick={() => setMode(item)}
                >
                  <b>{item === "quick" ? "12 回合" : "24 回合"}</b>
                  <small>{item === "quick" ? "好友快速局" : "完整策略局"}</small>
                </button>
              ))}
            </div>
            <button
              className="multi-primary"
              disabled={busy || name.trim().length < 2}
              onClick={() => void createOrJoin("create")}
            >
              创建新房间 <span>→</span>
            </button>
            <div className="multi-divider"><span>或用邀请码加入</span></div>
            <label>
              <span>6 位邀请码</span>
              <input
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                maxLength={6}
                placeholder="例如 K7M2QX"
              />
            </label>
            <button
              className="multi-secondary"
              disabled={busy || name.trim().length < 2 || code.trim().length !== 6}
              onClick={() => void createOrJoin("join")}
            >
              加入朋友房间
            </button>
            {error && <p className="multi-error">{error}</p>}
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="multiplayer-page multiplayer-room" data-theme={theme}>
      <header className="multiplayer-topbar">
        <button onClick={() => void leaveRoom()} className="multi-back">← 离开房间</button>
        <div className="multi-room-code">
          <small>房间</small>
          <b>{session.code}</b>
          <button onClick={() => void shareInvite()}>邀请</button>
        </div>
        <span className={`multi-connection is-${connection}`}>
          <i />{connection === "live" ? "实时同步" : connection === "connecting" ? "正在连接" : "正在重连"}
        </span>
      </header>

      <main className="multi-board">
        <section className="multi-room-head">
          <div>
            <span className="micro-label">
              {room ? `第 ${room.turn}/${room.maxTurns} 回合` : "正在读取房间"}
            </span>
            <h1>
              {room?.phase === "lobby"
                ? "等待同桌入席"
                : room?.phase === "planning"
                  ? "普通行动 · 隐藏提交"
                  : room?.phase === "negotiation"
                    ? "玩家互动 · 合同窗口"
                    : room?.phase === "learning"
                      ? "共同揭晓 · 学习反馈"
                    : room?.phase === "complete"
                      ? "这局共同人生已经结束"
                      : "正在统一结算"}
            </h1>
          </div>
          {room && room.phase !== "lobby" && room.phase !== "complete" && (
            <div className="multi-timer">
              <span>{room.phase === "planning" ? "行动剩余" : room.phase === "learning" ? "反馈剩余" : "互动窗口"}</span>
              <b>{Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}</b>
            </div>
          )}
        </section>

        {room && room.phase !== "lobby" && room.phase !== "complete" && (
          <section className="multi-life-shell" aria-label="多人共同人生棋盘">
            <div className="multi-life-board">
              <header>
                <div><span className="micro-label">共同人生路线棋盘</span><h2>同一座城，各自承担选择的代价</h2></div>
                <span className="multi-world-chip">{room.worldEvent.title}</span>
              </header>
              <div className="multi-route-lanes">
                {room.players.map((player) => (
                  <article key={player.id} className={player.id === session.playerId ? "is-self" : ""}>
                    <div className="multi-route-person"><i>{player.name.slice(0, 1)}</i><span><b>{player.name}</b><small>{player.domain.roleName} · {player.domain.careerName} · {player.control === "ai" ? "AI 延续" : player.online ? "真人在线" : "等待重连"}</small></span></div>
                    <div className="multi-route-track">
                      {Array.from({ length: 4 }, (_, index) => {
                        const milestone = Math.min(3, Math.floor(((room.turn - 1) / Math.max(1, room.maxTurns - 1)) * 4));
                        return <i className={index <= milestone ? "is-reached" : ""} key={index}>{index === milestone ? "你" : ""}</i>;
                      })}
                    </div>
                    <dl><span><small>现金</small>{formatMoney(player.cash)}</span><span><small>月收入</small>{formatMoney(player.monthlyIncome)}</span><span><small>技能</small>{player.domain.skills.length} 项</span><span><small>信任</small>{Math.round(player.trust)}</span></dl>
                  </article>
                ))}
              </div>
            </div>
            <aside className="multi-cash-console">
              <span className="micro-label">我的现金流控制台</span>
              <h2>{self?.name ?? "当前席位"}</h2>
              <dl>
                <div><dt>可用现金</dt><dd>{formatMoney(self?.cash ?? 0)}</dd></div>
                <div><dt>净资产</dt><dd>{formatMoney(self?.netWorth ?? 0)}</dd></div>
                <div><dt>月主动收入</dt><dd>{formatMoney(self?.monthlyIncome ?? 0)}</dd></div>
                <div><dt>月固定支出</dt><dd>{formatMoney(self?.monthlyExpense ?? 0)}</dd></div>
                <div><dt>月被动收入</dt><dd>{formatMoney(self?.domain.passiveIncome ?? 0)}</dd></div>
                <div><dt>负债余额</dt><dd>{formatMoney(self?.domain.debt ?? 0)}</dd></div>
              </dl>
              <div><span>共同信任</span><b>{Math.round(self?.trust ?? 0)} / 100</b><i><em style={{ width: `${self?.trust ?? 0}%` }} /></i></div>
              <p>{room.worldEvent.description}</p>
            </aside>
          </section>
        )}

        <section className="multi-seats" aria-label="房间玩家">
          {room?.players.map((player) => (
            <article
              key={player.id}
              className={`${player.id === session.playerId ? "is-self" : ""} ${player.submitted ? "is-ready" : ""}`}
            >
              <span className="multi-avatar">{player.name.slice(0, 1)}</span>
              <div>
                <b>{player.name}{player.isHost ? " · 房主" : ""}</b>
                <small>
                  {player.domain.roleName} · {player.domain.careerName}<br />
                  {player.control === "ai"
                    ? "AI 接管中"
                    : player.online
                      ? player.submitted
                        ? "行动已锁定"
                        : "在线思考"
                      : "等待重连"}
                </small>
              </div>
              <dl>
                <span>{formatMoney(player.cash)}</span>
                <span>技能 {player.domain.skills.length}</span>
                <span>资产 {player.domain.assets.length}</span>
                <span>信任 {Math.round(player.trust)}</span>
              </dl>
            </article>
          ))}
          {Array.from({ length: Math.max(0, 4 - (room?.players.length ?? 0)) }, (_, index) => (
            <article className="is-empty" key={`empty-${index}`}>
              <span className="multi-avatar">+</span>
              <div><b>等待玩家</b><small>分享房间码即可加入</small></div>
            </article>
          ))}
        </section>

        {room && self && room.phase !== "lobby" && (
          <section className="multi-domain-profile" aria-label="我的联机人生领域档案">
            <header>
              <div>
                <span className="micro-label">我的领域档案 · 服务端持续保存</span>
                <h2>{self.domain.roleName} · {self.domain.careerName}</h2>
              </div>
              <div className="multi-domain-vitals">
                <span>健康 <b>{Math.round(self.domain.health)}</b></span>
                <span>精力 <b>{Math.round(self.domain.energy)}</b></span>
                <span>压力 <b>{Math.round(self.domain.stress)}</b></span>
                <span>信用 <b>{Math.round(self.domain.credit)}</b></span>
              </div>
            </header>
            <div className="multi-domain-grid">
              <article>
                <header><b>能力组合</b><span>{self.domain.skills.length} 项已掌握</span></header>
                <div className="multi-skill-list">
                  {self.domain.skills.length ? self.domain.skills.slice(0, 8).map((skill) => (
                    <span key={skill.id}>{skill.name}<b>Lv.{skill.level.toFixed(1)}</b></span>
                  )) : <small>尚未形成可迁移技能证据。</small>}
                </div>
                {self.domain.activeSkillCombinations.length > 0 && (
                  <p>已激活：{self.domain.activeSkillCombinations.join("、")}</p>
                )}
              </article>
              <article>
                <header><b>资产组合</b><span>{self.domain.assets.length} 项持仓</span></header>
                <div className="multi-holding-list">
                  {self.domain.assets.length ? self.domain.assets.map((asset) => (
                    <span key={asset.assetId}><i>{asset.category}</i><b>{asset.name}</b><em>{formatMoney(asset.value)}</em></span>
                  )) : <small>当前没有持仓；买入与卖出都必须进入行动计划。</small>}
                </div>
                <p>被动收入 {formatMoney(self.domain.passiveIncome)} / 月 · 负债 {formatMoney(self.domain.debt)}</p>
              </article>
              <article>
                <header><b>家庭责任</b><span>{FAMILY_STAGE_LABELS[self.domain.familyLedger.stage]}</span></header>
                <div className="multi-responsibility-list">
                  {self.domain.familyLedger.responsibilities.filter((item) => item.status === "active").length
                    ? self.domain.familyLedger.responsibilities.filter((item) => item.status === "active").map((item) => (
                      <span key={item.id}><b>{item.title}</b><em>{formatMoney(item.cashPerPeriod)} / 期 · {item.timePerPeriod} 点</em></span>
                    ))
                    : <small>暂无持续责任；家庭行动会生成可结算的长期账目。</small>}
                </div>
                <p>家庭共同现金 {formatMoney(self.domain.familyLedger.sharedCash)} · 信任 {Math.round(self.domain.familyLedger.trust)}</p>
              </article>
              <article>
                <header><b>事件记忆</b><span>{self.domain.eventHistory.length} 条记录</span></header>
                <div className="multi-memory-list">
                  {self.domain.eventHistory.length ? [...self.domain.eventHistory].reverse().slice(0, 4).map((event) => (
                    <span key={`${event.turn}-${event.eventId}`}><i>第 {event.turn} 回合</i><b>{event.title}</b><em>{event.choiceLabel} · {event.success ? "达成" : "偏离"}</em></span>
                  )) : <small>事件回应将在统一结算后写入长期记忆。</small>}
                </div>
              </article>
            </div>
          </section>
        )}

        {room?.phase === "lobby" && (
          <section className="multi-lobby-card">
            <div>
              <span className="micro-label">房间已持久保存</span>
              <h2>{room.players.length}/4 位玩家已入席</h2>
              <p>至少两人即可开始；开始后不再加入新席位，掉线玩家将由 AI 继续规划。</p>
            </div>
            <button onClick={() => void shareInvite()} className="multi-secondary">复制邀请</button>
            {isHost ? (
              <button
                className="multi-primary"
                disabled={busy || room.players.length < 2}
                onClick={() => void act("start")}
              >
                开始共同人生 <span>→</span>
              </button>
            ) : <strong>等待房主开始…</strong>}
          </section>
        )}

        {room?.phase === "planning" && (
          <>
            <section className="multi-world-event">
              <span>01 · 共同事件 · 每个人必须独立回应</span>
              <h2>{room.worldEvent.title}</h2>
              <p>{room.worldEvent.description}</p>
              <div className="multi-event-tags">
                {room.worldEvent.tags.map((tag) => <span key={tag}>{tag}</span>)}
              </div>
              <div className="multi-event-choices" role="radiogroup" aria-label="共同事件回应">
                {room.worldEvent.choices.map((choice) => {
                  const active = activeEventChoiceId === choice.id;
                  return (
                    <button
                      key={choice.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      className={active ? "is-selected" : ""}
                      disabled={Boolean(self?.submitted)}
                      onClick={() => {
                        setEventChoiceId(choice.id);
                        setEventChoiceTurn(room.turn);
                      }}
                    >
                      <span>{choice.risk}风险 · {choice.timeCost} 点{choice.cost ? ` · ${formatMoney(choice.cost)}` : ""}</span>
                      <b>{choice.label}</b>
                      <small>{choice.description}</small>
                    </button>
                  );
                })}
              </div>
            </section>
            <section className="multi-planning">
              <header>
                <div>
                  <span className="micro-label">02 · 普通行动</span>
                  <h2>选择 1–3 项行动，提交前对手不可见</h2>
                </div>
                <strong>{plannedTime}/8 点 · {formatMoney(plannedCash)}</strong>
              </header>
              <div className="multi-action-toolbar">
                <label>
                  <span>搜索行动</span>
                  <input
                    value={actionQuery}
                    onChange={(event) => setActionQuery(event.target.value)}
                    placeholder="职业、技能、资产、家庭或合同"
                  />
                </label>
                <div>
                  {actionCategories.map((category) => (
                    <button
                      type="button"
                      key={category}
                      className={actionCategory === category ? "is-selected" : ""}
                      onClick={() => setActionCategory(category)}
                    >
                      {category}
                    </button>
                  ))}
                </div>
              </div>
              <div className="multi-action-grid">
                {visibleActions.map((action) => {
                  const active = activeSelected.some((item) => item.id === action.id);
                  return (
                    <button
                      key={action.id}
                      className={`${active ? "is-selected" : ""} ${action.recommended ? "is-recommended" : ""} ${action.locked ? "is-locked" : ""}`}
                      disabled={Boolean(self?.submitted) || action.locked}
                      onClick={() => togglePlan(action)}
                    >
                      <span>{action.category} · {ACTION_KIND_LABELS[action.kind]}</span>
                      <b>{action.label}</b>
                      <small>{action.description}</small>
                      <em>{action.timeCost} 点 · {action.cashCost ? formatMoney(action.cashCost) : "无支出"}</em>
                      {action.lockReason && <i>{action.lockReason}</i>}
                    </button>
                  );
                })}
                {!visibleActions.length && (
                  <p className="multi-empty">当前筛选没有行动。切换分类或清空搜索即可查看完整目录。</p>
                )}
              </div>
              <button
                className="multi-primary multi-submit"
                disabled={busy || Boolean(self?.submitted) || activeSelected.length < 1 || !activeEventChoiceId}
                onClick={() => void act("submit_plan", {
                  plan: activeSelected.map((item) => ({ id: item.id })),
                  eventChoiceId: activeEventChoiceId,
                })}
              >
                {self?.submitted ? "行动与事件回应已锁定" : "提交行动与事件回应"} <span>→</span>
              </button>
            </section>
          </>
        )}

        {room?.phase === "negotiation" && (
          <>
            <section className="multi-negotiation">
              <div className="multi-trade-form">
                <span className="micro-label">03 · 玩家互动</span>
                <h2>结果揭晓前，先把合作边界写清楚</h2>
                <label>
                  <span>交易对象</span>
                  <select value={tradeTarget} onChange={(event) => setTradeTarget(event.target.value)}>
                    <option value="">选择玩家</option>
                    {targetOptions.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}
                  </select>
                </label>
                <label>
                  <span>转出现金</span>
                  <input type="number" min="0" max={self?.cash ?? 0} value={tradeCash} onChange={(event) => setTradeCash(event.target.value)} />
                </label>
                <label>
                  <span>交换条件</span>
                  <textarea value={tradeTerms} onChange={(event) => setTradeTerms(event.target.value)} maxLength={120} placeholder="例如：下回合共同做副业，利润五五分；若失败不追加借款。" />
                </label>
                <button
                  className="multi-secondary"
                  disabled={busy || !tradeTarget || tradeTerms.trim().length < 4}
                  onClick={() => {
                    void act("propose_trade", {
                      toPlayerId: tradeTarget,
                      cash: Number(tradeCash),
                      terms: tradeTerms,
                    });
                    setTradeTerms("");
                  }}
                >
                  提出交易
                </button>
              </div>
              <div className="multi-trade-list">
                <span className="micro-label">房间交易记录</span>
                {room.trades.length ? room.trades.map((trade) => {
                  const from = room.players.find((player) => player.id === trade.fromPlayerId);
                  const to = room.players.find((player) => player.id === trade.toPlayerId);
                  const needsResponse = trade.toPlayerId === session.playerId && trade.status === "open";
                  return (
                    <article key={trade.id}>
                      <header>
                        <b>{from?.name} → {to?.name}</b>
                        <span>{formatMoney(trade.cash)}</span>
                      </header>
                      <p>{trade.terms}</p>
                      <footer>
                        <span className={`trade-status is-${trade.status}`}>
                          {trade.status === "open" ? "等待回应" : trade.status === "accepted" ? "已接受" : "已拒绝"}
                        </span>
                        {needsResponse && (
                          <div>
                            <button onClick={() => void act("respond_trade", { tradeId: trade.id, decision: "reject" })}>拒绝</button>
                            <button onClick={() => void act("respond_trade", { tradeId: trade.id, decision: "accept" })}>接受</button>
                          </div>
                        )}
                      </footer>
                    </article>
                  );
                }) : <p className="multi-empty">还没有交易。你也可以保留边界，直接进入结算。</p>}
              </div>
            </section>
            <section className="multi-contract-book" aria-label="房间合同簿">
              <header>
                <div><span className="micro-label">可执行合同簿</span><h2>接受合作后，双方都要在到期回合安排履约或退出</h2></div>
                <strong>{room.contracts.filter((contract) => contract.status === "active").length} 份履约中</strong>
              </header>
              <div>
                {room.contracts.length ? room.contracts.map((contract) => (
                  <article key={contract.id} className={`is-${contract.status}`}>
                    <header><b>{contract.title}</b><span>{CONTRACT_STATUS_LABELS[contract.status]}</span></header>
                    <p>{contract.terms}</p>
                    <dl>
                      <span>双方投入 <b>{formatMoney(contract.contribution)}</b></span>
                      <span>完成回收 <b>{formatMoney(contract.payout)}</b></span>
                      <span>到期 <b>第 {contract.nextDueTurn} 回合</b></span>
                      <span>里程碑 <b>{contract.milestone}/3</b></span>
                    </dl>
                    <small>{contract.records.at(-1)?.detail ?? "等待第一条履约记录。"}</small>
                  </article>
                )) : <p className="multi-empty">当前没有合同。被接受的交易会建立正式合同，并从下一回合进入履约。</p>}
              </div>
            </section>
            {isHost ? (
              <button className="multi-primary multi-next" disabled={busy} onClick={() => void act("advance")}>
                结束互动 · 翻开事件与结果 <span>→</span>
              </button>
            ) : <p className="multi-waiting">等待房主结束谈判窗口…</p>}
          </>
        )}

        {room?.phase === "settlement" && (
          <section className="multi-loading">
            <i />
            <h2>正在统一结算所有人的现金流</h2>
            <p>行动结果、交易和三个月收支只会结算一次。</p>
          </section>
        )}

        {room?.phase === "learning" && (
          <>
            <section className="multi-world-event multi-world-event--revealed">
              <span>04 · 宏观影响</span>
              <h2>{room.worldEvent.title}</h2>
              <p>{room.worldEvent.description}</p>
            </section>
            <section className="multi-reveals">
              <header>
                <span className="micro-label">05–07 · 个人结果、统一结算与学习反馈</span>
                <h2>同一个世界，不同的准备与结果</h2>
              </header>
              <div>
                {room.reveals.map((reveal) => (
                  <article key={reveal.playerId}>
                    <header>
                      <b>{reveal.playerName}</b>
                      <strong className={reveal.totalCashDelta >= 0 ? "is-positive" : "is-negative"}>
                        {formatSignedMoney(reveal.totalCashDelta)}
                      </strong>
                    </header>
                    <dl className="multi-reveal-ledger">
                      <span>经营现金流 <b>{formatSignedMoney(reveal.settlementCashflow)}</b></span>
                      <span>家庭责任 <b>{formatMoney(reveal.familyCost)}</b></span>
                      <span>资产变动 <b>{formatSignedMoney(reveal.assetChange)}</b></span>
                      <span>负债利息 <b>{formatMoney(reveal.debtInterest)}</b></span>
                    </dl>
                    {reveal.outcomes.map((outcome) => (
                      <div key={outcome.actionId}>
                        <span className={outcome.success ? "is-success" : "is-failure"}>{ACTION_KIND_LABELS[outcome.kind] ?? "结果"}</span>
                        <p>
                          <b>{outcome.label}</b>
                          <small>{outcome.narrative}</small>
                          <i>{outcome.evidence.slice(0, 3).join(" · ")}</i>
                        </p>
                        <em>
                          {outcome.cashDelta ? formatSignedMoney(outcome.cashDelta) : `${Math.round(outcome.probability * 100)}%`}
                        </em>
                      </div>
                    ))}
                  </article>
                ))}
              </div>
            </section>
            {isHost ? (
              <button className="multi-primary multi-next" disabled={busy} onClick={() => void act("advance")}>
                完成本回合 · 返回世界观察 <span>→</span>
              </button>
            ) : <p className="multi-waiting">等待房主开始下一回合…</p>}
          </>
        )}

        {room?.phase === "complete" && (
          <section className="multi-final">
            <span className="micro-label">共同人生 · 局末</span>
            <h2>财富不是唯一排名，但账本会诚实记录</h2>
            <ol>
              {scoreboard.map((player, index) => (
                <li key={player.id}>
                  <span>{index + 1}</span>
                  <div><b>{player.name}</b><small>{player.domain.roleName} · {player.domain.careerName} · {player.control === "ai" ? "AI 代管完成" : "玩家完成"}</small></div>
                  <strong>{formatMoney(player.netWorth)}</strong>
                </li>
              ))}
            </ol>
            <button className="multi-primary" onClick={() => void leaveRoom()}>返回开局 <span>→</span></button>
          </section>
        )}

        {(error || notice) && (
          <div className={error ? "multi-toast is-error" : "multi-toast"}>
            {error || notice}
          </div>
        )}
      </main>
    </div>
  );
}
