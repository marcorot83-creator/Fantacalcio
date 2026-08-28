import type { Famiglia433, Player } from "./types";
import { fuzzyFind, normalizeName, type FuzzyMatch } from "./util";

export type ParserIntent =
  | "NOMINATE" | "BID_UPDATE" | "RILANCIA_QUERY" | "WON_BY_ME" | "SOLD_TO_OPPONENT" | "LOST_UNKNOWN"
  | "STATUS_QUERY_PLAYER" | "RECOMMEND_ROLE" | "NEED_UNDER_PRICE" | "GEMS_QUERY" | "WHO_TO_CALL"
  | "MAX_SPEND" | "WHATIF" | "ALTERNATIVES" | "PAIR_QUERY" | "OPPONENTS_NEED" | "OPPONENTS_AVG_SPEND"
  | "OVERSPEND_QUERY" | "RECALC_STRATEGY" | "AUTO_ON" | "AUTO_OFF" | "STATUS" | "ROSTER" | "BUDGET"
  | "OPPONENTS" | "UNDO" | "NEW_AUCTION" | "UNKNOWN";

export interface ManagerRef { id: string; name: string }

export interface ParsedCommand {
  raw: string;
  intent: ParserIntent;
  playerId: string | null;
  playerAmbiguous: FuzzyMatch<Player>[] | null;
  price: number | null;
  managerId: string | null;
  family: Famiglia433 | null;
  count: number | null;
  needsClarification: string | null;
}

const FAMILY_WORDS: Record<string, Famiglia433> = {
  por: "Por", portiere: "Por", portieri: "Por",
  dd: "Dd", ds: "Ds", dc: "Dc", jolly: "Jolly",
  a: "A", attaccante: "A", attaccanti: "A",
  c: "C", trequartista: "C", trequartisti: "C",
  m: "M", centrocampista: "M", centrocampisti: "M",
  pc: "Pc", bomber: "Pc", punta: "Pc", punte: "Pc",
};

function extractNumbers(text: string): number[] {
  return [...text.matchAll(/\d+([.,]\d+)?/g)].map((m) => parseFloat(m[0].replace(",", ".")));
}

function extractFamily(text: string): Famiglia433 | null {
  const t = normalizeName(text);
  for (const [word, fam] of Object.entries(FAMILY_WORDS)) {
    const re = new RegExp(`(^|\\s)${word}(\\s|$|[?.,])`);
    if (re.test(t)) return fam;
  }
  return null;
}

function stripKnownWords(text: string, words: string[]): string {
  let t = text;
  for (const w of words) {
    t = t.replace(new RegExp(`\\b${w}\\b`, "gi"), " ");
  }
  return t.replace(/\d+([.,]\d+)?/g, " ").replace(/\s+/g, " ").trim();
}

const STOPWORDS = [
  "preso", "venduto", "prezzo", "max", "massimo", "alternative", "alternativa", "ruolo", "gioielli",
  "gioiellino", "gioiellini", "rosa", "budget", "avversari", "nomina", "whatif", "undo", "auto", "stop",
  "chiamano", "chiamato", "chiamo", "siamo", "andato", "andata", "ha", "e", "è", "a", "di", "il", "la",
  "per", "posso", "spendere", "su", "quanto", "come", "consigli", "consiglio", "mi", "serve", "un", "una",
  "quali", "sono", "ancora", "liberi", "libere", "chi", "adesso", "se", "prendo", "cosa", "cambia",
  "fammi", "vedere", "cinque", "tre", "quattro", "due", "conviene", "fare", "hanno", "bisogno", "di",
  "spesa", "mediamente", "gli", "altri", "sui", "sto", "spendendo", "troppo", "ricalcola", "strategia",
  "passa", "modalita", "modalità", "automatica", "automatico", "gia", "già", "uscito", "uscita", "perso",
  "persa", "ce", "l", "ho", "rilancio", "meno", "sotto", "credito", "crediti",
];

function findPlayerMatch(text: string, players: Player[], managers: ManagerRef[]): FuzzyMatch<Player>[] {
  const cleaned = stripKnownWords(text, [...STOPWORDS, ...managers.map((m) => m.name)]);
  if (!cleaned) return [];
  const matches = fuzzyFind(cleaned, players, (p) => p.nome).filter((m) => m.score >= 0.5);
  return matches;
}

function findManagerMatch(text: string, managers: ManagerRef[]): ManagerRef | null {
  const matches = fuzzyFind(text, managers, (m) => m.name).filter((m) => m.score >= 0.75);
  return matches[0]?.item ?? null;
}

function resolvePlayer(matches: FuzzyMatch<Player>[]): { playerId: string | null; ambiguous: FuzzyMatch<Player>[] | null } {
  if (matches.length === 0) return { playerId: null, ambiguous: null };
  const [best, second] = matches;
  if (best.score >= 0.75 && (!second || best.score - second.score > 0.08)) {
    return { playerId: best.item.id, ambiguous: null };
  }
  return { playerId: null, ambiguous: matches.slice(0, 5) };
}

