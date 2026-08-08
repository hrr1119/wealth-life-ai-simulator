import assert from "node:assert/strict";
import test from "node:test";

import { ASSETS, CAREERS, EVENTS, SKILLS, createAIPlayers } from "../lib/content.ts";
import { CAREER_STORY_EVENTS } from "../lib/career-story.ts";
import { directPersonalEvent } from "../lib/event-director.ts";
import { LIFE_STORY_EVENTS } from "../lib/life-story.ts";
import {
  advanceTurn,
  beginYearPlanning,
  buyAsset,
  commitYearPlan,
  continueAfterChapter,
  continueAfterLearningPhase,
  createGame,
  enterOrdinaryActionPhase,
  finishOrdinaryActionPhase,
  finishPlayerInteractionPhase,
  generateReview,
  getNetWorth,
  learnSkill,
  resolvePendingEvent,
  resolveMacroEventPhase,
  resolvePersonalEventPhase,
  scheduleAIInteraction,
  scheduleAssetSale,
  scheduleContractAction,
  scheduleDeepAction,
  scheduleLifeAction,
  scheduleSkill,
  settleTurnPhase,
  seededRandom,
  skipYearReveals,
  takeLifeAction,
  upgradeGameState,
} from "../lib/engine.ts";
import {
  getActiveSkillCombinations,
  getAssetSaleQuote,
  getCareerReadiness,
  getPortfolioDiagnostics,
  getUnmetSkillPrerequisites,
} from "../lib/progression.ts";
import {
  createRelationshipContract,
  decideAIPlayerTurn,
  getFamilyPressure,
} from "../lib/relationships.ts";
import { generateOpportunityCards } from "../lib/opportunity.ts";
import { generateOpportunityCardsWithAI } from "../lib/ai.ts";
import {
  validateMultiplayerPlanSelection,
} from "../lib/multiplayer.ts";
import {
  MULTIPLAYER_EVENT_CATALOG,
  buildMultiplayerActionCatalog,
  createMultiplayerDomainState,
  getMultiplayerStartingFinance,
  selectMultiplayerWorldEvent,
  settleMultiplayerTurn,
} from "../lib/multiplayer-domain.ts";

test("content library keeps the MVP breadth", () => {
  assert.ok(CAREERS.length >= 24, "at least 24 careers");
  assert.ok(SKILLS.length >= 40, "at least 40 skills");
  assert.ok(ASSETS.length >= 20, "at least 20 assets");
  assert.ok(EVENTS.length >= 30, "at least 30 event templates");
  assert.equal(CAREER_STORY_EVENTS.length, 20, "one complete career pack has twenty authored events");
  assert.equal(new Set(CAREER_STORY_EVENTS.map((event) => event.storyPackId)).size, 4);
  assert.ok(CAREER_STORY_EVENTS.every((event) => event.choices.length === 3));
  assert.equal(LIFE_STORY_EVENTS.length, 30, "six life domains each provide a five-stage story");
  assert.equal(new Set(LIFE_STORY_EVENTS.map((event) => event.storyPackId)).size, 6);
  assert.ok(LIFE_STORY_EVENTS.every((event) => event.choices.length === 3));
  assert.equal(EVENTS.length + CAREER_STORY_EVENTS.length + LIFE_STORY_EVENTS.length, 86);
  assert.equal(createAIPlayers(20260801).length, 4, "the table has at least four independent AI roles");
});

test("life story packs preserve authored continuity and unique memory evidence", () => {
  const packs = Map.groupBy(LIFE_STORY_EVENTS, (event) => event.storyPackId);
  assert.equal(packs.size, 6);
  for (const [packId, events] of packs) {
    const ordered = events.toSorted((a, b) => a.storyStage - b.storyStage);
    assert.deepEqual(ordered.map((event) => event.storyStage), [1, 2, 3, 4, 5]);
    for (let index = 1; index < ordered.length; index += 1) {
      const previous = ordered[index - 1];
      const current = ordered[index];
      const memoryPrefix = `人生包:${packId.replace("life-", "")}:${previous.storyStage}`;
      assert.ok(current.requiredAnyTags.includes(memoryPrefix));
      assert.ok(previous.choices.every((choice) => choice.memoryTags.includes(memoryPrefix)));
    }
  }
});

