import assert from "node:assert/strict";
import test from "node:test";

import { ASSETS, CAREERS, EVENTS, SKILLS } from "../lib/content.ts";
import {
  advanceTurn,
  beginYearPlanning,
  buyAsset,
  commitYearPlan,
  continueAfterChapter,
  createGame,
  getNetWorth,
  learnSkill,
  revealNextResult,
  resolvePendingEvent,
  scheduleAIInteraction,
  scheduleDeepAction,
  scheduleLifeAction,
  scheduleSkill,
  seededRandom,
  skipYearReveals,
} from "../lib/engine.ts";
import { generateOpportunityCards } from "../lib/opportunity.ts";
import { generateOpportunityCardsWithAI } from "../lib/ai.ts";
import {
  MULTIPLAYER_ACTIONS,
  MULTIPLAYER_WORLD_EVENTS,
  validateMultiplayerPlanSelection,
} from "../lib/multiplayer.ts";

test("content library keeps the MVP breadth", () => {
  assert.ok(CAREERS.length >= 24, "at least 24 careers");
  assert.ok(SKILLS.length >= 40, "at least 40 skills");
  assert.ok(ASSETS.length >= 20, "at least 20 assets");
  assert.ok(EVENTS.length >= 30, "at least 30 event templates");
});

test("the seeded random stream is deterministic and bounded", () => {
  const first = Array.from({ length: 20 }, (_, index) => seededRandom(20260728, index));
  const second = Array.from({ length: 20 }, (_, index) => seededRandom(20260728, index));
  assert.deepEqual(first, second);
  assert.ok(first.every((value) => value >= 0 && value < 1));
});

test("multiplayer plans enforce simultaneous room boundaries", () => {
  assert.ok(MULTIPLAYER_ACTIONS.length >= 8);
  assert.ok(MULTIPLAYER_WORLD_EVENTS.length >= 5);
  assert.equal(new Set(MULTIPLAYER_ACTIONS.map((action) => action.id)).size, MULTIPLAYER_ACTIONS.length);
  const valid = validateMultiplayerPlanSelection(
    [{ id: "career_sprint" }, { id: "build_network" }],
    60_000,
  );
  assert.deepEqual(valid?.map((item) => item.id), ["career_sprint", "build_network"]);
  assert.equal(
    validateMultiplayerPlanSelection(
      [
        { id: "side_business" },
        { id: "career_sprint" },
        { id: "family_commitment" },
        { id: "build_reserve" },
      ],
      60_000,
    ),
    null,
    "more than three simultaneous actions is rejected",
  );
  assert.equal(
    validateMultiplayerPlanSelection([{ id: "market_invest" }], 2_000),
    null,
    "a plan cannot reserve more cash than the player owns",
  );
  assert.equal(
    validateMultiplayerPlanSelection([{ id: "build_reserve" }, { id: "build_reserve" }], 60_000),
    null,
    "duplicate actions are rejected",
  );
});

test("a new game reproduces its world from the same seed", () => {
  const a = createGame({ mode: "quick", theme: "emerald", roleId: "steady", seed: 884211 });
  const b = createGame({ mode: "quick", theme: "paper", roleId: "steady", seed: 884211 });
  assert.deepEqual(a.world, b.world);
  assert.deepEqual(a.talents, b.talents);
  assert.equal(a.maxTurns, 12);
  assert.equal(a.opportunityTokens, 1);
});

test("AI opportunity parsing generates choices but never direct effects", () => {
  const result = generateOpportunityCards(
    "我不辞职，晚上学习俄语，半年内采访本地外国人做视频。",
  );
  assert.equal(result.cards.length, 3);
  assert.ok(result.ruleMapping.some((item) => item.includes("规则引擎")));
  assert.ok(result.cards.every((card) => card.cashCost >= 0));
  assert.ok(result.cards.every((card) => card.baseProbability > 0 && card.baseProbability < 1));
  assert.ok(result.cards.every((card) => !("effects" in card)));
  assert.equal(result.source, "local");
});

