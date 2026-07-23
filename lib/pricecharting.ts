// PriceCharting API client — used as a market-value comp source for cards.
// Requires PRICECHARTING_API_TOKEN (get one at pricecharting.com/api-documentation).

const PRICECHARTING_BASE = "https://www.pricecharting.com/api";

export interface PriceChartingComp {
  productName: string;
  price: number; // dollars
  source: "pricecharting";
  url?: string;
}

interface ProductResponse {
  status: string;
  id?: string;
  "product-name"?: string;
  "loose-price"?: number;
}

export async function getPriceChartingComp(query: string): Promise<PriceChartingComp | null> {
  const token = process.env.PRICECHARTING_API_TOKEN;
  if (!token) return null;

  const params = new URLSearchParams({ t: token, q: query });

  let res: Response;
  try {
    res = await fetch(`${PRICECHARTING_BASE}/product?${params.toString()}`, { cache: "no-store" });
  } catch {
    return null;
  }

  if (!res.ok) return null;

  const json = (await res.json().catch(() => null)) as ProductResponse | null;
  if (!json || json.status !== "success" || json["loose-price"] == null) return null;

  return {
    productName: json["product-name"] ?? query,
    price: Number(json["loose-price"]) / 100,
    source: "pricecharting",
    url: json.id ? `https://www.pricecharting.com/game/${json.id}` : undefined,
  };
}