test("the event director prioritizes the next stage of an active life story", () => {
  const state = createGame({ mode: "quick", theme: "paper", roleId: "steady", seed: 223344 });
  state.turn = 2;
  state.memory["人生包:business:1"] = 1;
  state.history.push({
    id: "business-signal",
    turn: 2,
    type: "action",
    title: "经营、补库存与拓客",
    description: "测试经营故事连续性",
    tags: ["企业", "经营", "现金流"],
    timestamp: 2,
  });
  const directed = directPersonalEvent(state, 0);
  assert.ok(directed.director.lastDecision.candidateIds.includes("business-inventory"));
  assert.equal(directed.pending.event.id, "business-inventory");
  assert.ok(directed.director.lastDecision.reasons.some((reason) => reason.includes("第 2 阶段")));
});

test("the seeded random stream is deterministic and bounded", () => {
  const first = Array.from({ length: 20 }, (_, index) => seededRandom(20260728, index));
  const second = Array.from({ length: 20 }, (_, index) => seededRandom(20260728, index));
  assert.deepEqual(first, second);
  assert.ok(first.every((value) => value >= 0 && value < 1));
});

test("advanced skills require real foundations and combinations become auditable evidence", () => {
  const state = createGame({ mode: "quick", theme: "paper", roleId: "steady", seed: 334455 });
  const unmet = getUnmetSkillPrerequisites(state.skills, "portfolio");
  assert.deepEqual(unmet.map((item) => item.skillId), ["finance", "risk"]);
  const blocked = learnSkill(state, "portfolio");
  assert.equal(blocked.success, false);
  assert.match(blocked.message, /前置证据/);

  state.skills.finance = 2;
  state.skills.research = 2;
  state.skills.risk = 2;
  state.skills.portfolio = 1;
  assert.ok(getActiveSkillCombinations(state.skills, ["finance"]).some((item) => item.id === "evidence-investor"));
  const learned = learnSkill(state, "portfolio");
  assert.equal(learned.success, true);
  const comboStudy = learnSkill(learned.state, "finance");
  assert.equal(comboStudy.success, true);
  assert.ok(comboStudy.state.audits.at(-1).summary.some((line) => /技能组合/.test(line)));
});

test("career readiness responds to skill evidence, runway and market context", () => {
  const state = createGame({ mode: "quick", theme: "paper", roleId: "steady", seed: 445566 });
  const career = CAREERS.find((item) => item.id === "quant");
  const before = getCareerReadiness(state, career);
  assert.equal(before.label, "准备不足");
  assert.ok(before.blockers.length > 0);

  state.cash = 500_000;
  state.energy = 95;
  for (const skillId of career.requiredSkills) state.skills[skillId] = 4;
  for (const tag of career.tags) state.memory[tag] = 1;
  const after = getCareerReadiness(state, career);
  assert.ok(after.score > before.score + 0.35);
  assert.ok(["证据成形", "高度匹配"].includes(after.label));
  assert.ok(after.strengths.some((line) => /熟练度/.test(line)));
});

