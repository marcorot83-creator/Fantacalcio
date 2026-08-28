import * as XLSX from "xlsx";
import path from "path";
import fs from "fs";
import {
  type CoppiaEntry, type DatasetMeta, type Famiglia433, type FinancingRule, type GioielloEntry,
  type GraduatoriaEntry, type PacchettoPortieri, type Player, type PlayerDatabase, type SlotPlanItem,
  type StrategyConfig, type WalkAwayCapRow,
  computeAllDerived, playerStableId, normalizeName, MOLTIPLICATORI_LEGA_DEFAULT, WALK_AWAY_CAP_DEFAULT,
  DEFAULT_SLOT_PLAN, DEFAULT_FINANCING_RULES,
} from "@fanta/shared";

type Row = (string | number | boolean | null | undefined)[];

function sheetToRows(wb: XLSX.WorkBook, name: string): Row[] {
  const ws = wb.Sheets[name];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json<Row>(ws, { header: 1, raw: true, defval: null });
}

function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}
function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------------
// Lista calciatori -> Player[]
// ---------------------------------------------------------------------------
function parseListaCalciatori(wb: XLSX.WorkBook, config: { moltiplicatoreLega: Record<Famiglia433, number>; walkAwayCap: Record<Famiglia433, WalkAwayCapRow> }): Player[] {
  const rows = sheetToRows(wb, "Lista calciatori");
  const players: Player[] = [];
  const seenIds = new Map<string, number>();

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !r[1]) continue; // col B = Nome
    const nome = str(r[1]);
    const squadra = str(r[3]);
    if (!nome) continue;

    let id = playerStableId(nome, squadra);
    const dupCount = seenIds.get(id) ?? 0;
    seenIds.set(id, dupCount + 1);
    if (dupCount > 0) id = `${id}#${dupCount}`;

    const ruoloMantra = str(r[6]) || str(r[5]) || "Non433";
    const fuoriLista = str(r[2]) === "*";
    const versatilita = num(r[22]) ?? (ruoloMantra.match(/\//g)?.length ?? 0) + 1;
    const rischio = str(r[21]);
    const tierSOS = str(r[23]);
    const quot = num(r[11]) ?? 1;

    const hTitBase = num(r[32]) ?? 0;
    const hTitAdj = num(r[33]) ?? 0;
    const hSOSScore = num(r[34]) ?? 0;
    const hFVMpct = num(r[35]) ?? 0;
    const hPerf = num(r[36]) ?? 0;

    const computed = computeAllDerived({
      hTitBase, hTitAdj, hSOSScore, hFVMpct, hPerf, quot, ruoloMantra, fuoriLista, rischio, tierSOS, versatilita,
      moltiplicatoreLega: config.moltiplicatoreLega, walkAwayCapMatrix: config.walkAwayCap,
    });

    players.push({
      id,
      excelRowId: num(r[0]),
      nome,
      nomeNormalizzato: normalizeName(nome),
      fuoriLista,
      squadra,
      under: num(r[4]),
      ruolo: str(r[5]),
      ruoloMantra,
      pgv: num(r[7]),
      mv: num(r[8]),
      fm: num(r[9]),
      fvm500: num(r[10]),
      quot,
      priorita: num(r[20]),
      rischio,
      versatilita,
      tierSOS,
      affidabilita: str(r[24]),
      motivoSintetico: str(r[25]),
      fontiTitolarita: str(r[26]),
      fontiMantra: str(r[27]),
      fontiUpdate: str(r[28]),
      hTitBase, hTitAdj, hSOSScore, hFVMpct, hPerf,
      hSeasonMatch: num(r[37]) ?? 0, hSOSMatch: num(r[38]) ?? 0, hCurrentMatch: num(r[39]) ?? 0,
      computed,
    });
  }
  return players;
}

function findPlayerId(players: Player[], nome: string, squadra?: string): string | null {
  const n = normalizeName(nome);
  if (!n) return null;
  const candidates = players.filter((p) => p.nomeNormalizzato === n);
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0].id;
  if (squadra) {
    const bySquad = candidates.find((p) => normalizeName(p.squadra) === normalizeName(squadra));
    if (bySquad) return bySquad.id;
  }
  return candidates[0].id;
}