/**
 * Deterministic, rule-based Italian command parser (sections 26/62). No LLM
 * call: it only extracts structure (intent, player, price, manager) — the
 * quantitative engine (session.ts/decision.ts) makes every actual decision.
 */
export function parseCommand(
  text: string,
  ctx: { players: Player[]; managers: ManagerRef[] }
): ParsedCommand {
  const raw = text.trim();
  const t = raw.toLowerCase();
  const nt = normalizeName(raw);
  const nums = extractNumbers(raw);
  const base: ParsedCommand = {
    raw, intent: "UNKNOWN", playerId: null, playerAmbiguous: null, price: null, managerId: null,
    family: null, count: null, needsClarification: null,
  };

  // ---- slash commands ----
  if (raw.startsWith("/")) {
    const [cmd, ...rest] = raw.slice(1).split(/\s+/);
    const restText = rest.join(" ");
    const restNums = extractNumbers(restText);
    switch (cmd.toLowerCase()) {
      case "preso": {
        const { playerId, ambiguous } = resolvePlayer(findPlayerMatch(restText, ctx.players, ctx.managers));
        return { ...base, intent: "WON_BY_ME", playerId, playerAmbiguous: ambiguous, price: restNums[0] ?? null };
      }
      case "venduto": {
        const mgr = findManagerMatch(restText, ctx.managers);
        const { playerId, ambiguous } = resolvePlayer(findPlayerMatch(restText, ctx.players, ctx.managers));
        return { ...base, intent: "SOLD_TO_OPPONENT", playerId, playerAmbiguous: ambiguous, price: restNums[0] ?? null, managerId: mgr?.id ?? null };
      }
      case "prezzo": {
        const { playerId, ambiguous } = resolvePlayer(findPlayerMatch(restText, ctx.players, ctx.managers));
        return { ...base, intent: "STATUS_QUERY_PLAYER", playerId, playerAmbiguous: ambiguous };
      }
      case "max": {
        const { playerId, ambiguous } = resolvePlayer(findPlayerMatch(restText, ctx.players, ctx.managers));
        return { ...base, intent: "MAX_SPEND", playerId, playerAmbiguous: ambiguous };
      }
      case "alternative": {
        const { playerId, ambiguous } = resolvePlayer(findPlayerMatch(restText, ctx.players, ctx.managers));
        return { ...base, intent: "ALTERNATIVES", playerId, playerAmbiguous: ambiguous };
      }
      case "ruolo": {
        return { ...base, intent: "RECOMMEND_ROLE", family: extractFamily(restText) };
      }
      case "gioielli": {
        return { ...base, intent: "GEMS_QUERY", family: extractFamily(restText) };
      }
      case "rosa": return { ...base, intent: "ROSTER" };
      case "budget": return { ...base, intent: "BUDGET" };
      case "avversari": return { ...base, intent: "OPPONENTS" };
      case "nomina": return { ...base, intent: "WHO_TO_CALL" };
      case "whatif": {
        const { playerId, ambiguous } = resolvePlayer(findPlayerMatch(restText, ctx.players, ctx.managers));
        return { ...base, intent: "WHATIF", playerId, playerAmbiguous: ambiguous, price: restNums[0] ?? null };
      }
      case "undo": return { ...base, intent: "UNDO" };
      case "auto": return { ...base, intent: "AUTO_ON" };
      case "stop": return { ...base, intent: "AUTO_OFF" };
      case "stato": return { ...base, intent: "STATUS" };
      case "nuovaasta":
      case "newauction": return { ...base, intent: "NEW_AUCTION" };
      default: return base;
    }
  }

  // ---- natural language ----
  if (/nuova asta|ricomincia da zero|resetta l.?asta|facciamo una nuova asta/.test(nt)) {
    return { ...base, intent: "NEW_AUCTION" };
  }
  if (/modalita automatica|modalit. automatica/.test(nt)) return { ...base, intent: "AUTO_ON" };
  if (/stop automatico|^stop auto$|ferma (l.)?auto/.test(nt)) return { ...base, intent: "AUTO_OFF" };
  if (/^\/?undo$|annulla ultimo|annulla l.ultimo/.test(nt)) return { ...base, intent: "UNDO" };
  if (/^stato$|situazione asta/.test(nt)) return { ...base, intent: "STATUS" };
  if (/sto spendendo troppo|spendendo troppo/.test(nt)) return { ...base, intent: "OVERSPEND_QUERY" };
  if (/ricalcola la strategia|ricalcola strategia/.test(nt)) return { ...base, intent: "RECALC_STRATEGY" };
  if (/chi chiamo|cosa chiamo/.test(nt)) return { ...base, intent: "WHO_TO_CALL" };
  if (/gioiellin\w+ (sono )?ancora liber\w+|quali gioielli/.test(nt)) {
    return { ...base, intent: "GEMS_QUERY", family: extractFamily(nt) };
  }
  if (/quanto hanno speso mediamente/.test(nt)) return { ...base, intent: "OPPONENTS_AVG_SPEND", family: extractFamily(nt) };
  if (/hanno ancora bisogno di/.test(nt)) return { ...base, intent: "OPPONENTS_NEED", family: extractFamily(nt) };
  if (/^conviene fare /.test(nt) || /coppia|copertura/.test(nt)) {
    const matches = findPlayerMatch(raw, ctx.players, ctx.managers);
    return { ...base, intent: "PAIR_QUERY", playerAmbiguous: matches.length ? matches.slice(0, 5) : null };
  }
  if (/fammi vedere .*alternativ|alternative a |alternativa a /.test(nt)) {
    const { playerId, ambiguous } = resolvePlayer(findPlayerMatch(raw, ctx.players, ctx.managers));
    const countMatch = nt.match(/\b(due|tre|quattro|cinque|\d+)\b/);
    const wordNums: Record<string, number> = { due: 2, tre: 3, quattro: 4, cinque: 5 };
    const count = countMatch ? (wordNums[countMatch[1]] ?? parseInt(countMatch[1], 10)) : null;
    return { ...base, intent: "ALTERNATIVES", playerId, playerAmbiguous: ambiguous, count };
  }
  if (/se prendessi|se prendo .* a \d+|cosa cambia/.test(nt)) {
    const { playerId, ambiguous } = resolvePlayer(findPlayerMatch(raw, ctx.players, ctx.managers));
    return { ...base, intent: "WHATIF", playerId, playerAmbiguous: ambiguous, price: nums[0] ?? null };
  }
  if (/quanto posso spendere/.test(nt)) {
    const { playerId, ambiguous } = resolvePlayer(findPlayerMatch(raw, ctx.players, ctx.managers));
    return { ...base, intent: "MAX_SPEND", playerId, playerAmbiguous: ambiguous };
  }
  if (/mi serve un|chi mi consigli come/.test(nt)) {
    const family = extractFamily(nt);
    const maxMatch = nt.match(/meno di (\d+)/);
    return { ...base, intent: family && maxMatch ? "NEED_UNDER_PRICE" : "RECOMMEND_ROLE", family, price: maxMatch ? parseInt(maxMatch[1], 10) : null };
  }
  if (/gia uscito|già uscito|e uscito\?|è uscito\?/.test(nt)) {
    const { playerId, ambiguous } = resolvePlayer(findPlayerMatch(raw, ctx.players, ctx.managers));
    return { ...base, intent: "STATUS_QUERY_PLAYER", playerId, playerAmbiguous: ambiguous };
  }
  if (/ho perso /.test(nt)) {
    const { playerId, ambiguous } = resolvePlayer(findPlayerMatch(raw, ctx.players, ctx.managers));
    return { ...base, intent: "LOST_UNKNOWN", playerId, playerAmbiguous: ambiguous };
  }
  if (/preso /.test(nt)) {
    const { playerId, ambiguous } = resolvePlayer(findPlayerMatch(raw, ctx.players, ctx.managers));
    return { ...base, intent: "WON_BY_ME", playerId, playerAmbiguous: ambiguous, price: nums[0] ?? null };
  }
  if (/ è andat[oa] a |andato a |andata a /.test(t)) {
    const mgr = findManagerMatch(raw, ctx.managers);
    const { playerId, ambiguous } = resolvePlayer(findPlayerMatch(raw, ctx.players, ctx.managers));
    return { ...base, intent: "SOLD_TO_OPPONENT", playerId, playerAmbiguous: ambiguous, price: nums[0] ?? null, managerId: mgr?.id ?? null };
  }
  if (/chiaman[oa]|chiamato/.test(nt)) {
    const { playerId, ambiguous } = resolvePlayer(findPlayerMatch(raw, ctx.players, ctx.managers));
    return { ...base, intent: "NOMINATE", playerId, playerAmbiguous: ambiguous, price: nums[0] ?? null };
  }
  if (/^rilancio\??$/.test(nt)) return { ...base, intent: "RILANCIA_QUERY" };
  if (/ce l.ha /.test(t) || /siamo a \d+/.test(nt)) {
    const mgr = findManagerMatch(raw, ctx.managers);
    const { playerId, ambiguous } = resolvePlayer(findPlayerMatch(raw, ctx.players, ctx.managers));
    return { ...base, intent: "BID_UPDATE", playerId, playerAmbiguous: ambiguous, price: nums[0] ?? null, managerId: mgr?.id ?? null };
  }

  // Generic fallback: "<Nome> <numero>" or "<Nome>?" -> treat as bid update / query.
  if (nums.length > 0) {
    const { playerId, ambiguous } = resolvePlayer(findPlayerMatch(raw, ctx.players, ctx.managers));
    if (playerId || ambiguous) return { ...base, intent: "BID_UPDATE", playerId, playerAmbiguous: ambiguous, price: nums[0] };
  }
  const { playerId, ambiguous } = resolvePlayer(findPlayerMatch(raw, ctx.players, ctx.managers));
  if (playerId || ambiguous) return { ...base, intent: "STATUS_QUERY_PLAYER", playerId, playerAmbiguous: ambiguous };

  return base;
}