test("portfolio diagnostics expose concentration and asset sales keep liquidity costs", () => {
  let state = createGame({ mode: "quick", theme: "paper", roleId: "merchant", seed: 556677 });
  state.cash = 500_000;
  state = buyAsset(state, "restaurant_equity", 100_000).state;
  const diagnostics = getPortfolioDiagnostics(state);
  assert.equal(diagnostics.largestPositionShare, 1);
  assert.ok(diagnostics.warnings.some((line) => /单一持仓/.test(line)));
  const quote = getAssetSaleQuote(state, "restaurant_equity", 0.25);
  assert.equal(quote.fraction, 0.25);
  assert.ok(quote.netProceeds < quote.grossValue);
  assert.equal(quote.timeCost, 3);

  state.yearPhase = "opening";
  state.pendingEvent = null;
  state = beginYearPlanning(state).state;
  const scheduled = scheduleAssetSale(state, "restaurant_equity", 0.25);
  assert.equal(scheduled.success, true);
  assert.equal(scheduled.state.plan.at(-1).kind, "asset_sale");
  const committed = commitYearPlan(scheduled.state);
  assert.equal(committed.success, true);
  assert.ok(committed.state.history.some((entry) => entry.title === "变现餐饮合伙股权"));
  assert.ok(committed.state.assets[0].value < 100_000);
});

test("family actions build a persistent responsibility ledger in every game mode", () => {
  const state = createGame({ mode: "quick", theme: "paper", roleId: "steady", seed: 667788 });
  assert.equal(state.familyLedger.stage, "independent");
  const result = takeLifeAction(state, "family_budget");
  assert.equal(result.success, true);
  assert.equal(result.state.familyLedger.stage, "partnered");
  assert.ok(result.state.familyLedger.responsibilities.some((item) => item.id === "shared-living"));
  assert.ok(result.state.familyLedger.decisions.some((item) => item.choice === "召开家庭财务会"));
  const pressure = getFamilyPressure(result.state.familyLedger);
  assert.ok(pressure.cashPerPeriod > 0);
  assert.ok(pressure.timePerPeriod > 0);
});

test("family responsibilities create recurring settlement costs outside deep mode", () => {
  const initial = createGame({ mode: "quick", theme: "paper", roleId: "steady", seed: 667789 });
  const withFamily = takeLifeAction(initial, "family_budget").state;
  const withoutFamily = structuredClone(withFamily);
  withoutFamily.familyLedger.responsibilities = [];
  for (const state of [withFamily, withoutFamily]) {
    state.yearPhase = "consequence";
    state.turnPhase = "learning";
  }
  const charged = advanceTurn(withFamily).state;
  const baseline = advanceTurn(withoutFamily).state;
  assert.equal(baseline.cash - charged.cash, 12_000);
  assert.match(charged.history.findLast((entry) => entry.type === "settlement").description, /家庭持续责任/);
});

test("AI tablemates make deterministic goal-aware decisions with explicit reasons", () => {
  const game = createGame({ mode: "quick", theme: "paper", roleId: "steady", seed: 778899 });
  const familyPlayer = {
    ...game.aiPlayers[0],
    archetype: "家庭守护者",
    goal: "提高家庭抗风险能力",
    cash: 80_000,
    debt: 0,
  };
  const opportunityPlayer = {
    ...game.aiPlayers[1],
    archetype: "机会猎手",
    goal: "抓住周期性的高回报机会",
    cash: 80_000,
    debt: 0,
    risk: 0.9,
  };
  const familyDecision = decideAIPlayerTurn(familyPlayer, game.world, 1, 12);
  const repeated = decideAIPlayerTurn(familyPlayer, game.world, 1, 12);
  const opportunityDecision = decideAIPlayerTurn(opportunityPlayer, game.world, 1, 12);
  assert.deepEqual(familyDecision.lastDecision, repeated.lastDecision);
  assert.equal(familyDecision.lastDecision.actionId, "family_protection");
  assert.equal(opportunityDecision.lastDecision.actionId, "side_business");
  assert.match(familyDecision.lastDecision.reason, /家庭|风险/);
  assert.ok(familyDecision.decisionHistory.length > familyPlayer.decisionHistory.length);
});