// ---------------------------------------------------------------------------
// Graduatorie 433
// ---------------------------------------------------------------------------
const FAMILY_LABELS: Record<string, Famiglia433> = {
  dd: "Dd", ds: "Ds", dc: "Dc", jolly: "Jolly", a: "A", c: "C", m: "M", pc: "Pc", por: "Por",
};

function parseGraduatorie(wb: XLSX.WorkBook, players: Player[]): GraduatoriaEntry[] {
  const rows = sheetToRows(wb, "Graduatorie 433");
  const entries: GraduatoriaEntry[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const famRaw = str(r[0]).toLowerCase();
    const fam = FAMILY_LABELS[famRaw];
    const rank = num(r[1]);
    const nome = str(r[2]);
    if (!fam || rank == null || !nome) continue;
    const squadra = str(r[3]);
    entries.push({
      famiglia: fam,
      rank,
      nome,
      playerId: findPlayerId(players, nome, squadra),
      squadra,
      ruoloMantra: str(r[4]),
      profiloAsta: str(r[5]),
      tierSOS: str(r[6]),
      titolarita: num(r[7]),
      coppiaCopertura: str(r[14]) || null,
      strategia: null, // derived live from Player.computed.strategia433
      rischio: str(r[16]),
      motivazione: str(r[17]),
      fonte: str(r[18]),
    });
  }
  return entries;
}

// ---------------------------------------------------------------------------
// Coppie & Gioielli
// ---------------------------------------------------------------------------
function findHeaderRow(rows: Row[], firstColMarker: string): number {
  return rows.findIndex((r) => str(r?.[0]).toLowerCase() === firstColMarker.toLowerCase());
}

function parseCoppie(wb: XLSX.WorkBook, players: Player[]): CoppiaEntry[] {
  const rows = sheetToRows(wb, "Coppie & Gioielli");
  const headerIdx = findHeaderRow(rows, "Priorita");
  if (headerIdx < 0) return [];
  const out: CoppiaEntry[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !str(r[0])) break; // blank row ends the table
    const titolare = str(r[2]);
    const copertura = str(r[4]);
    const budget = str(r[7]);
    const [minB, maxB] = budget.split("-").map((x) => num(x.trim()));
    out.push({
      priorita: str(r[0]),
      squadra: str(r[1]),
      titolare,
      titolarePlayerId: findPlayerId(players, titolare, str(r[1])),
      ruoloTitolare: str(r[3]),
      copertura,
      coperturaPlayerId: findPlayerId(players, copertura, str(r[1])),
      ruoloCopertura: str(r[5]),
      tipo: str(r[6]),
      budgetIndicativoMin: minB ?? 0,
      budgetIndicativoMax: maxB ?? minB ?? 0,
      nota: str(r[8]),
      fonte: str(r[9]),
    });
  }
  return out;
}

function parsePacchettiPortieri(wb: XLSX.WorkBook, players: Player[]): PacchettoPortieri[] {
  const rows = sheetToRows(wb, "Coppie & Gioielli");
  const headerIdx = findHeaderRow(rows, "Rank");
  if (headerIdx < 0) return [];
  const out: PacchettoPortieri[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r[0] == null) break;
    const titolare = str(r[2]);
    out.push({
      rank: num(r[0]) ?? 0,
      squadra: str(r[1]),
      titolare,
      titolarePlayerId: findPlayerId(players, titolare, str(r[1])),
      riserve: str(r[3]),
      capPacchetto: num(r[4]) ?? 0,
      target: num(r[5]),
      qualita: str(r[6]),
      mossa: str(r[7]),
      nota: str(r[8]),
    });
  }
  return out;
}

