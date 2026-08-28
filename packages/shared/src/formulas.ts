import type { Famiglia433, Fascia, PlayerComputed, TierEconomico, WalkAwayCapRow } from "./types";

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function round0(v: number): number {
  return Math.round(v);
}

// -------------------- Section 7: Titolarità --------------------
export function computeTitolarita(hTitBase: number, hTitAdj: number): number {
  return clamp(hTitBase + hTitAdj, 0, 99);
}

export function classeTit(titolarita: number): PlayerComputed["classeTit"] {
  if (titolarita >= 80) return "Alta";
  if (titolarita >= 60) return "Medio-alta";
  if (titolarita >= 40) return "Media";
  if (titolarita >= 20) return "Bassa";
  return "Minima";
}

// -------------------- Section 8: Indice Fanta --------------------
export function countRoles(ruoloMantra: string): number {
  return (ruoloMantra.match(/\//g)?.length ?? 0) + 1;
}

export function computeIndiceFanta(params: {
  hSOSScore: number;
  hFVMpct: number;
  titolarita: number;
  hPerf: number;
  quot: number;
  ruoloMantra: string;
  fuoriLista: boolean;
}): number {
  const { hSOSScore, hFVMpct, titolarita, hPerf, quot, ruoloMantra, fuoriLista } = params;
  let base: number;
  if (hSOSScore > 0) {
    base = 0.5 * hSOSScore + 0.25 * hFVMpct + 0.2 * titolarita + 0.05 * hPerf;
  } else {
    base = 0.55 * hFVMpct + 0.32 * titolarita + 0.08 * hPerf + 0.05 * Math.min(100, quot * 4);
  }
  const numeroRuoli = countRoles(ruoloMantra);
  const bonus = Math.min(6, (numeroRuoli - 1) * 2.5);
  const penalita = fuoriLista ? 3 : 0;
  return clamp(round0(base + bonus - penalita), 5, 99);
}

// -------------------- Section 9: Indice Affare --------------------
export function computeIndiceAffare(indiceFanta: number, titolarita: number, hFVMpct: number): number {
  const v = 50 + 0.65 * (indiceFanta - 50) + 0.2 * (titolarita - 60) - 0.55 * (hFVMpct - 50);
  return clamp(round0(v), 5, 99);
}

// -------------------- Section 10: Fascia --------------------
export function computeFascia(indiceFanta: number): Fascia {
  if (indiceFanta >= 90) return "S";
  if (indiceFanta >= 80) return "A";
  if (indiceFanta >= 70) return "B";
  if (indiceFanta >= 60) return "C";
  if (indiceFanta >= 48) return "D";
  return "E";
}

// -------------------- "Mia mossa" (Lista calciatori formula) --------------------
export function computeMiaMossa(indiceFanta: number, titolarita: number, indiceAffare: number): string {
  if (indiceFanta >= 90 && titolarita >= 62) return "PUNTA FORTE";
  if (indiceFanta >= 80 && titolarita >= 58) return "COMPRA";
  if (indiceAffare >= 75 && indiceFanta >= 62 && titolarita >= 55) return "AFFARE / ATTACCA";
  if (indiceFanta >= 69 && titolarita >= 50) return "AL GIUSTO PREZZO";
  if (indiceFanta >= 58 && titolarita >= 40) return "JOLLY / SCOMMESSA";
  if (indiceFanta >= 45) return "SOLO LOW COST";
  return "EVITA";
}

// -------------------- Section 11: Famiglia 4-3-3 --------------------
function hasToken(ruoloMantra: string, token: string): boolean {
  return `/${ruoloMantra}/`.includes(`/${token}/`);
}

export function computeFamiglia433(ruoloMantra: string): Famiglia433 {
  if (ruoloMantra === "Por") return "Por";
  if (hasToken(ruoloMantra, "Pc")) return "Pc";
  if (hasToken(ruoloMantra, "A")) return "A";
  if (hasToken(ruoloMantra, "M")) return "M";
  if (hasToken(ruoloMantra, "C")) return "C";
  if (hasToken(ruoloMantra, "Dd")) return "Dd";
  if (hasToken(ruoloMantra, "Ds")) return "Ds";
  if (hasToken(ruoloMantra, "Dc")) return "Dc";
  if (["E", "W", "T", "B"].some((t) => hasToken(ruoloMantra, t))) return "Jolly";
  return "Non433";
}

// -------------------- Section 12: Tier economico --------------------
export function computeTierGruppo(tierSOS: string, titolarita: number): TierEconomico {
  const t = (tierSOS || "").toUpperCase();
  if (t === "SUPER TOP" || t === "TOP") return "Top";
  if (t === "SEMITOP") return "Semitop";
  if (t.includes("POSSIBILI SORPRESE") || t.includes("SCOMMES")) return "Scommessa";
  if (t.includes("FASCIA ALTA") || t.includes("JOLLY 1") || titolarita >= 85) return "Starter";
  if (titolarita >= 68) return "Scommessa";
  return "Low";
}

// -------------------- Section 13: Fattore rischio --------------------
export function computeFattoreRischio(titolarita: number, rischio: string, fuoriLista: boolean): number {
  let f = titolarita >= 90 ? 1.0 : titolarita >= 80 ? 0.93 : titolarita >= 65 ? 0.85 : 0.72;
  const r = (rischio || "").toUpperCase();
  if (r.includes("MERCATO")) f *= 0.85;
  if (r.includes("INFORTUN")) f *= 0.9;
  if (fuoriLista) f *= 0.55;
  return f;
}

// -------------------- Section 16: Prezzo atteso --------------------
export function fattoreTier(tierSOS: string, tierGruppo: TierEconomico): number {
  if ((tierSOS || "").toUpperCase().includes("SUPER TOP")) return 1.08;
  switch (tierGruppo) {
    case "Top": return 1.04;
    case "Semitop": return 1.0;
    case "Starter": return 0.94;
    case "Scommessa": return 0.9;
    case "Low": return 0.85;
  }
}

export function computePrezzoAtteso(
  quot: number,
  moltiplicatoreLega: number,
  fattoreRischio: number,
  fattoreTierVal: number
): number {
  return Math.max(1, round0(quot * moltiplicatoreLega * fattoreRischio * fattoreTierVal));
}

// -------------------- Section 14/15: moltiplicatori & walk-away cap --------------------
export const MOLTIPLICATORI_LEGA_DEFAULT: Record<Famiglia433, number> = {
  Por: 3.0, Dd: 2.3, Ds: 2.3, Dc: 1.45, Jolly: 1.55, A: 2.7, C: 1.7, M: 1.3, Pc: 4.7, Non433: 0.9,
};

export const WALK_AWAY_CAP_DEFAULT: Record<Famiglia433, WalkAwayCapRow> = {
  Por: { top: 60, semitop: 45, starter: 30, scommessa: 15, low: 6 },
  Dd: { top: 40, semitop: 28, starter: 15, scommessa: 8, low: 4 },
  Ds: { top: 40, semitop: 28, starter: 15, scommessa: 8, low: 4 },
  Dc: { top: 23, semitop: 15, starter: 8, scommessa: 5, low: 3 },
  Jolly: { top: 45, semitop: 30, starter: 18, scommessa: 10, low: 5 },
  A: { top: 85, semitop: 60, starter: 40, scommessa: 22, low: 10 },
  C: { top: 50, semitop: 35, starter: 24, scommessa: 14, low: 8 },
  M: { top: 38, semitop: 28, starter: 20, scommessa: 12, low: 7 },
  Pc: { top: 160, semitop: 110, starter: 75, scommessa: 40, low: 20 },
  Non433: { top: 8, semitop: 6, starter: 4, scommessa: 3, low: 2 },
};

function capKeyForTier(tier: TierEconomico): keyof WalkAwayCapRow {
  switch (tier) {
    case "Top": return "top";
    case "Semitop": return "semitop";
    case "Starter": return "starter";
    case "Scommessa": return "scommessa";
    case "Low": return "low";
  }
}

export function computeWalkAwayCap(
  famiglia: Famiglia433,
  tierGruppo: TierEconomico,
  tierSOS: string,
  capMatrix: Record<Famiglia433, WalkAwayCapRow> = WALK_AWAY_CAP_DEFAULT
): number {
  const row = capMatrix[famiglia] ?? WALK_AWAY_CAP_DEFAULT.Non433;
  let cap = row[capKeyForTier(tierGruppo)];
  if ((tierSOS || "").toUpperCase().includes("SUPER TOP") && (famiglia === "Por" || famiglia === "Pc")) {
    cap *= 1.08;
  }
  return cap;
}

// -------------------- Section 17: Offerta massima base (red line) --------------------
export function computeOffertaMaxBase(walkAwayCap: number, prezzoAtteso: number): number {
  return Math.max(1, Math.min(walkAwayCap, round0(prezzoAtteso * 1.06)));
}

// -------------------- Section 18: Prezzo obiettivo --------------------
export function computePrezzoObiettivo(
  offertaMaxBase: number,
  famiglia: Famiglia433,
  tierGruppo: TierEconomico
): number {
  let ratio: number;
  if (famiglia === "Pc" && tierGruppo === "Top") ratio = 0.95;
  else if ((famiglia === "A" || famiglia === "Por" || famiglia === "Dc") && tierGruppo === "Top") ratio = 0.9;
  else ratio = 0.85;
  return Math.max(1, round0(offertaMaxBase * ratio));
}

// -------------------- Fit 4-3-3 & Strategia 4-3-3 (Lista calciatori formulas) --------------------
export function computeFit433(famiglia: Famiglia433): PlayerComputed["fit433"] {
  if (famiglia === "Non433") return "BASSO";
  if (famiglia === "A" || famiglia === "Pc") return "ALTISSIMO";
  if (famiglia === "M" || famiglia === "C" || famiglia === "Jolly") return "ALTO";
  if (famiglia === "Dd" || famiglia === "Ds") return "MEDIO-ALTO";
  return "MEDIO";
}

export function computeStrategia433(params: {
  fuoriLista: boolean;
  famiglia: Famiglia433;
  tierGruppo: TierEconomico;
  prezzoObiettivo: number;
  titolarita: number;
}): string {
  const { fuoriLista, famiglia, tierGruppo, prezzoObiettivo, titolarita } = params;
  if (fuoriLista) return "EVITA - FUORI LISTA";
  if (famiglia === "Non433") return "NON PRIORITARIO 4-3-3";
  if ((famiglia === "Pc" || famiglia === "A") && tierGruppo === "Top") return "ALL-IN CONTROLLATO";
  if (prezzoObiettivo <= 8 && titolarita >= 80) return "GIOIELLO / TITOLARE LOW COST";
  if (tierGruppo === "Top" || tierGruppo === "Semitop") return "COMPRA A VALORE";
  if (titolarita >= 80) return "TITOLARE DA ASPETTARE";
  return "SOLO LOW COST";
}

// -------------------- Section 36: Gem score --------------------
export function computeGemScore(params: {
  titolarita: number;
  prezzoObiettivo: number;
  tierSOS: string;
  ruoloMantra: string;
  famiglia: Famiglia433;
  versatilita: number;
}): number {
  const { titolarita, prezzoObiettivo, tierSOS, versatilita } = params;
  let score = 0;
  score += titolarita * 0.4; // up to 39.6
  score += Math.max(0, 20 - prezzoObiettivo) * 1.5; // cheap => up to 30
  const t = (tierSOS || "").toUpperCase();
  if (t.includes("POSSIBILI SORPRESE") || t.includes("SCOMMES")) score += 15;
  if (t.includes("LOW COST")) score += 8;
  score += Math.min(10, (versatilita - 1) * 5);
  return round0(clamp(score, 0, 100));
}

// -------------------- Full pipeline: compute all derived fields for a player --------------------
export interface ComputeInputs {
  hTitBase: number;
  hTitAdj: number;
  hSOSScore: number;
  hFVMpct: number;
  hPerf: number;
  quot: number;
  ruoloMantra: string;
  fuoriLista: boolean;
  rischio: string;
  tierSOS: string;
  versatilita: number;
  moltiplicatoreLega?: Record<Famiglia433, number>;
  walkAwayCapMatrix?: Record<Famiglia433, WalkAwayCapRow>;
}

export function computeAllDerived(inputs: ComputeInputs): PlayerComputed {
  const titolarita = computeTitolarita(inputs.hTitBase, inputs.hTitAdj);
  const indiceFanta = computeIndiceFanta({
    hSOSScore: inputs.hSOSScore,
    hFVMpct: inputs.hFVMpct,
    titolarita,
    hPerf: inputs.hPerf,
    quot: inputs.quot,
    ruoloMantra: inputs.ruoloMantra,
    fuoriLista: inputs.fuoriLista,
  });
  const indiceAffare = computeIndiceAffare(indiceFanta, titolarita, inputs.hFVMpct);
  const fascia = computeFascia(indiceFanta);
  const miaMossa = computeMiaMossa(indiceFanta, titolarita, indiceAffare);
  const famiglia433 = computeFamiglia433(inputs.ruoloMantra);
  const tierGruppo = computeTierGruppo(inputs.tierSOS, titolarita);
  const fattoreRischio = computeFattoreRischio(titolarita, inputs.rischio, inputs.fuoriLista);
  const moltiplicatoreAstaStorico =
    (inputs.moltiplicatoreLega ?? MOLTIPLICATORI_LEGA_DEFAULT)[famiglia433] ?? 0.9;
  const fTier = fattoreTier(inputs.tierSOS, tierGruppo);
  const prezzoAtteso = computePrezzoAtteso(inputs.quot, moltiplicatoreAstaStorico, fattoreRischio, fTier);
  const walkAwayCapRuolo = computeWalkAwayCap(
    famiglia433,
    tierGruppo,
    inputs.tierSOS,
    inputs.walkAwayCapMatrix ?? WALK_AWAY_CAP_DEFAULT
  );
  const offertaMaxBase = computeOffertaMaxBase(walkAwayCapRuolo, prezzoAtteso);
  const prezzoObiettivo = computePrezzoObiettivo(offertaMaxBase, famiglia433, tierGruppo);
  const fit433 = computeFit433(famiglia433);
  const strategia433 = computeStrategia433({
    fuoriLista: inputs.fuoriLista,
    famiglia: famiglia433,
    tierGruppo,
    prezzoObiettivo,
    titolarita,
  });
  const classe = classeTit(titolarita);
  const gemScore = computeGemScore({
    titolarita,
    prezzoObiettivo,
    tierSOS: inputs.tierSOS,
    ruoloMantra: inputs.ruoloMantra,
    famiglia: famiglia433,
    versatilita: inputs.versatilita,
  });

  return {
    titolarita,
    classeTit: classe,
    indiceFanta,
    indiceAffare,
    fascia,
    miaMossa,
    famiglia433,
    tierGruppo,
    fattoreRischio,
    moltiplicatoreAstaStorico,
    prezzoAtteso,
    fit433,
    strategia433,
    walkAwayCapRuolo,
    offertaMaxBase,
    prezzoObiettivo,
    gemScore,
  };
}
