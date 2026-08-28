/**
 * Automated acceptance tests for the formation/strategy/style extension
 * (section 32 of the spec). Runs against the real seed dataset, no mocks.
 *
 * Usage: npm test  (from repo root, or -w packages/server)
 */
import assert from "node:assert/strict";
import path from "node:path";
import {
  createNewAuctionSession, applyFormationChange, migrateSession, buildTargetRosterStructure,
  computeStrategicFitScore, computeStrategyFit, computeBidRecommendation,
  getFormation, getStrategy, getAuctionStyle, FORMATIONS, STRATEGIES,
  type AuctionSession, type PlayerDatabase, type FormationId, type StrategyId,
} from "@fanta/shared";
import { importExcelFile } from "../src/importExcel";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL  ${name}`);
    console.log(`        ${(e as Error).message}`);
  }
}

function slotHistogram(session: AuctionSession): Record<string, number> {
  const h: Record<string, number> = {};
  for (const s of session.rosterSlots) h[s.role] = (h[s.role] ?? 0) + 1;
  return h;
}

const seedPath = path.join(__dirname, "..", "seed", "strumento_asta_mantra_2026_27.xlsx");
const db: PlayerDatabase = importExcelFile(seedPath);

console.log(`\nLoaded ${db.players.length} players from seed dataset.\n`);
console.log("Acceptance tests — formation/strategy/style extension\n");

// 1. Formation change replaces the target slot structure.
test("1. formation change replaces slot structure", () => {
  const session = createNewAuctionSession(db, { settings: { primaryFormation: "4-3-3", strategyProfile: "BOMBER_GEMS" } });
  const before = slotHistogram(session);
  const { session: after } = applyFormationChange(session, db, "3-5-2");
  const afterHist = slotHistogram(after);
  assert.notDeepStrictEqual(before, afterHist, "role histogram should change when switching 4-3-3 -> 3-5-2");
  assert.strictEqual(after.rosterSlots.length, session.rosterSlots.length, "total slot count must be preserved");
  const totalBudget = after.rosterSlots.reduce((s, sl) => s + sl.targetBudgetDynamic, 0);
  assert.strictEqual(totalBudget, session.settings.crediti, "budget must still reconcile to exactly the configured credits");
});

// 2. Same player, different formation -> different StrategicFitScore.
test("2. same player, different formation -> different StrategicFitScore", () => {
  const strategy = getStrategy("BOMBER_GEMS");
  const f433 = getFormation("4-3-3");
  const f352 = getFormation("3-5-2");
  let found = false;
  for (const player of db.players) {
    const a = computeStrategicFitScore(player, f433, strategy);
    const b = computeStrategicFitScore(player, f352, strategy);
    if (a !== b) { found = true; break; }
  }
  assert.ok(found, "expected at least one player whose StrategicFitScore differs between 4-3-3 and 3-5-2");
});

// 3. Same session, different style -> monotonic DynamicMax (prudent <= medium <= aggressive).
test("3. same session, different style -> monotonic DynamicMax", () => {
  const base = createNewAuctionSession(db, { settings: { primaryFormation: "4-3-3", strategyProfile: "BOMBER_GEMS" } });
  const player = [...db.players].sort((a, b) => b.computed.offertaMaxBase - a.computed.offertaMaxBase)[0];
  const results = (["PRUDENT", "MEDIUM", "AGGRESSIVE"] as const).map((styleId) => {
    const session: AuctionSession = { ...base, settings: { ...base.settings, auctionStyle: styleId } };
    const rec = computeBidRecommendation({
      player, currentBid: 1, players: db.players, graduatorie: db.graduatorie, session, marketState: session.marketState,
    });
    return rec.dynamicMax;
  });
  assert.ok(results[0] <= results[1] && results[1] <= results[2], `expected prudent<=medium<=aggressive, got ${results.join(", ")}`);
});

// 4. Aggressive style must not blindly inflate every player.
test("4. aggressive style does not auto-inflate a low-priority player", () => {
  const base = createNewAuctionSession(db, { settings: { primaryFormation: "4-3-3", strategyProfile: "BOMBER_GEMS" } });
  const lowPriorityPlayer = [...db.players].sort((a, b) => a.computed.offertaMaxBase - b.computed.offertaMaxBase)
    .find((p) => p.computed.offertaMaxBase > 0)!;
  const medium: AuctionSession = { ...base, settings: { ...base.settings, auctionStyle: "MEDIUM" } };
  const aggressive: AuctionSession = { ...base, settings: { ...base.settings, auctionStyle: "AGGRESSIVE" } };
  const recMedium = computeBidRecommendation({
    player: lowPriorityPlayer, currentBid: 1, players: db.players, graduatorie: db.graduatorie, session: medium, marketState: medium.marketState,
  });
  const recAggressive = computeBidRecommendation({
    player: lowPriorityPlayer, currentBid: 1, players: db.players, graduatorie: db.graduatorie, session: aggressive, marketState: aggressive.marketState,
  });
  const delta = recAggressive.dynamicMax - recMedium.dynamicMax;
  assert.ok(delta <= 2, `expected a low-value player's DynamicMax to barely move between MEDIUM and AGGRESSIVE, moved by ${delta} (${recMedium.dynamicMax} -> ${recAggressive.dynamicMax})`);
});

