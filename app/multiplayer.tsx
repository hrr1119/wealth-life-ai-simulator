"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  MULTIPLAYER_ACTIONS,
  multiplayerApiBase,
  type MultiplayerPlanItem,
  type MultiplayerRoomSnapshot,
  type MultiplayerSession,
} from "@/lib/multiplayer";
import { formatMoney, formatSignedMoney } from "@/lib/engine";
import type { ThemeId } from "@/lib/types";

const SESSION_KEY = "wealth-life-multiplayer-v1";

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

  const refresh = useCallback(async () => {
    if (!session) return;
    try {
      const next = await request(undefined, "GET", session);
      setRoom(next);
      setConnection("live");
      setError("");
    } catch (caught) {
      setConnection("retrying");
      setError(caught instanceof Error ? caught.message : "正在重新连接房间。");
    }
  }, [request, session]);

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
      setRoom(next);
      setConnection("live");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "操作没有完成。");
    } finally {
      setBusy(false);
    }
  }

  function togglePlan(action: MultiplayerPlanItem) {
    const activePlayer = room?.players.find((player) => player.id === session?.playerId);
    if (activePlayer?.submitted || action.cashCost > (activePlayer?.cash ?? 0)) return;
    if (selectedTurn !== room?.turn) {
      setSelectedTurn(room?.turn ?? 0);
      setSelected([action]);
      return;
    }
    setSelected((current) => {
      if (current.some((item) => item.id === action.id)) {
        return current.filter((item) => item.id !== action.id);
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
  const secondsLeft = room
    ? Math.max(0, Math.ceil((room.phaseDeadline - room.serverNow) / 1_000))
    : 0;
  const targetOptions = room?.players.filter((player) => player.id !== session?.playerId) ?? [];
  const scoreboard = useMemo(
    () => [...(room?.players ?? [])].sort((a, b) => b.netWorth - a.netWorth),
    [room?.players],
  );

  if (!session) {
    return (
      <div className="multiplayer-page" data-theme={theme}>
        <header className="multiplayer-topbar">
          <button onClick={onExit} className="multi-back">← 单人人生</button>
          <span>2–4 人 · 同时规划 · 真实网络房间</span>
        </header>
        <main className="multi-entry">
          <section className="multi-entry__story">
            <span className="micro-label">财富人生 · 多人实验室</span>
            <h1>不再轮流等，<br /><strong>一起做决定。</strong></h1>
            <p>
              每个人同时安排本回合行动，一起揭晓宏观事件，再进入借款、合作和交易窗口。
              断线席位会由 AI 接管，原玩家回来后可继续控制。
            </p>
            <div>
              <span><b>01</b>同时规划</span>
              <span><b>02</b>共同揭晓</span>
              <span><b>03</b>谈判交易</span>
              <span><b>04</b>统一结算</span>
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
                    <div className="multi-route-person"><i>{player.name.slice(0, 1)}</i><span><b>{player.name}</b><small>{player.control === "ai" ? "AI 延续人生" : player.online ? "真人在线" : "等待重连"}</small></span></div>
                    <div className="multi-route-track">
                      {Array.from({ length: 4 }, (_, index) => {
                        const milestone = Math.min(3, Math.floor(((room.turn - 1) / Math.max(1, room.maxTurns - 1)) * 4));
                        return <i className={index <= milestone ? "is-reached" : ""} key={index}>{index === milestone ? "你" : ""}</i>;
                      })}
                    </div>
                    <dl><span><small>现金</small>{formatMoney(player.cash)}</span><span><small>月收入</small>{formatMoney(player.monthlyIncome)}</span><span><small>信任</small>{Math.round(player.trust)}</span></dl>
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
              <span>01 · 已知世界状态</span>
              <h2>{room.worldEvent.title}</h2>
              <p>{room.worldEvent.description}</p>
            </section>
            <section className="multi-planning">
              <header>
                <div>
                  <span className="micro-label">02 · 普通行动</span>
                  <h2>选择 1–3 项行动，提交前对手不可见</h2>
                </div>
                <strong>{plannedTime}/8 点 · {formatMoney(plannedCash)}</strong>
              </header>
              <div className="multi-action-grid">
                {MULTIPLAYER_ACTIONS.map((action) => {
                  const active = activeSelected.some((item) => item.id === action.id);
                  return (
                    <button
                      key={action.id}
                      className={active ? "is-selected" : ""}
                      disabled={Boolean(self?.submitted)}
                      onClick={() => togglePlan(action)}
                    >
                      <span>{action.category}</span>
                      <b>{action.label}</b>
                      <small>{action.timeCost} 点 · {action.cashCost ? formatMoney(action.cashCost) : "无支出"}</small>
                    </button>
                  );
                })}
              </div>
              <button
                className="multi-primary multi-submit"
                disabled={busy || Boolean(self?.submitted) || activeSelected.length < 1}
                onClick={() => void act("submit_plan", { plan: activeSelected.map((item) => ({ id: item.id })) })}
              >
                {self?.submitted ? "行动已锁定，等待同桌" : "完成普通行动"} <span>→</span>
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
                    {reveal.outcomes.map((outcome) => (
                      <div key={outcome.actionId}>
                        <span className={outcome.success ? "is-success" : "is-failure"}>{outcome.success ? "成" : "变"}</span>
                        <p><b>{outcome.label}</b><small>{outcome.narrative}</small></p>
                        <em>{Math.round(outcome.probability * 100)}%</em>
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
                  <div><b>{player.name}</b><small>{player.control === "ai" ? "结局由 AI 代管完成" : "玩家完成"}</small></div>
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
