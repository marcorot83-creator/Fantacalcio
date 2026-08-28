import type { Famiglia433, FinancingRule, SlotPlanItem } from "./types";

/**
 * Canonical slot plan (section 4/21) with an added `protectPriority`
 * implementing the cut order from section 22:
 * lower number = protect first (cut last), higher number = cut first.
 */
export const DEFAULT_SLOT_PLAN: SlotPlanItem[] = [
  { slotKey: "Pc1", famiglia: "Pc", profilo: "BOMBER", targetBudget: 145, regola: "vero all-in: 130-150 realistico", protectPriority: 1 },
  { slotKey: "A1", famiglia: "A", profilo: "TOP", targetBudget: 65, regola: "strutturale per il 4-3-3; cap 85", protectPriority: 2 },
  { slotKey: "Por1", famiglia: "Por", profilo: "TITOLARE", targetBudget: 32, regola: "pacchetto portiere titolare", protectPriority: 3 },
  { slotKey: "C1", famiglia: "C", profilo: "TOP/SEMITOP", targetBudget: 28, regola: "offensivo / piazzati", protectPriority: 4 },
  { slotKey: "Dd1", famiglia: "Dd", profilo: "TOP", targetBudget: 18, regola: "se va a 30-40, finanzialo tagliando altrove", protectPriority: 5 },
  { slotKey: "Ds1", famiglia: "Ds", profilo: "TOP", targetBudget: 18, regola: "se va a 30-40, finanzialo tagliando altrove", protectPriority: 5 },
  { slotKey: "M1", famiglia: "M", profilo: "SEMITOP+", targetBudget: 16, regola: "minuti e voto", protectPriority: 6 },
  { slotKey: "M2", famiglia: "M", profilo: "SEMITOP", targetBudget: 14, regola: "titolare", protectPriority: 6 },
  { slotKey: "M3", famiglia: "M", profilo: "SEMITOP", targetBudget: 12, regola: "titolare / low value", protectPriority: 6 },
  { slotKey: "Dc1", famiglia: "Dc", profilo: "TOP", targetBudget: 20, regola: "cap reale 23", protectPriority: 7 },
  { slotKey: "Jolly1", famiglia: "Jolly", profilo: "TITOLARE", targetBudget: 4, regola: "versatile e titolare", protectPriority: 8 },
  { slotKey: "A2", famiglia: "A", profilo: "SEMITOP", targetBudget: 22, regola: "qui cerca il vero affare", protectPriority: 9 },
  { slotKey: "C2", famiglia: "C", profilo: "SEMITOP", targetBudget: 12, regola: "cerca bonus", protectPriority: 9 },
  { slotKey: "Por2", famiglia: "Por", profilo: "RISERVA", targetBudget: 13, regola: "pacchetto portiere riserva", protectPriority: 10 },
  { slotKey: "Dc2", famiglia: "Dc", profilo: "SEMITOP", targetBudget: 4, regola: "reparto profondo: aspetta", protectPriority: 10 },
  { slotKey: "Dd2", famiglia: "Dd", profilo: "TITOLARE", targetBudget: 4, regola: "90%+; cerca provincia", protectPriority: 10 },
  { slotKey: "Ds2", famiglia: "Ds", profilo: "TITOLARE", targetBudget: 4, regola: "90%+; cerca provincia", protectPriority: 10 },
  { slotKey: "Pc2", famiglia: "Pc", profilo: "VALUE", targetBudget: 27, regola: "non fare due all-in", protectPriority: 11 },
  { slotKey: "Dc3", famiglia: "Dc", profilo: "TITOLARE", targetBudget: 2, regola: "minuti prima del nome", protectPriority: 12 },
  { slotKey: "Dc4", famiglia: "Dc", profilo: "TITOLARE", targetBudget: 2, regola: "minuti prima del nome", protectPriority: 12 },
  { slotKey: "A3", famiglia: "A", profilo: "TITOLARE", targetBudget: 9, regola: "bonus/minuti", protectPriority: 13 },
  { slotKey: "C3", famiglia: "C", profilo: "TITOLARE", targetBudget: 8, regola: "90%+", protectPriority: 14 },
  { slotKey: "Jolly2", famiglia: "Jolly", profilo: "TITOLARE", targetBudget: 4, regola: "versatile e titolare", protectPriority: 14 },
  { slotKey: "A4", famiglia: "A", profilo: "SCOMMESSA", targetBudget: 4, regola: "gioiellino", protectPriority: 15 },
  { slotKey: "Por3", famiglia: "Por", profilo: "TERZO", targetBudget: 7, regola: "pacchetto portiere terzo", protectPriority: 16 },
  { slotKey: "Dd3", famiglia: "Dd", profilo: "SCOMMESSA", targetBudget: 2, regola: "gioiellino / copertura", protectPriority: 16 },
  { slotKey: "Ds3", famiglia: "Ds", profilo: "SCOMMESSA", targetBudget: 2, regola: "gioiellino / copertura", protectPriority: 16 },
  { slotKey: "Dc5", famiglia: "Dc", profilo: "LOW", targetBudget: 2, regola: "scommessa / coppia", protectPriority: 16 },
];

export const DEFAULT_FINANCING_RULES: FinancingRule[] = [
  { evento: "Pc bomber a 160", extraVsTarget: 15, recuperoSuggerito: "-5 A2; -4 C3; -3 Jolly; -3 Dc/terzini low", principio: "il bomber si finanzia sui ruoli profondi" },
  { evento: "A top a 80", extraVsTarget: 15, recuperoSuggerito: "-7 Pc2; -3 C3; -3 Dc; -2 Jolly", principio: "pagare l'A top implica secondo Pc value" },
  { evento: "Dd o Ds top a 35", extraVsTarget: 17, recuperoSuggerito: "-8 sull'altro lato; -4 Dc; -3 Jolly; -2 scommesse", principio: "non comprare due ali premium insieme" },
  { evento: "Portieri a 60", extraVsTarget: 8, recuperoSuggerito: "-3 Dc; -2 Jolly; -3 A4/C3", principio: "porta top sì, ma senza erodere il bomber" },
  { evento: "Affare Pc bomber a 130", extraVsTarget: -15, recuperoSuggerito: "+8 A2; +4 C/M; +3 Dd/Ds", principio: "reinvesti dove aumenta bonus/titolarità" },
];

export const FAMILY_LIST: Famiglia433[] = ["Por", "Dd", "Ds", "Dc", "Jolly", "A", "C", "M", "Pc", "Non433"];
