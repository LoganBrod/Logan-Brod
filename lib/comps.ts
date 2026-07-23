// Merges available comp sources (eBay sold comps + PriceCharting) into one market price.

import { getEbaySoldComp } from "./ebaySold";
import { getPriceChartingComp } from "./pricecharting";

export interface CompSource {
  name: string;
  price: number;
  sampleSize?: number;
}

export interface MarketComp {
  averagePrice: number;
  sources: CompSource[];
}

export async function getMarketComp(query: string, categoryId?: string): Promise<MarketComp | null> {
  const [sold, pc] = await Promise.all([
    getEbaySoldComp(query, { categoryId }).catch(() => null),
    getPriceChartingComp(query).catch(() => null),
  ]);

  const sources: CompSource[] = [];
  if (sold) sources.push({ name: "eBay sold comps (90d)", price: sold.averagePrice, sampleSize: sold.sampleSize });
  if (pc) sources.push({ name: "PriceCharting", price: pc.price });

  if (sources.length === 0) return null;

  const averagePrice = sources.reduce((sum, s) => sum + s.price, 0) / sources.length;
  return { averagePrice, sources };
}