test("contracts enter the shared plan, record fulfillment and breach when ignored", () => {
  let state = createGame({ mode: "quick", theme: "paper", roleId: "steady", seed: 889900 });
  state.cash = 200_000;
  state.energy = 100;
  state.relationship = 100;
  state.skills.communication = 5;
  state.skills.negotiation = 5;
  state.skills.delivery = 5;
  state.aiPlayers[0].trust = 100;
  const contract = createRelationshipContract(0, state.aiPlayers[0], true);
  contract.nextDueTurn = 1;
  state.contracts.push(contract);
  state = beginYearPlanning(state).state;
  const scheduled = scheduleContractAction(state, contract.id, "fulfill");
  assert.equal(scheduled.success, true);
  assert.equal(scheduled.state.plan.at(-1).kind, "contract");
  const committed = commitYearPlan(scheduled.state);
  assert.equal(committed.success, true);
  assert.ok(committed.state.contracts[0].records.some((record) => record.action === "fulfilled"));
  assert.ok(committed.state.history.some((entry) => entry.title.startsWith("履行合同")));

  let ignored = createGame({ mode: "quick", theme: "paper", roleId: "steady", seed: 990011 });
  const ignoredContract = createRelationshipContract(0, ignored.aiPlayers[0], true);
  ignoredContract.nextDueTurn = 1;
  ignored.contracts.push(ignoredContract);
  ignored.yearPhase = "consequence";
  ignored.turnPhase = "learning";
  const advanced = advanceTurn(ignored);
  assert.equal(advanced.success, true);
  assert.equal(advanced.state.contracts[0].status, "breached");
  assert.ok(advanced.state.history.some((entry) => entry.title.startsWith("合同逾期")));
});

test("multiplayer reuses the complete career, skill, asset and event catalog", () => {
  const domain = createMultiplayerDomainState(20260808, 1);
  const finance = getMultiplayerStartingFinance(domain);
  const catalog = buildMultiplayerActionCatalog(domain, finance.cash, "player-1", [], 1);

  assert.equal(MULTIPLAYER_EVENT_CATALOG.length, 86);
  assert.equal(catalog.filter((action) => action.kind === "career").length, CAREERS.length);
  assert.equal(catalog.filter((action) => action.kind === "skill").length, SKILLS.length);
  assert.equal(catalog.filter((action) => action.kind === "asset_buy").length, ASSETS.length);
  assert.ok(catalog.some((action) => action.kind === "life" && action.targetId === "family_budget"));
  assert.ok(catalog.some((action) => action.locked && action.lockReason));
  assert.equal(new Set(catalog.map((action) => action.id)).size, catalog.length);

  const work = catalog.find((action) => action.kind === "career_work");
  const family = catalog.find((action) => action.kind === "life" && action.targetId === "family_budget");
  assert.ok(work && family);
  const valid = validateMultiplayerPlanSelection(
    [{ id: work.id }, { id: family.id }],
    finance.cash,
    catalog,
  );
  assert.deepEqual(valid?.map((item) => item.id), [work.id, family.id]);
  assert.equal(
    validateMultiplayerPlanSelection(
      [
        { id: work.id },
        { id: family.id },
        { id: catalog.find((action) => action.kind === "life" && action.targetId === "rest")?.id },
        { id: catalog.find((action) => action.kind === "life" && action.targetId === "network")?.id },
      ],
      finance.cash,
      catalog,
    ),
    null,
    "more than three simultaneous actions is rejected",
  );
  const locked = catalog.find((action) => action.locked);
  assert.ok(locked);
  assert.equal(
    validateMultiplayerPlanSelection([{ id: locked.id }], finance.cash, catalog),
    null,
    "locked prerequisites or unaffordable actions are rejected",
  );
  assert.equal(
    validateMultiplayerPlanSelection([{ id: work.id }, { id: work.id }], finance.cash, catalog),
    null,
    "duplicate actions are rejected",
  );
});

