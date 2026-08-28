import type { PlayerDatabase } from "./types";

export interface PairingInfo {
  source: "graduatoria" | "coppie";
  competitorName: string;
  competitorPlayerId: string | null;
  ruoloCompetitor: string | null;
  tipo: string | null;
  nota: string | null;
  fonte: string | null;
}

/**
 * Section 26/37: "chi è il ballottaggio di X?" — pulls the paired/competing
 * name from both the curated Graduatorie 433 "Coppia/copertura" column and
 * the richer Coppie & Gioielli table (which also carries the "Tipo",
 * budget range and the note explaining whether it's a real ballottaggio,
 * a tactical cover, or a top+upside pairing).
 */
export function findPairingInfo(db: PlayerDatabase, playerId: string): PairingInfo[] {
  const results: PairingInfo[] = [];
  const seen = new Set<string>();

  for (const g of db.graduatorie) {
    if (g.playerId !== playerId || !g.coppiaCopertura) continue;
    const key = `g:${g.coppiaCopertura.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({
      source: "graduatoria",
      competitorName: g.coppiaCopertura,
      competitorPlayerId: null,
      ruoloCompetitor: null,
      tipo: g.rischio?.toUpperCase().includes("BALLOTTAGGIO") ? "ballottaggio" : null,
      nota: null,
      fonte: g.fonte || null,
    });
  }

  for (const c of db.coppie) {
    if (c.titolarePlayerId === playerId && c.copertura) {
      const key = `c:${c.copertura.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({
        source: "coppie", competitorName: c.copertura, competitorPlayerId: c.coperturaPlayerId,
        ruoloCompetitor: c.ruoloCopertura || null, tipo: c.tipo || null, nota: c.nota || null, fonte: c.fonte || null,
      });
    } else if (c.coperturaPlayerId === playerId && c.titolare) {
      const key = `c:${c.titolare.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({
        source: "coppie", competitorName: c.titolare, competitorPlayerId: c.titolarePlayerId,
        ruoloCompetitor: c.ruoloTitolare || null, tipo: c.tipo || null, nota: c.nota || null, fonte: c.fonte || null,
      });
    }
  }

  return results;
}

export function describePairing(playerNome: string, pairings: PairingInfo[]): string {
  if (pairings.length === 0) return `Nessuna informazione di coppia/ballottaggio per ${playerNome}.`;
  const lines = pairings.map((p) => {
    const isBallottaggio = (p.tipo || "").toLowerCase().includes("ballottaggio");
    const verb = isBallottaggio ? "in ballottaggio con" : "abbinato a";
    const ruolo = p.ruoloCompetitor ? ` (${p.ruoloCompetitor})` : "";
    const nota = p.nota ? ` — ${p.nota}` : "";
    return `${playerNome} è ${verb} ${p.competitorName}${ruolo}${nota}`;
  });
  return lines.join("\n");
}
