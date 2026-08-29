/**
 * Automated acceptance tests for the marginal-value correction to the live
 * decision engine: a player's value must depend heavily on what I've
 * already bought, not just on their own intrinsic market price. Runs
 * against the real seed dataset, no mocks. Mirrors the scenario from the
 * "CORREZIONE DEL MOTORE DECISIONALE LIVE" prompt: 4-3-3 / Bomber+Gioielli /
 * Prudente, Malen bought as Pc1, then Lautaro Martinez comes up.
 *
 * Usage: npm test (from repo root, or -w packages/server)
 */
import assert from "node:assert/strict";
import path from "node:path";
import {
  createNewAuctionSession, applyAuctionEvent, computeBidRecommendation,
  type AuctionSession, type PlayerDatabase, type AuctionStyleId,
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

const seedPath = path.join(__dirname, "..", "seed", "strumento_asta_mantra_2026_27.xlsx");
const db: PlayerDatabase = importExcelFile(seedPath);

const malen = db.players.find((p) => p.nome === "Malen")!;
const lautaro = db.players.find((p) => p.nome === "Martinez L.")!;
assert.ok(malen && lautaro, "seed dataset must contain Malen and Martinez L. (Lautaro) for this scenario");

// A real-world-price-anchor regression: a bargain-bin bit-part player must
// not inherit a still-open premium slot's full budget just because nobody
// has filled it yet (reported live: Yeboah, a Scommessa-tier winger from a
// small-blasone club worth 19 credits intrinsically, was getting a
// "RILANCIA FINO A 76" because he happened to be the best fit for the
// still-open "A1 TOP" slot, budgeted at 65).
const yeboah = db.players.find((p) => p.nome === "Yeboah J.")!;
assert.ok(yeboah, "seed dataset must contain Yeboah J. for this scenario");

function freshSession(auctionStyle: AuctionStyleId = "PRUDENT"): AuctionSession {
  return createNewAuctionSession(db, { settings: { primaryFormation: "4-3-3", strategyProfile: "BOMBER_GEMS", auctionStyle } });
}

function buy(session: AuctionSession, playerId: string, price: number): AuctionSession {
  return applyAuctionEvent(session, db, { type: "PLAYER_WON_BY_ME", playerId, price }).session;
}

function rec(session: AuctionSession, player = lautaro, bid = 1) {
  return computeBidRecommendation({ player, currentBid: bid, players: db.players, graduatorie: db.graduatorie, session, marketState: session.marketState });
}

console.log(`\nLoaded ${db.players.length} players from seed dataset.\n`);
console.log("Acceptance tests — marginal-value correction (Malen -> Lautaro scenario)\n");

test("43. saturation: DynamicMax after Malen@164 is drastically lower than with no Pc bought", () => {
  const before = freshSession();
  const after = buy(before, malen.id, 164);
  const dynamicMaxA = rec(before).dynamicMax;
  const dynamicMaxB = rec(after).dynamicMax;
  assert.ok(dynamicMaxB < dynamicMaxA * 0.5, `expected dynamicMax to at least halve, got ${dynamicMaxA} -> ${dynamicMaxB}`);
  // The literal bug scenario: RILANCIA FINO A 211+ on Lautaro after Malen@164 must not happen.
  assert.ok(dynamicMaxB < 100, `expected a saturated Pc2 ceiling well under 100, got ${dynamicMaxB}`);
});

test("44. sector investment pressure: overspending on Pc1 depresses Lautaro's cap more than underspending", () => {
  const base = freshSession();
  const afterOverspend = buy(base, malen.id, 164); // above the 145 plan -> overspent
  const afterSaving = buy(base, malen.id, 110); // below the 145 plan -> saved
  const dynamicMaxOverspend = rec(afterOverspend).dynamicMax;
  const dynamicMaxSaving = rec(afterSaving).dynamicMax;
  assert.ok(dynamicMaxOverspend < dynamicMaxSaving, `expected Malen@164 scenario < Malen@110 scenario, got ${dynamicMaxOverspend} vs ${dynamicMaxSaving}`);
});

test("45. cross-role: a genuinely open A-role top target is not penalized like the saturated Pc role", () => {
  const base = freshSession();
  const after = buy(base, malen.id, 164);
  const aTop = [...db.players].filter((p) => p.computed.famiglia433 === "A").sort((a, b) => b.computed.offertaMaxBase - a.computed.offertaMaxBase)[0];
  const dynamicMaxBefore = rec(base, aTop).dynamicMax;
  const dynamicMaxAfter = rec(after, aTop).dynamicMax;
  assert.ok(dynamicMaxAfter >= dynamicMaxBefore * 0.9, `an unrelated, still-open A slot must not collapse the way Pc2 did, got ${dynamicMaxBefore} -> ${dynamicMaxAfter}`);
});

test("46. remaining pool: a depleted Pc pool must not restore Pc1-level value to Pc2", () => {
  const base = freshSession();
  let after = buy(base, malen.id, 164);
  const pc1LevelBaseline = rec(base).dynamicMax; // unsaturated Pc1-era ceiling
  const otherPc = db.players.filter((p) => p.computed.famiglia433 === "Pc" && p.id !== malen.id && p.id !== lautaro.id);
  const opponent = after.managers.find((m) => !m.isMe)!.id;
  for (const p of otherPc) {
    const status = after.playerStates[p.id]?.status;
    if (status && status !== "AVAILABLE") continue;
    after = applyAuctionEvent(after, db, { type: "PLAYER_SOLD_TO_OPPONENT", playerId: p.id, price: 5, managerId: opponent }).session;
  }
  const depletedPoolDynamicMax = rec(after).dynamicMax;
  assert.ok(depletedPoolDynamicMax < pc1LevelBaseline * 0.6, `depleting the Pc pool must not snap Lautaro's cap back to Pc1-era levels (${pc1LevelBaseline}), got ${depletedPoolDynamicMax}`);
});

test("47. style: Prudente <= Medio <= Aggressivo even under saturation, all far below the unsaturated baseline", () => {
  const base = freshSession();
  const unsaturatedBaseline = rec(base).dynamicMax;
  const after = buy(base, malen.id, 164);
  const prudent = rec({ ...after, settings: { ...after.settings, auctionStyle: "PRUDENT" } }).dynamicMax;
  const medium = rec({ ...after, settings: { ...after.settings, auctionStyle: "MEDIUM" } }).dynamicMax;
  const aggressive = rec({ ...after, settings: { ...after.settings, auctionStyle: "AGGRESSIVE" } }).dynamicMax;
  assert.ok(prudent <= medium && medium <= aggressive, `expected prudent<=medium<=aggressive, got ${prudent}, ${medium}, ${aggressive}`);
  assert.ok(aggressive < unsaturatedBaseline * 0.5, `even AGGRESSIVE must stay well below the unsaturated Pc1-era baseline (${unsaturatedBaseline}), got ${aggressive}`);
});

test("48. equilibrium: Malen@164 then Lautaro at 160 must be MOLLA under Prudente, well before a second premium price", () => {
  const base = freshSession("PRUDENT");
  const after = buy(base, malen.id, 164);
  const recommendation = rec(after, lautaro, 160);
  assert.strictEqual(recommendation.action, "MOLLA", `expected MOLLA at 160 after Malen@164, got ${recommendation.action} (${recommendation.headline})`);
});

test("bargain player does not inherit a still-open premium slot's full budget", () => {
  const session = freshSession("PRUDENT");
  const recommendation = rec(session, yeboah, 1);
  assert.strictEqual(recommendation.slot, "A1", "sanity: Yeboah should be matched to the still-open A1 slot");
  const slotBudget = session.rosterSlots.find((s) => s.slotKey === "A1")!.targetBudgetDynamic;
  assert.ok(slotBudget > yeboah.computed.offertaMaxBase * 2, "sanity: the A1 TOP slot plan must be well above Yeboah's own intrinsic value for this to be a real test");
  assert.ok(
    recommendation.dynamicMax < yeboah.computed.offertaMaxBase * 2.5,
    `a Scommessa-tier player worth ${yeboah.computed.offertaMaxBase} must not get a cap anywhere near the slot's premium budget (${slotBudget}), got dynamicMax=${recommendation.dynamicMax}`
  );
});

test("38. UNDO restores DynamicMax exactly (event-sourced, no stale cache)", () => {
  const base = freshSession();
  const beforeBuy = rec(base).dynamicMax;
  const after = buy(base, malen.id, 164);
  const afterBuy = rec(after).dynamicMax;
  const undone = applyAuctionEvent(after, db, { type: "UNDO" }).session;
  const afterUndo = rec(undone).dynamicMax;
  assert.ok(afterBuy < beforeBuy, "sanity: buying Malen must actually reduce Lautaro's dynamicMax");
  assert.strictEqual(afterUndo, beforeBuy, `expected UNDO to restore the exact pre-purchase dynamicMax (${beforeBuy}), got ${afterUndo}`);
});

test("value opportunity: an exceptionally cheap Lautaro is still ATTACCA within the reduced ceiling", () => {
  const base = freshSession();
  const after = buy(base, malen.id, 164);
  const ceiling = rec(after).dynamicMax;
  const cheapBid = Math.max(1, Math.round(ceiling * 0.5));
  const recommendation = rec(after, lautaro, cheapBid);
  assert.strictEqual(recommendation.action, "ATTACCA", `a bid well under the reduced ceiling (${ceiling}) should still be ATTACCA, got ${recommendation.action}`);
});

console.log(`\n${passed} passed, ${failed} failed.\n`);
if (failed > 0) process.exit(1);