test("real AI output is schema-bound and numeric rules stay server-side", async () => {
  let requestBody;
  const payload = {
    normalizedGoal: "保留主业，用真实用户反馈验证财商学习工具",
    cards: [
      {
        strategy: "pilot",
        title: "访谈十位真实用户",
        approach: "低成本访谈",
        category: "income",
        description: "保留主业，在四周内完成十次访谈和一个可点击原型，只验证最痛的问题。",
        duration: "4–8 周",
        costBand: "low",
        timeBand: "light",
        risk: "低",
        skillTags: ["research", "product"],
        environmentTags: ["互联网"],
        upside: "获得可复用的问题证据和第一批愿意继续测试的用户。",
        downside: "需求不成立，但只损失少量现金和时间。",
      },
      {
        strategy: "build",
        title: "完成三个月产品试验",
        approach: "系统化建设",
        category: "income",
        description: "围绕已验证问题开发最小产品，设置留存、付费意向和交付成本三个复盘点。",
        duration: "3–6 个月",
        costBand: "medium",
        timeBand: "focused",
        risk: "中",
        skillTags: ["product", "delivery"],
        environmentTags: ["互联网", "教育"],
        upside: "形成产品、交付和收入结构的组合证据。",
        downside: "投入没有形成留存，需要停止或缩小范围。",
      },
      {
        strategy: "partner",
        title: "与教师共同验证课程",
        approach: "寻找合作伙伴",
        category: "relationship",
        description: "寻找有真实教学场景的伙伴，先约定用户、内容、知识产权、分工和退出条件。",
        duration: "3–6 个月",
        costBand: "medium",
        timeBand: "focused",
        risk: "高",
        skillTags: ["negotiation", "teaching"],
        environmentTags: ["教育"],
        upside: "互补资源缩短验证周期并打开真实课堂入口。",
        downside: "合作边界不清会同时损害项目与关系。",
      },
    ],
  };
  const result = await generateOpportunityCardsWithAI(
    "保留主业，开发一个财商学习工具。",
    {
      turn: 2,
      maxTurns: 12,
      city: "星澜市",
      cycle: "平稳",
      roleName: "产品经理",
      cash: 80_000,
      monthlyIncome: 16_000,
      fixedExpense: 9_000,
      energy: 72,
      relationship: 61,
      skills: ["product", "research"],
      memories: ["持续学习"],
    },
    {
      apiKey: "test-key",
      model: "test-model",
      fetcher: async (_url, init) => {
        requestBody = JSON.parse(init.body);
        return new Response(JSON.stringify({ output_text: JSON.stringify(payload) }));
      },
    },
  );
  assert.equal(result.source, "openai");
  assert.equal(result.model, "test-model");
  assert.equal(result.cards.length, 3);
  assert.deepEqual(result.cards.map((card) => card.timeCost), [1, 3, 3]);
  assert.ok(result.cards.every((card) => card.cashCost <= 28_000));
  assert.ok(result.cards.every((card) => card.baseProbability > 0 && card.baseProbability < 1));
  assert.equal(requestBody.text.format.type, "json_schema");
  assert.ok(!JSON.stringify(payload).includes("baseProbability"));
});

test("actions consume real resources and add auditable history", () => {
  const initial = createGame({ mode: "quick", theme: "emerald", roleId: "steady", seed: 424242 });
  const skillResult = learnSkill(initial, "writing");
  assert.equal(skillResult.success, true);
  assert.ok(skillResult.state.cash < initial.cash);
  assert.ok(skillResult.state.actionPoints < initial.actionPoints);
  assert.equal(skillResult.state.audits.length, 1);
  assert.ok(skillResult.state.history.some((entry) => entry.title.includes("写作")));

  const assetResult = buyAsset(skillResult.state, "broad_index");
  assert.equal(assetResult.success, true);
  assert.equal(assetResult.state.assets.length, 1);
  assert.ok(getNetWorth(assetResult.state) <= getNetWorth(skillResult.state) + 1);
});

test("annual planning defers action effects until the plan is locked", () => {
  const initial = createGame({ mode: "quick", theme: "emerald", roleId: "steady", seed: 313131 });
  const planning = beginYearPlanning(initial);
  assert.equal(planning.success, true);
  assert.equal(planning.state.yearPhase, "planning");
  assert.equal(planning.state.plan[0].kind, "core");

  const scheduled = scheduleSkill(planning.state, "writing");
  assert.equal(scheduled.success, true);
  assert.equal(scheduled.state.cash, initial.cash, "scheduling must not spend cash");
  assert.equal(scheduled.state.skills.writing, initial.skills.writing);

  const committed = commitYearPlan(scheduled.state);
  assert.equal(committed.success, true);
  assert.equal(committed.state.yearPhase, "reveal");
  assert.ok(committed.state.cash < initial.cash);
  assert.equal(committed.state.reveals.length, 2);
  assert.equal(committed.state.reveals[0].title, "先守住正在承担的责任");
});

test("deep life unlocks a real 240-quarter model with long-term systems", () => {
  const initial = createGame({ mode: "deep", theme: "midnight", roleId: "steady", seed: 909090 });
  assert.equal(initial.maxTurns, 240);
  assert.equal(initial.timeScale, "quarter");
  assert.equal(initial.actionBudget, 12);
  assert.equal(initial.age, 22);
  assert.ok(initial.deep);

  initial.cash = 500_000;
  let state = beginYearPlanning(initial).state;
  state = scheduleDeepAction(state, "tax_review").state;
  state = scheduleDeepAction(state, "protect_family").state;
  state = scheduleDeepAction(state, "start_business").state;
  const committed = commitYearPlan(state);
  assert.equal(committed.success, true);
  assert.equal(committed.state.reveals.length, 4);
  assert.ok(committed.state.deep.tax.deductions >= 12_000);
  assert.ok(committed.state.deep.insurance.lifeCoverage > 0);
  assert.equal(committed.state.deep.business.active, true);
  assert.ok(committed.state.deep.business.monthlyRevenue > 0);
});