// 5. Strategy fit differentiates comparable players (same role, different profile).
// Bomber+Gioielli explicitly rewards upside/gems over reliability; Solidità
// Premium explicitly rewards reliability/low-risk over upside (see their
// descriptions in strategies.ts) — so two same-role players who differ only
// on that axis must be ranked oppositely by the two strategies.
test("5. strategy fit differentiates comparable players", () => {
  const formation = getFormation("4-3-3");
  const bomberGems = getStrategy("BOMBER_GEMS");
  const solidity = getStrategy("PREMIUM_SOLIDITY");
  // Moderate, non-saturating baseline stats (a real top-tier template clamps
  // both variants to the 0-100 ceiling and hides the differentiation).
  const template = structuredClone(db.players.find((p) => p.computed.offertaMaxBase > 0)!);
  template.computed.indiceFanta = 45;
  template.computed.indiceAffare = 45;
  template.computed.titolarita = 60;

  const reliablePlayer = structuredClone(template);
  reliablePlayer.ruoloMantra = "A";
  reliablePlayer.affidabilita = "Alta";
  reliablePlayer.computed.fattoreRischio = 1.0;
  reliablePlayer.computed.gemScore = 10;

  const gemPlayer = structuredClone(template);
  gemPlayer.ruoloMantra = "A";
  gemPlayer.affidabilita = "Bassa";
  gemPlayer.computed.fattoreRischio = 0.6;
  gemPlayer.computed.gemScore = 90;

  const reliableUnderBomber = computeStrategyFit(reliablePlayer, formation, bomberGems);
  const gemUnderBomber = computeStrategyFit(gemPlayer, formation, bomberGems);
  const reliableUnderSolidity = computeStrategyFit(reliablePlayer, formation, solidity);
  const gemUnderSolidity = computeStrategyFit(gemPlayer, formation, solidity);

  assert.ok(gemUnderBomber > reliableUnderBomber, "Bomber+Gioielli should rate the high-upside gem above the reliable player");
  assert.ok(reliableUnderSolidity > gemUnderSolidity, "Solidità Premium should rate the reliable player above the high-upside gem");
});

// 6. All 11 x 7 x 3 = 231 combinations produce a valid budget=500 configuration.
test("6. all 231 formation x strategy x style combinations reconcile to budget=500", () => {
  const formationIds = Object.keys(FORMATIONS) as FormationId[];
  const strategyIds = Object.keys(STRATEGIES) as StrategyId[];
  const styleIds = ["PRUDENT", "MEDIUM", "AGGRESSIVE"] as const;
  assert.strictEqual(formationIds.length, 11);
  assert.strictEqual(strategyIds.length, 7);
  assert.strictEqual(styleIds.length, 3);
  let combos = 0;
  for (const primaryFormation of formationIds) {
    for (const strategyProfile of strategyIds) {
      for (const auctionStyle of styleIds) {
        combos++;
        const session = createNewAuctionSession(db, { settings: { primaryFormation, strategyProfile, auctionStyle, crediti: 500 } });
        const total = session.rosterSlots.reduce((s, sl) => s + sl.targetBudgetDynamic, 0);
        assert.strictEqual(total, 500, `${primaryFormation}/${strategyProfile}/${auctionStyle}: budget total ${total} !== 500`);
        assert.strictEqual(session.rosterSlots.length, session.settings.giocatoriMovimento + session.settings.portieri);
      }
    }
  }
  assert.strictEqual(combos, 231, `expected 231 combinations, ran ${combos}`);
});

// 7. Every formation has at least one theoretically completable 25-player construction.
test("7. every formation yields a completable movement-slot construction", () => {
  const strategy = getStrategy("BALANCED");
  for (const formationId of Object.keys(FORMATIONS) as FormationId[]) {
    const formation = getFormation(formationId);
    const plan = buildTargetRosterStructure(formation, strategy, { crediti: 500, giocatoriMovimento: 25, portieri: 3 });
    const movementSlots = plan.filter((s) => s.famiglia !== "Por");
    assert.strictEqual(movementSlots.length, 25, `${formationId}: expected 25 movement slots, got ${movementSlots.length}`);
    assert.ok(movementSlots.every((s) => s.targetBudget >= 1), `${formationId}: every slot must have a positive target budget`);
  }
});

// 8. Old sessions must load correctly as 4-3-3 / Bomber+Gioielli / Medio.
test("8. legacy sessions migrate to 4-3-3 / BOMBER_GEMS / MEDIUM", () => {
  const fresh = createNewAuctionSession(db, { settings: { primaryFormation: "4-3-3", strategyProfile: "BOMBER_GEMS" } });
  const legacy: any = structuredClone(fresh);
  delete legacy.settings.primaryFormation;
  delete legacy.settings.strategyProfile;
  delete legacy.settings.auctionStyle;
  delete legacy.secondaryFormationCompatibility;
  for (const slot of legacy.rosterSlots) delete slot.role;
  // Simulate a pre-existing purchase to verify ownership survives migration —
  // via the manager's tracked players (the source of truth rosterSlots is
  // rebuilt from), matching how a real in-progress legacy session is shaped.
  const me = legacy.managers.find((m: any) => m.isMe);
  const ownedPlayer = db.players.find((p) => p.ruoloMantra.split("/").includes("Pc"))!;
  me.players.push({ playerId: ownedPlayer.id, paidPrice: 42, acquiredAt: new Date().toISOString() });
  const migrated = migrateSession(legacy as AuctionSession, db);
  assert.strictEqual(migrated.settings.primaryFormation, "4-3-3");
  assert.strictEqual(migrated.settings.strategyProfile, "BOMBER_GEMS");
  assert.strictEqual(migrated.settings.auctionStyle, "MEDIUM");
  assert.ok(migrated.rosterSlots.every((s) => !!s.role), "every roster slot must have a role assigned after migration");
  assert.ok(
    migrated.rosterSlots.some((s) => s.playerId === ownedPlayer.id),
    "the pre-existing player assignment must survive migration"
  );
});

console.log(`\n${passed} passed, ${failed} failed.\n`);
if (failed > 0) process.exit(1);
