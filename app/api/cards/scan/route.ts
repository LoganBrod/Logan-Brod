import { NextResponse } from "next/server";
import { searchActiveListings } from "@/lib/ebay";
import { getMarketComp, type CompSource } from "@/lib/comps";

const DEFAULT_DEAL_THRESHOLD = 0.8;

export interface CardDeal {
  itemId: string;
  title: string;
  url: string;
  imageUrl?: string;
  condition?: string;
  price: number;
  shipping: number | null;
  totalPrice: number;
  marketPrice: number;
  discountPct: number;
}

export interface ScanResult {
  query: string;
  threshold: number;
  marketPrice: number;
  sources: CompSource[];
  totalListings: number;
  deals: CardDeal[];
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  const categoryId = searchParams.get("categoryId")?.trim() || undefined;
  const thresholdParam = Number(searchParams.get("threshold"));
  const threshold =
    Number.isFinite(thresholdParam) && thresholdParam > 0 && thresholdParam < 1
      ? thresholdParam
      : DEFAULT_DEAL_THRESHOLD;

  if (!q) {
    return NextResponse.json({ error: "Missing required query parameter: q" }, { status: 400 });
  }

  try {
    const [listings, comp] = await Promise.all([
      searchActiveListings(q, { categoryId }),
      getMarketComp(q, categoryId),
    ]);

    if (!comp) {
      return NextResponse.json(
        {
          error:
            "No comps found for this query. Configure PRICECHARTING_API_TOKEN (and/or an eBay Marketplace Insights entitlement) and try a more specific search.",
        },
        { status: 404 }
      );
    }

    const deals: CardDeal[] = listings
      .map((item): CardDeal => {
        const totalPrice = item.price + (item.shipping ?? 0);
        return {
          itemId: item.itemId,
          title: item.title,
          url: item.url,
          imageUrl: item.imageUrl,
          condition: item.condition,
          price: item.price,
          shipping: item.shipping,
          totalPrice,
          marketPrice: comp.averagePrice,
          discountPct: 1 - totalPrice / comp.averagePrice,
        };
      })
      .filter((d) => d.totalPrice > 0 && d.totalPrice <= comp.averagePrice * threshold)
      .sort((a, b) => b.discountPct - a.discountPct);

    const result: ScanResult = {
      query: q,
      threshold,
      marketPrice: comp.averagePrice,
      sources: comp.sources,
      totalListings: listings.length,
      deals,
    };

    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
