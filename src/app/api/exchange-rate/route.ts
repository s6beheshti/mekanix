import { NextResponse } from "next/server";
import { getUsdIrrRateSnapshot } from "@/lib/exchange-rate";

export async function GET() {
  const snapshot = await getUsdIrrRateSnapshot();
  return NextResponse.json(snapshot, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
