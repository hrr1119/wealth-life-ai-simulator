import { generateOpportunityCards } from "@/lib/opportunity";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { intent?: unknown };
    const intent = typeof body.intent === "string" ? body.intent : "";
    const result = generateOpportunityCards(intent);
    return Response.json(result, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "无法解析这次自由机会。",
      },
      { status: 400 },
    );
  }
}
