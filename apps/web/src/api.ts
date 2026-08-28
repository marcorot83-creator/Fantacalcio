import type {
  AuctionSession, Player, GraduatoriaEntry, CoppiaEntry, GioielloEntry, PacchettoPortieri,
  StrategyConfig, DatasetMeta, BidRecommendation, AlternativeSuggestion, WhatIfResult,
  AuctionEventType, FeasibilityCheck as SharedFeasibilityCheck, OpponentReport, PairingInfo,
} from "@fanta/shared";

const BASE = "/api";

async function req<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export interface SessionSummary { id: string; name: string; status: string; createdAt: string; updatedAt: string }

export const api = {
  meta: () => req<DatasetMeta>("/meta"),
  strategyConfig: () => req<StrategyConfig>("/strategy-config"),
  players: (params: Record<string, string | number | undefined> = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)]));
    return req<Player[]>(`/players?${qs.toString()}`);
  },
  player: (id: string) => req<Player>(`/players/${encodeURIComponent(id)}`),
  graduatoria: (famiglia: string) => req<(GraduatoriaEntry & { live: any })[]>(`/graduatorie/${famiglia}`),
  coppie: () => req<CoppiaEntry[]>("/coppie"),
  gioielli: (famiglia?: string) => req<GioielloEntry[]>(`/gioielli${famiglia ? `?famiglia=${famiglia}` : ""}`),
  portieriPacchetti: () => req<PacchettoPortieri[]>("/portieri-pacchetti"),

  sessions: () => req<SessionSummary[]>("/sessions"),
  session: (id: string) => req<AuctionSession>(`/sessions/${id}`),
  createSession: (payload: any) => req<AuctionSession>("/sessions", { method: "POST", body: JSON.stringify(payload) }),
  resetSession: (id: string) => req<AuctionSession>(`/sessions/${id}/reset`, { method: "POST" }),
  archiveSession: (id: string) => req<{ ok: true }>(`/sessions/${id}/archive`, { method: "POST" }),
  closeSession: (id: string) => req<AuctionSession>(`/sessions/${id}/close`, { method: "POST" }),
  deleteSession: (id: string) => req<{ ok: true }>(`/sessions/${id}`, { method: "DELETE" }),

  status: (id: string) => req<{ summary: any; text: string }>(`/sessions/${id}/status`),
  feasibility: (id: string) => req<SharedFeasibilityCheck[]>(`/sessions/${id}/feasibility`),
  opponents: (id: string) => req<OpponentReport[]>(`/sessions/${id}/opponents`),
  pairing: (playerId: string) => req<PairingInfo[]>(`/players/${encodeURIComponent(playerId)}/pairing`),

  event: (id: string, payload: { type: AuctionEventType; playerId?: string | null; price?: number | null; managerId?: string | null; payload?: any }) =>
    req<{ session: AuctionSession; event: any }>(`/sessions/${id}/events`, { method: "POST", body: JSON.stringify(payload) }),
  undo: (id: string) => req<{ session: AuctionSession; event: any }>(`/sessions/${id}/undo`, { method: "POST" }),

  recommendation: (id: string, playerId: string, currentBid: number) =>
    req<BidRecommendation>(`/sessions/${id}/recommendation/${playerId}?currentBid=${currentBid}`),
  alternatives: (id: string, playerId: string, limit = 5) =>
    req<AlternativeSuggestion[]>(`/sessions/${id}/alternatives/${playerId}?limit=${limit}`),
  whatif: (id: string, playerId: string, price: number) =>
    req<WhatIfResult>(`/sessions/${id}/whatif?playerId=${playerId}&price=${price}`),
  nomination: (id: string) => req<any>(`/sessions/${id}/nomination`),
  listone: (id: string, params: Record<string, string | number | undefined> = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)]));
    return req<{ count: number; players: Player[] }>(`/sessions/${id}/listone?${qs.toString()}`);
  },
  why: (id: string, playerId: string) => req<{ reasons: string[] }>(`/sessions/${id}/players/${playerId}/why`),

  chat: (id: string, text: string) => req<any>(`/sessions/${id}/chat`, { method: "POST", body: JSON.stringify({ text }) }),

  importExcel: async (id: string, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`${BASE}/import`, { method: "POST", body: fd });
    if (!res.ok) throw new Error("Import fallito");
    return res.json();
  },
};
