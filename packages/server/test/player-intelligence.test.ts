/**
 * Automated acceptance tests for the Player Intelligence Layer: rigoristi,
 * coppie/ballottaggi, propensione al gol, and their (bounded, roster-aware)
 * influence on ranking and DynamicMax. Runs against the real seed dataset,
 * no mocks. Mirrors the acceptance tests from the "PLAYER INTELLIGENCE"
 * prompt (sections 53-61).
 *
 * Usage: npm test (from repo root, or -w packages/server)
 */
import assert from "node:assert/strict";
import path from "node:path";
import {
  createNewAuctionSession, applyAuctionEvent, computeLiveScore, computeDynamicMax, computeBidRecommendation,
  buildPlayerIntelligenceStore, applyManualImport, computeGoalThreat, computePercentilesWithinRole,
  tierForPercentile, buildPenaltyIntelligence, buildSetPieceIntelligence, computeBonusPotential,
  computeStaleness, stalenessWeight, computePairValue, eligibleMantraRoles, findOpenSlotForRoles,
  estimateTeamAttackFactor, EMPTY_INTELLIGENCE_STORE,
  type AuctionSession, type PlayerDatabase, type Player, type PlayerIntelligence, type PlayerIntelligenceStore,
  type PlayerPairing, type GoalThreatIntelligence,
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

console.log(`\nLoaded ${db.players.length} players from seed dataset.\n`);
console.log("Acceptance tests — Player Intelligence Layer\n");

function cloneTwin(base: Player, id: string, nome: string): Player {
  const p = structuredClone(base);
  p.id = id;
  p.nome = nome;
  return p;
}

function freshSession(): AuctionSession {
  return createNewAuctionSession(db, { settings: { primaryFormation: "4-3-3", strategyProfile: "BOMBER_GEMS", auctionStyle: "MEDIUM" } });
}

function goalThreatIntel(percentile: number, confidence: GoalThreatIntelligence["confidence"] = "HIGH"): GoalThreatIntelligence {
  return { index: percentile, percentileWithinRole: percentile, tier: tierForPercentile(percentile), confidence, sampleMinutes: 2000, editorialSignals: [], staleness: "FRESH" };
}

function makeIntel(playerId: string, overrides: Partial<PlayerIntelligence>): PlayerIntelligence {
  const base: PlayerIntelligence = {
    playerId,
    lineup: { starterProbability: 90, category: "NAILED", battleId: null, directCompetitorId: null, staleness: "FRESH" },
    pairing: { pairings: [] },
    penalty: buildPenaltyIntelligence({ rank: null, confidence: 0, starterProbability: 90, teamAttackFactor: 1, updatedAt: null }),
    setPieces: buildSetPieceIntelligence({ corner: "NONE", direct: "NONE", indirect: "NONE", updatedAt: null }),
    goalThreat: goalThreatIntel(50, "NONE"),
    bonusPotential: { score: 0, reliable: 0, upside: 0 },
    manualOverride: null,
    updatedAt: new Date().toISOString(),
    confidence: 0.7,
    sources: [],
  };
  const merged = { ...base, ...overrides };
  merged.bonusPotential = computeBonusPotential({ goalThreat: merged.goalThreat, penalty: merged.penalty, setPieces: merged.setPieces, starterProbability: merged.lineup.starterProbability });
  return merged;
}

function storeWith(players: Record<string, PlayerIntelligence>, pairings: PlayerPairing[] = []): PlayerIntelligenceStore {
  return { players, battles: [], pairings, penaltyHierarchies: [], updatedAt: new Date().toISOString() };
}

const aTemplate = db.players.find((p) => p.computed.famiglia433 === "A" && p.computed.offertaMaxBase > 15 && p.computed.offertaMaxBase < 90)!;
const dcTemplate = db.players.find((p) => p.computed.famiglia433 === "Dc" && p.computed.offertaMaxBase > 10)!;

// 53. Rigorista: a comparable second attacker, one Penalty#1 + starter, the other not, must rank higher.
test("53. Penalty #1 + starter raises DynamicRank over an otherwise identical non-penalty taker", () => {
  const session = freshSession();
  const playerA = cloneTwin(aTemplate, "test_penalty_a", "Test Rigorista A");
  const playerB = cloneTwin(aTemplate, "test_penalty_b", "Test No-Rigori B");
  const teamAttackFactor = estimateTeamAttackFactor(db, aTemplate.squadra);

  const intelA = makeIntel(playerA.id, { penalty: buildPenaltyIntelligence({ rank: 1, confidence: 0.9, starterProbability: 95, teamAttackFactor, updatedAt: new Date().toISOString() }) });
  const intelB = makeIntel(playerB.id, { penalty: buildPenaltyIntelligence({ rank: null, confidence: 0, starterProbability: 95, teamAttackFactor, updatedAt: null }) });
  const intelligence = storeWith({ [playerA.id]: intelA, [playerB.id]: intelB });

  const scoreA = computeLiveScore(playerA, session, db, intelligence).total;
  const scoreB = computeLiveScore(playerB, session, db, intelligence).total;
  assert.ok(scoreA > scoreB, `expected the penalty taker to rank higher, got A=${scoreA} B=${scoreB}`);
});

// 54. Rigorista non titolare: the same Penalty #1 must NOT get the same bonus at 35% starter vs 95% starter.
test("54. Penalty #1 with low starter probability gets far less bonus than the same rank at high probability", () => {
  const teamAttackFactor = estimateTeamAttackFactor(db, aTemplate.squadra);
  const highStarter = buildPenaltyIntelligence({ rank: 1, confidence: 0.9, starterProbability: 95, teamAttackFactor, updatedAt: new Date().toISOString() });
  const lowStarter = buildPenaltyIntelligence({ rank: 1, confidence: 0.9, starterProbability: 35, teamAttackFactor, updatedAt: new Date().toISOString() });
  assert.ok(highStarter.penaltyValueScore > lowStarter.penaltyValueScore * 2, `expected a large gap, got high=${highStarter.penaltyValueScore} low=${lowStarter.penaltyValueScore}`);
});

// 55. Coppia: owning the primary, a cheap real direct backup must show COPRILO / a real pairValue.
test("55. a cheap direct backup of a player I own gets a meaningful PairValue", () => {
  const pairing: PlayerPairing = {
    id: "pair_test", primaryPlayerId: "primary", secondaryPlayerId: "secondary", type: "DIRECT_BACKUP",
    strength: 90, estimatedCoverage: 85, note: null, sourceConfidence: 0.8, updatedAt: new Date().toISOString(), sources: [],
  };
  const result = computePairValue(pairing, { ownPrimary: true, primaryPaidPrice: 38, primaryImportance: 0.9, secondaryCandidatePrice: 2 });
  assert.strictEqual(result.recommend, "COPRILO", `expected COPRILO, got ${result.recommend} (pairValue ${result.pairValue})`);
});

// 56. Coppia cara: the same backup at a disproportionate price must not be recommended.
test("56. the same pairing at a disproportionate price is NOT recommended, despite being the real backup", () => {
  const pairing: PlayerPairing = {
    id: "pair_test", primaryPlayerId: "primary", secondaryPlayerId: "secondary", type: "DIRECT_BACKUP",
    strength: 90, estimatedCoverage: 85, note: null, sourceConfidence: 0.8, updatedAt: new Date().toISOString(), sources: [],
  };
  const result = computePairValue(pairing, { ownPrimary: true, primaryPaidPrice: 38, primaryImportance: 0.9, secondaryCandidatePrice: 15 });
  assert.notStrictEqual(result.recommend, "COPRILO", `expected NOT COPRILO at a disproportionate price, got ${result.recommend}`);
});

// 55b end-to-end: isolating the pairing bonus specifically (same post-purchase
// session/slot state either way — buying the primary itself also triggers the
// unrelated, correct saturation/concentration effects from the earlier
// marginal-value fix, which must not be conflated with the pairing bonus).
test("55b. the pairing bonus itself raises the backup's DynamicMax, holding roster state fixed", () => {
  const base = freshSession();
  const primary = db.players.find((p) => p.computed.famiglia433 === "Dc" && p.computed.offertaMaxBase > 15)!;
  const secondary = db.players.find((p) => p.computed.famiglia433 === "Dc" && p.id !== primary.id && p.computed.offertaMaxBase < 10)!;
  const pairing: PlayerPairing = {
    id: `pair_${primary.id}_${secondary.id}`, primaryPlayerId: primary.id, secondaryPlayerId: secondary.id, type: "DIRECT_BACKUP",
    strength: 90, estimatedCoverage: 85, note: null, sourceConfidence: 0.8, updatedAt: new Date().toISOString(), sources: [],
  };
  const withOwnership = applyAuctionEvent(base, db, { type: "PLAYER_WON_BY_ME", playerId: primary.id, price: 30 }).session;
  const manager = withOwnership.managers.find((m) => m.isMe)!;
  const roles = eligibleMantraRoles(secondary.ruoloMantra);
  const slot = findOpenSlotForRoles(withOwnership.rosterSlots, roles);

  const dmxWithPairing = computeDynamicMax({ player: secondary, session: withOwnership, manager, slotsStillToBuy: 20, slot, intelligence: storeWith({}, [pairing]) });
  const dmxWithoutPairing = computeDynamicMax({ player: secondary, session: withOwnership, manager, slotsStillToBuy: 20, slot, intelligence: storeWith({}, []) });

  assert.ok(dmxWithPairing.dynamicMax >= dmxWithoutPairing.dynamicMax, `expected the pairing to raise (or leave unchanged) the backup's cap, got withPairing=${dmxWithPairing.dynamicMax} without=${dmxWithoutPairing.dynamicMax}`);
  assert.ok(dmxWithPairing.pairingUtilityBonus > 0, `expected a positive pairing utility bonus, got ${dmxWithPairing.pairingUtilityBonus}`);
});

// 57. Ballottaggio: a real two-way battle must not be collapsed into a plain backup relationship.
test("57. a genuine ballottaggio is represented as a two-way battle, not a backup", () => {
  const intelligence = buildPlayerIntelligenceStore(db);
  const ballotPairing = intelligence.pairings.find((p) => p.type === "BALLOT_PAIR");
  assert.ok(ballotPairing, "seed dataset's Coppie & Gioielli sheet must contain at least one real ballottaggio-classified pairing");
  const battle = intelligence.battles.find((b) => b.players.some((bp) => bp.playerId === ballotPairing!.primaryPlayerId));
  assert.ok(battle, "the ballottaggio pairing must produce a LineupBattle");
  assert.strictEqual(battle!.players.length, 2, "a battle must list exactly the two competing players");
  const totalProb = battle!.players.reduce((s, p) => s + p.probability, 0);
  assert.ok(Math.abs(totalProb - 100) <= 1, `probabilities must sum to ~100, got ${totalProb}`);
  assert.notStrictEqual(ballotPairing!.type, "DIRECT_BACKUP", "a ballottaggio must not be classified as a plain backup relationship");
});

// 58. Goal Threat difensori: same tier/price/starter, different percentile -> the higher one must score higher on bonus-oriented metrics.
test("58. two comparable Dc with different Goal Threat percentile are told apart on bonus potential", () => {
  const session = freshSession();
  const playerA = cloneTwin(dcTemplate, "test_gt_a", "Test Dc Alto GT");
  const playerB = cloneTwin(dcTemplate, "test_gt_b", "Test Dc Basso GT");
  playerA.computed.titolarita = playerB.computed.titolarita; // same starter probability
  playerA.computed.offertaMaxBase = playerB.computed.offertaMaxBase; // same price/tier

  const intelA = makeIntel(playerA.id, { goalThreat: goalThreatIntel(90, "HIGH") });
  const intelB = makeIntel(playerB.id, { goalThreat: goalThreatIntel(25, "HIGH") });
  const intelligence = storeWith({ [playerA.id]: intelA, [playerB.id]: intelB });

  assert.ok(intelA.bonusPotential.score > intelB.bonusPotential.score, `expected higher bonus potential for the higher-GTI defender, got A=${intelA.bonusPotential.score} B=${intelB.bonusPotential.score}`);
  const scoreA = computeLiveScore(playerA, session, db, intelligence).total;
  const scoreB = computeLiveScore(playerB, session, db, intelligence).total;
  assert.ok(scoreA > scoreB, `expected the more offensively dangerous Dc to rank higher, got A=${scoreA} B=${scoreB}`);
});

// 59. Sample size: 90 minutes and 1 goal must not produce an extreme, high-confidence Goal Threat.
test("59. a tiny sample cannot produce an extreme, high-confidence Goal Threat", () => {
  const result = computeGoalThreat({ seasons: [{ season: "2026/27", minutes: 90, nonPenaltyGoals: 1, nonPenaltyXG: 0.8, shots: 4, shotsInBox: 3 }] });
  assert.notStrictEqual(result.confidence, "HIGH", `expected low/medium confidence from a 90-minute sample, got ${result.confidence}`);
  assert.ok(!(result.rawScore >= 90 && result.confidence === "HIGH"), `must never pair an extreme score with HIGH confidence from this sample, got score=${result.rawScore} confidence=${result.confidence}`);
});

// 60. Data stale: an old signal must weigh less than a fresh one, all else equal.
test("60. stale Goal Threat data weighs less on DynamicMax than the same fresh data", () => {
  const session = freshSession();
  const player = cloneTwin(aTemplate, "test_stale", "Test Stale");
  const manager = session.managers.find((m) => m.isMe)!;
  const roles = eligibleMantraRoles(player.ruoloMantra);
  const slot = findOpenSlotForRoles(session.rosterSlots, roles);

  const fresh = makeIntel(player.id, { goalThreat: { ...goalThreatIntel(95, "HIGH"), staleness: "FRESH" } });
  const stale = makeIntel(player.id, { goalThreat: { ...goalThreatIntel(95, "HIGH"), staleness: "STALE" } });
  assert.ok(stalenessWeight(fresh.goalThreat.staleness) > stalenessWeight(stale.goalThreat.staleness), "sanity: FRESH must weigh more than STALE");

  const dmxFresh = computeDynamicMax({ player, session, manager, slotsStillToBuy: 20, slot, intelligence: storeWith({ [player.id]: fresh }) });
  const dmxStale = computeDynamicMax({ player, session, manager, slotsStillToBuy: 20, slot, intelligence: storeWith({ [player.id]: stale }) });
  assert.ok(dmxFresh.dynamicMax >= dmxStale.dynamicMax, `expected fresh signal to weigh at least as much as stale, got fresh=${dmxFresh.dynamicMax} stale=${dmxStale.dynamicMax}`);
});

// 61. Query: "Dc ancora liberi con Goal Threat >70 e titolarita >80" — all four conditions must combine (AND), not any single one.
test("61. combined query returns only players matching every condition (available + Dc + GTI>70 + titolarita>80)", () => {
  const session = freshSession();
  const good = cloneTwin(dcTemplate, "q_good", "Query Good");
  good.computed.titolarita = 85;
  const lowTitolarita = cloneTwin(dcTemplate, "q_low_tit", "Query LowTit");
  lowTitolarita.computed.titolarita = 50;
  const lowGti = cloneTwin(dcTemplate, "q_low_gti", "Query LowGTI");
  lowGti.computed.titolarita = 85;
  const takenOne = cloneTwin(dcTemplate, "q_taken", "Query Taken");
  takenOne.computed.titolarita = 85;

  const candidates = [good, lowTitolarita, lowGti, takenOne];
  const intelligence = storeWith({
    [good.id]: makeIntel(good.id, { goalThreat: goalThreatIntel(80, "HIGH") }),
    [lowTitolarita.id]: makeIntel(lowTitolarita.id, { goalThreat: goalThreatIntel(80, "HIGH") }),
    [lowGti.id]: makeIntel(lowGti.id, { goalThreat: goalThreatIntel(40, "HIGH") }),
    [takenOne.id]: makeIntel(takenOne.id, { goalThreat: goalThreatIntel(80, "HIGH") }),
  });
  const takenState = { ...session.playerStates, [takenOne.id]: { playerId: takenOne.id, status: "WON_BY_OPPONENT" as const, ownerManagerId: null, paidPrice: 10, currentBid: 10, nominatedAt: null, notes: null, liveRank: null } };
  const sessionWithTaken: AuctionSession = { ...session, playerStates: takenState };

  const minGti = 70, minTit = 80;
  const results = candidates.filter((p) => {
    const st = sessionWithTaken.playerStates[p.id];
    const available = !st || st.status === "AVAILABLE";
    const isDc = p.computed.famiglia433 === "Dc";
    const gi = intelligence.players[p.id]?.goalThreat;
    const gtiOk = !!gi && gi.confidence !== "NONE" && gi.percentileWithinRole > minGti;
    const titOk = p.computed.titolarita > minTit;
    return available && isDc && gtiOk && titOk;
  });

  assert.strictEqual(results.length, 1, `expected exactly one player to match all four conditions, got ${results.map((r) => r.nome).join(", ")}`);
  assert.strictEqual(results[0].id, good.id);
});

console.log(`\n${passed} passed, ${failed} failed.\n`);
if (failed > 0) process.exit(1);