test("deep life settles tax, pension, insurance, business and age by quarter", () => {
  let state = createGame({ mode: "deep", theme: "emerald", roleId: "teacher", seed: 818181 });
  const openingPension = state.deep.pension.balance;
  const openingAge = state.age;
  for (let quarter = 0; quarter < 4; quarter += 1) {
    if (state.pendingEvent) {
      state = resolvePendingEvent(state, state.pendingEvent.event.choices[0].id).state;
    }
    state = beginYearPlanning(state).state;
    state = scheduleDeepAction(state, "raise_pension").state;
    state = commitYearPlan(state).state;
    state = skipYearReveals(state).state;
    state = advanceTurn(state).state;
    if (state.yearPhase === "chapter") state = continueAfterChapter(state).state;
  }
  assert.equal(state.turn, 5);
  assert.equal(state.age, openingAge + 1);
  assert.ok(state.deep.pension.balance > openingPension);
  assert.equal(state.deep.tax.yearTaxPaid, 0, "Q4 performs annual reconciliation");
  assert.ok(Number.isFinite(state.deep.tax.lastAnnualReconciliation));
  assert.ok(state.history.some((entry) => entry.tags.includes("季度结算")));
});

test("a deep life can complete all sixty years without a broken period", () => {
  let state = createGame({ mode: "deep", theme: "paper", roleId: "analyst", seed: 717171 });
  let guard = 0;
  while (state.phase !== "review" && guard < 2_000) {
    if (state.pendingEvent) {
      state = resolvePendingEvent(state, state.pendingEvent.event.choices[0].id).state;
    } else if (state.yearPhase === "opening") {
      state = beginYearPlanning(state).state;
    } else if (state.yearPhase === "planning") {
      state = scheduleDeepAction(state, "raise_pension").state;
      state = commitYearPlan(state).state;
    } else if (state.yearPhase === "reveal") {
      state = skipYearReveals(state).state;
    } else if (state.yearPhase === "consequence") {
      state = advanceTurn(state).state;
    } else if (state.yearPhase === "chapter") {
      state = continueAfterChapter(state).state;
    }
    guard += 1;
  }
  assert.equal(state.phase, "review");
  assert.equal(state.turn, 240);
  assert.equal(state.age, 82);
  assert.equal(state.history.filter((entry) => entry.tags.includes("季度结算")).length, 240);
  assert.ok(state.deep.legacy.generationScore >= 0);
});

test("AI tablemates remember interactions and can unlock relationship routes", () => {
  let state = createGame({ mode: "quick", theme: "paper", roleId: "teacher", seed: 606060 });
  state = beginYearPlanning(state).state;
  const player = state.aiPlayers[0];
  state = scheduleAIInteraction(state, player.id, "offer_help").state;
  state = commitYearPlan(state).state;
  const updated = state.aiPlayers.find((item) => item.id === player.id);
  assert.ok(updated.memories.length > player.memories.length);
  assert.ok(updated.trust >= player.trust);
  assert.ok(state.reveals.some((item) => item.tags.includes("AI角色") || item.tags.includes("关系")));
});

test("a quick game can finish a complete twelve-year loop", () => {
  let state = createGame({ mode: "quick", theme: "emerald", roleId: "teacher", seed: 775533 });
  let guard = 0;
  const chainEvents = [];
  const chapters = [];
  while (state.phase !== "review" && guard < 120) {
    if (state.pendingEvent) {
      if (state.pendingEvent.source === "chain") chainEvents.push(state.pendingEvent.event.id);
      const choice = state.pendingEvent.event.choices[0];
      state = resolvePendingEvent(state, choice.id).state;
    } else if (state.yearPhase === "opening") {
      state = beginYearPlanning(state).state;
    } else if (state.yearPhase === "planning") {
      const scheduled = state.turn === 1
        ? scheduleAIInteraction(state, state.aiPlayers[0].id, "offer_help")
        : scheduleLifeAction(state, "rest");
      assert.equal(scheduled.success, true);
      state = commitYearPlan(scheduled.state).state;
    } else if (state.yearPhase === "reveal") {
      state = state.turn % 2 === 0
        ? skipYearReveals(state).state
        : revealNextResult(state).state;
    } else if (state.yearPhase === "consequence") {
      state = advanceTurn(state).state;
    } else if (state.yearPhase === "chapter") {
      chapters.push(state.chapterSummary?.title);
      state = continueAfterChapter(state).state;
    }
    guard += 1;
  }
  assert.equal(state.phase, "review");
  assert.equal(state.turn, 12);
  assert.ok(state.history.filter((entry) => entry.type === "settlement").length >= 12);
  assert.ok(state.audits.length >= 10);
  assert.deepEqual(chainEvents, ["chain_layoff_1", "chain_layoff_2", "chain_layoff_3"]);
  assert.deepEqual(chapters.slice(0, 3), ["起步期", "探索期", "扩张期"]);
  assert.ok(state.delayedConsequences.some((item) => item.status === "resolved"));
});
