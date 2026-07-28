import assert from "node:assert/strict";
import test from "node:test";

import { ASSETS, CAREERS, EVENTS, SKILLS } from "../lib/content.ts";
import {
  advanceTurn,
  buyAsset,
  createGame,
  getNetWorth,
  learnSkill,
  resolvePendingEvent,
  seededRandom,
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

test("a quick game can finish a complete twelve-year loop", () => {
  let state = createGame({ mode: "quick", theme: "emerald", roleId: "teacher", seed: 775533 });
  let guard = 0;
  while (state.phase !== "review" && guard < 30) {
    if (state.pendingEvent) {
      const choice = state.pendingEvent.event.choices[0];
      state = resolvePendingEvent(state, choice.id).state;
    } else {
      state = advanceTurn(state).state;
    }
    guard += 1;
  }
  assert.equal(state.phase, "review");
  assert.equal(state.turn, 12);
  assert.ok(state.history.filter((entry) => entry.type === "settlement").length >= 12);
  assert.ok(state.audits.length >= 10);
});