test("multiplayer settlement persists assets, family responsibility and event memory", () => {
  const domain = createMultiplayerDomainState(20260809, 1);
  const finance = getMultiplayerStartingFinance(domain);
  const event = selectMultiplayerWorldEvent(20260809, 1, [domain]);
  const catalog = buildMultiplayerActionCatalog(domain, finance.cash, "player-1", [], 1);
  const family = catalog.find((action) => action.kind === "life" && action.targetId === "family_budget");
  const asset = catalog.find((action) => action.kind === "asset_buy" && !action.locked);
  assert.ok(family && asset && event.choices[0]);

  const settlement = settleMultiplayerTurn(
    [{
      id: "player-1",
      name: "甲",
      ...finance,
      domain,
      plan: { actions: [family, asset], eventChoiceId: event.choices[0].id },
    }],
    [],
    event,
    20260809,
    1,
  );
  const result = settlement.players[0];
  assert.equal(result.domain.assets.length, 1);
  assert.ok(result.domain.familyLedger.responsibilities.some((item) => item.id === "shared-living"));
  assert.equal(result.domain.eventHistory.length, 1);
  assert.equal(settlement.reveals[0].familyCost, 12_000);
  assert.ok(settlement.reveals[0].outcomes.some((outcome) => outcome.kind === "settlement"));
});

test("multiplayer contracts require both parties to fulfill and record breach when one ignores", () => {
  const domainA = createMultiplayerDomainState(20260810, 1);
  const domainB = createMultiplayerDomainState(20260810, 2);
  const financeA = getMultiplayerStartingFinance(domainA);
  const financeB = getMultiplayerStartingFinance(domainB);
  const event = selectMultiplayerWorldEvent(20260810, 1, [domainA, domainB]);
  const contract = {
    id: "contract-test",
    title: "联合项目测试协议",
    partyIds: ["a", "b"],
    partyNames: ["甲", "乙"],
    terms: "双方每期共同投入并完成一次交付。",
    status: "active",
    contribution: 500,
    timeCost: 2,
    payout: 1_500,
    incomeDelta: 100,
    exitCost: 300,
    nextDueTurn: 1,
    milestone: 0,
    records: [{ turn: 0, action: "accepted", detail: "合同生效。" }],
  };
  const actionA = buildMultiplayerActionCatalog(domainA, financeA.cash, "a", [contract], 1)
    .find((action) => action.contractAction === "fulfill");
  const actionB = buildMultiplayerActionCatalog(domainB, financeB.cash, "b", [contract], 1)
    .find((action) => action.contractAction === "fulfill");
  assert.ok(actionA && actionB && event.choices[0]);

  const fulfilled = settleMultiplayerTurn(
    [
      { id: "a", name: "甲", ...financeA, domain: domainA, plan: { actions: [actionA], eventChoiceId: event.choices[0].id } },
      { id: "b", name: "乙", ...financeB, domain: domainB, plan: { actions: [actionB], eventChoiceId: event.choices[0].id } },
    ],
    [contract],
    event,
    20260810,
    1,
  );
  assert.equal(fulfilled.contracts[0].status, "active");
  assert.equal(fulfilled.contracts[0].milestone, 1);
  assert.ok(fulfilled.contracts[0].records.some((record) => record.action === "fulfilled"));

  const breached = settleMultiplayerTurn(
    [
      { id: "a", name: "甲", ...financeA, domain: domainA, plan: { actions: [actionA], eventChoiceId: event.choices[0].id } },
      { id: "b", name: "乙", ...financeB, domain: domainB, plan: { actions: [], eventChoiceId: event.choices[0].id } },
    ],
    [contract],
    event,
    20260810,
    1,
  );
  assert.equal(breached.contracts[0].status, "breached");
  assert.ok(breached.players[1].trust < financeB.trust);
});

test("a new game reproduces its world from the same seed", () => {
  const a = createGame({ mode: "quick", theme: "emerald", roleId: "steady", seed: 884211 });
  const b = createGame({ mode: "quick", theme: "paper", roleId: "steady", seed: 884211 });
  assert.deepEqual(a.world, b.world);
  assert.deepEqual(a.talents, b.talents);
  assert.equal(a.maxTurns, 12);
  assert.equal(a.opportunityTokens, 1);
});

