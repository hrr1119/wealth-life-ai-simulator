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
  scheduleLifeAction,
  scheduleSkill,
  seededRandom,
  skipYearReveals,
} from "../lib/engine.ts";
import { generateOpportunityCards } from "../lib/opportunity.ts";

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