function parseGioielli(wb: XLSX.WorkBook, players: Player[]): GioielloEntry[] {
  const rows = sheetToRows(wb, "Coppie & Gioielli");
  let headerIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    if (str(rows[i]?.[0]).toLowerCase() === "ruolo" && str(rows[i]?.[1]).toLowerCase() === "nome") {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) return [];
  const out: GioielloEntry[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !str(r[1])) continue;
    const nome = str(r[1]);
    const squadra = str(r[2]);
    out.push({
      ruolo: str(r[0]),
      nome,
      playerId: findPlayerId(players, nome, squadra),
      squadra,
      ruoloMantra: str(r[3]),
      tier: str(r[4]),
      titolarita: num(r[5]) ?? 0,
      prezzoObiettivo: num(r[6]) ?? 0,
      offertaMax: num(r[7]) ?? 0,
      motivazione: str(r[8]),
      fonte: str(r[9]),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Strategia 433 -> StrategyConfig
// ---------------------------------------------------------------------------
function parseStrategiaConfig(wb: XLSX.WorkBook): StrategyConfig {
  const rows = sheetToRows(wb, "Strategia 433");
  const cell = (r: number, c: number) => rows[r]?.[c];

  const budgetTotale = num(cell(4, 1)) ?? 500;
  const partecipanti = num(cell(5, 1)) ?? 12;
  const movimento = num(cell(6, 1)) ?? 25;
  const portieri = num(cell(7, 1)) ?? 3;

  const walkAwayCap = { ...WALK_AWAY_CAP_DEFAULT } as Record<Famiglia433, WalkAwayCapRow>;
  const budgetReparto: Record<Famiglia433, number> = { Por: 0, Dd: 0, Ds: 0, Dc: 0, Jolly: 0, A: 0, C: 0, M: 0, Pc: 0, Non433: 0 };
  const capHeaderIdx = findHeaderRow(rows, "Famiglia");
  if (capHeaderIdx >= 0) {
    for (let i = capHeaderIdx + 1; i < rows.length; i++) {
      const r = rows[i];
      const fam = FAMILY_LABELS[str(r?.[0]).toLowerCase()];
      if (!fam) { if (str(r?.[0])) continue; else break; }
      budgetReparto[fam] = num(r[1]) ?? 0;
      walkAwayCap[fam] = {
        top: num(r[3]) ?? walkAwayCap[fam].top,
        semitop: num(r[4]) ?? walkAwayCap[fam].semitop,
        starter: num(r[5]) ?? walkAwayCap[fam].starter,
        scommessa: num(r[6]) ?? walkAwayCap[fam].scommessa,
        low: num(r[7]) ?? walkAwayCap[fam].low,
      };
    }
  }

  const moltiplicatoreLega = { ...MOLTIPLICATORI_LEGA_DEFAULT } as Record<Famiglia433, number>;
  let moltHeaderIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    if (str(rows[i]?.[0]).toLowerCase() === "famiglia" && str(rows[i]?.[1]).toLowerCase().includes("moltiplicatore")) {
      moltHeaderIdx = i;
      break;
    }
  }
  if (moltHeaderIdx >= 0) {
    for (let i = moltHeaderIdx + 1; i < rows.length; i++) {
      const r = rows[i];
      const fam = FAMILY_LABELS[str(r?.[0]).toLowerCase()];
      if (!fam) break;
      moltiplicatoreLega[fam] = num(r[1]) ?? moltiplicatoreLega[fam];
    }
  }

  // Slot plan: columns E:H, header "Slot" in col E.
  const slotHeaderIdx = rows.findIndex((r) => str(r?.[4]).toLowerCase() === "slot");
  const slotPlan: SlotPlanItem[] = [];
  if (slotHeaderIdx >= 0) {
    for (let i = slotHeaderIdx + 1; i < rows.length; i++) {
      const r = rows[i];
      const slotLabel = str(r?.[4]);
      if (!slotLabel || slotLabel.toLowerCase().startsWith("totale")) break;
      const parts = slotLabel.split(/\s+/);
      const famLabel = FAMILY_LABELS[parts[0]?.toLowerCase()];
      if (!famLabel) continue;
      const slotKey = `${parts[0]}${parts[1] ?? ""}`;
      const defaultEntry = DEFAULT_SLOT_PLAN.find((d) => d.slotKey === slotKey);
      slotPlan.push({
        slotKey,
        famiglia: famLabel,
        profilo: str(r?.[5]),
        targetBudget: num(r?.[6]) ?? defaultEntry?.targetBudget ?? 1,
        regola: str(r?.[7]),
        protectPriority: defaultEntry?.protectPriority ?? 20,
      });
    }
  }
  const finalSlotPlan = slotPlan.length > 0 ? mergeSlotPlanWithKeeperDefaults(slotPlan) : DEFAULT_SLOT_PLAN;

  const financingRules: FinancingRule[] = [];
  const financingHeaderIdx = findHeaderRow(rows, "Evento");
  if (financingHeaderIdx >= 0) {
    for (let i = financingHeaderIdx + 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r || !str(r[0])) break;
      financingRules.push({
        evento: str(r[0]),
        extraVsTarget: num(r[1]) ?? 0,
        recuperoSuggerito: str(r[2]),
        principio: str(r[3]),
      });
    }
  }

  return {
    budgetTotale, partecipanti, movimento, portieri, slotComplessivi: movimento + portieri,
    walkAwayCap, moltiplicatoreLega, budgetReparto,
    slotPlan: finalSlotPlan,
    financingRules: financingRules.length ? financingRules : DEFAULT_FINANCING_RULES,
    pacchettiPortieri: [],
  };
}

function mergeSlotPlanWithKeeperDefaults(movementPlan: SlotPlanItem[]): SlotPlanItem[] {
  const porDefaults = DEFAULT_SLOT_PLAN.filter((s) => s.famiglia === "Por");
  return [...movementPlan, ...porDefaults];
}

// ---------------------------------------------------------------------------
// Fonti & Metodo -> freshness
// ---------------------------------------------------------------------------
function parseMeta(wb: XLSX.WorkBook, sourceFileName: string, playerCount: number): DatasetMeta {
  const rows = sheetToRows(wb, "Fonti & Metodo");
  let freshnessDate = "";
  let marketCloseDate = "";
  for (const r of rows) {
    const label = str(r?.[0]).toLowerCase();
    if (label.includes("titolarita") && label.includes("mercato")) {
      const m = str(r?.[1]).match(/\d{2}\/\d{2}\/\d{4}/);
      if (m) freshnessDate = m[0];
    }
    if (label.includes("chiusura mercato")) {
      marketCloseDate = str(r?.[1]);
    }
    if (!freshnessDate && label.startsWith("aggiornamento modello")) {
      const m = label.match(/\d{2}\/\d{2}\/\d{4}/);
      if (m) freshnessDate = m[0];
    }
  }
  return {
    importedAt: new Date().toISOString(),
    sourceFileName,
    freshnessDate: freshnessDate || "sconosciuta",
    marketCloseDate: marketCloseDate || "sconosciuta",
    playerCount,
  };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------
export function importExcelFile(filePath: string): PlayerDatabase {
  const buf = fs.readFileSync(filePath);
  const wb = XLSX.read(buf, { type: "buffer", cellFormula: false });

  const strategyConfig = parseStrategiaConfig(wb);
  const players = parseListaCalciatori(wb, {
    moltiplicatoreLega: strategyConfig.moltiplicatoreLega,
    walkAwayCap: strategyConfig.walkAwayCap,
  });
  const graduatorie = parseGraduatorie(wb, players);
  const coppie = parseCoppie(wb, players);
  const gioielli = parseGioielli(wb, players);
  strategyConfig.pacchettiPortieri = parsePacchettiPortieri(wb, players);
  const meta = parseMeta(wb, path.basename(filePath), players.length);

  return { meta, players, graduatorie, coppie, gioielli, strategyConfig };
}

if (require.main === module) {
  const target = process.argv[2] || path.join(__dirname, "..", "seed", "strumento_asta_mantra_2026_27.xlsx");
  const db = importExcelFile(target);
  const outPath = path.join(__dirname, "..", "seed", "player-database.json");
  fs.writeFileSync(outPath, JSON.stringify(db, null, 2));
  console.log(`Imported ${db.players.length} players, ${db.graduatorie.length} graduatoria entries, ${db.coppie.length} coppie, ${db.gioielli.length} gioielli.`);
  console.log(`Freshness: ${db.meta.freshnessDate}. Written to ${outPath}`);
}