test("older saves migrate into route, director, family, AI agency and contract state", () => {
  const legacy = structuredClone(
    createGame({ mode: "quick", theme: "paper", roleId: "teacher", seed: 884212 }),
  );
  legacy.version = 4;
  delete legacy.routeGraph;
  delete legacy.eventDirector;
  delete legacy.familyLedger;
  delete legacy.contracts;
  for (const player of legacy.aiPlayers) {
    delete player.strategy;
    delete player.energy;
    delete player.stress;
    delete player.lastDecision;
    delete player.decisionHistory;
  }
  legacy.history.push({
    id: "legacy-action",
    turn: 1,
    type: "action",
    title: "legacy career evidence",
    description: "a persisted choice from an older save",
    tags: ["职业"],
    timestamp: 1,
  });
  const migrated = upgradeGameState(legacy);
  assert.equal(migrated.version, 6);
  assert.ok(migrated.routeGraph.nodes.some((node) => node.label === "legacy career evidence"));
  assert.deepEqual(migrated.eventDirector.recentEventIds, []);
  assert.equal(migrated.familyLedger.stage, "independent");
  assert.deepEqual(migrated.contracts, []);
  assert.ok(migrated.aiPlayers.every((player) => player.strategy && Array.isArray(player.decisionHistory)));
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

test("the product-spec turn visits all seven distinct gameplay phases", () => {
  let state = createGame({ mode: "quick", theme: "emerald", roleId: "steady", seed: 515151 });
  assert.equal(state.turnPhase, "world");

  state = enterOrdinaryActionPhase(state).state;
  assert.equal(state.turnPhase, "action");
  assert.equal(state.queuedPersonalEvent, null, "personal events are not selected before this turn's actions");
  assert.equal(state.pendingEvent, null);

  state = scheduleSkill(state, "writing").state;
  state = finishOrdinaryActionPhase(state).state;
  assert.equal(state.turnPhase, "interaction");
  state = scheduleAIInteraction(state, state.aiPlayers[0].id, "offer_help").state;

  state = finishPlayerInteractionPhase(state).state;
  assert.equal(state.turnPhase, "macro");
  assert.ok(state.macroEvent);
  assert.ok(state.queuedPersonalEvent, "the event director runs only after current actions resolve");
  assert.ok(state.eventDirector.lastDecision.actionSignals.length > 0);
  assert.equal(state.yearPhase, "consequence", "ordinary actions are already rule-resolved before public events");

  state = resolveMacroEventPhase(state, state.macroEvent.choices[0].id).state;
  assert.equal(state.turnPhase, "personal");
  assert.ok(state.pendingEvent);

  state = resolvePersonalEventPhase(state, state.pendingEvent.event.choices[0].id).state;
  assert.equal(state.turnPhase, "settlement");

  state = settleTurnPhase(state).state;
  assert.equal(state.turnPhase, "learning");
  assert.ok(state.history.some((entry) => entry.type === "settlement"));
  assert.ok(state.history.some((entry) => entry.tags.includes("宏观")));

  state = continueAfterLearningPhase(state).state;
  assert.equal(state.turnPhase, "world");
  assert.equal(state.turn, 2);
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

test("the route graph grows from decisions instead of elapsed turns", () => {
  const initial = createGame({ mode: "quick", theme: "emerald", roleId: "steady", seed: 424244 });
  assert.equal(initial.routeGraph.nodes.length, 3, "each lane starts with one explicit origin");
  let state = enterOrdinaryActionPhase(initial).state;
  state = scheduleSkill(state, "writing").state;
  state = finishOrdinaryActionPhase(state).state;
  state = finishPlayerInteractionPhase(state).state;
  const writingNode = state.routeGraph.nodes.find((node) => node.sourceId === "writing");
  assert.ok(writingNode, "the chosen skill becomes a persistent route node");
  assert.equal(writingNode.turn, 1);
  assert.match(writingNode.evidence, /./);
  assert.ok(state.routeGraph.edges.some((edge) => edge.to === writingNode.id));

  const untouched = createGame({ mode: "quick", theme: "emerald", roleId: "steady", seed: 424244 });
  assert.equal(untouched.turn, state.turn);
  assert.equal(untouched.routeGraph.nodes.length, 3, "time alone does not manufacture route progress");
});

test("current actions change the event director candidate set", () => {
  function afterAction(actionId) {
    let state = createGame({ mode: "quick", theme: "paper", roleId: "teacher", seed: 121212 });
    state = enterOrdinaryActionPhase(state).state;
    state = scheduleLifeAction(state, actionId).state;
    state = finishOrdinaryActionPhase(state).state;
    return finishPlayerInteractionPhase(state).state;
  }

  const incomePath = afterAction("side_project");
  const recoveryPath = afterAction("rest");
  assert.ok(incomePath.eventDirector.lastDecision.actionSignals.some((signal) => /副业|income/.test(signal)));
  assert.ok(recoveryPath.eventDirector.lastDecision.actionSignals.some((signal) => /休息|恢复|wellbeing/.test(signal)));
  assert.notDeepEqual(
    incomePath.eventDirector.lastDecision.candidateIds.slice(0, 5),
    recoveryPath.eventDirector.lastDecision.candidateIds.slice(0, 5),
  );
});

test("a quick game can finish a complete twelve-year loop", () => {
  let state = createGame({ mode: "quick", theme: "emerald", roleId: "teacher", seed: 775533 });
  let guard = 0;
  const chapters = [];
  while (state.phase !== "review" && guard < 220) {
    if (state.turnPhase === "world") {
      state = enterOrdinaryActionPhase(state).state;
    } else if (state.turnPhase === "action") {
      const scheduled = state.turn === 1
        ? scheduleSkill(state, "writing")
        : scheduleLifeAction(state, "rest");
      assert.equal(scheduled.success, true);
      state = finishOrdinaryActionPhase(scheduled.state).state;
    } else if (state.turnPhase === "interaction") {
      if (state.turn === 1) {
        state = scheduleAIInteraction(state, state.aiPlayers[0].id, "offer_help").state;
      }
      state = finishPlayerInteractionPhase(state).state;
    } else if (state.turnPhase === "macro") {
      state = resolveMacroEventPhase(state, state.macroEvent.choices[0].id).state;
    } else if (state.turnPhase === "personal") {
      state = state.pendingEvent
        ? resolvePersonalEventPhase(state, state.pendingEvent.event.choices[0].id).state
        : skipEmptyPersonalEventPhase(state).state;
    } else if (state.turnPhase === "settlement") {
      state = settleTurnPhase(state).state;
    } else if (state.turnPhase === "learning") {
      if (state.chapterSummary) chapters.push(state.chapterSummary.title);
      state = continueAfterLearningPhase(state).state;
    }
    guard += 1;
  }
  assert.equal(state.phase, "review");
  assert.equal(state.turn, 12);
  assert.ok(state.history.filter((entry) => entry.type === "settlement").length >= 12);
  assert.ok(state.audits.length >= 10);
  assert.deepEqual(chapters.slice(0, 3), ["起步期", "探索期", "扩张期"]);
  assert.ok(state.eventDirector.recentEventIds.length > 0);
  assert.ok(state.routeGraph.nodes.length > 3);
  assert.ok(state.delayedConsequences.some((item) => item.status === "resolved"));
  const review = generateReview(state);
  assert.ok(review.causalChains.length > 0);
  assert.ok(review.causalChains.every((chain) => chain.cause && chain.effect && chain.evidence));
});
