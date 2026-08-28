import type { BidRecommendation } from "@fanta/shared";

export function computeSemaforoClient(price: number, rec: BidRecommendation): string {
  if (price > rec.dynamicMax) return "rosso";
  if (price > rec.prezzoObiettivo * 1.05) return "arancione";
  if (price > rec.prezzoObiettivo * 0.95) return "giallo";
  return "verde";
}
