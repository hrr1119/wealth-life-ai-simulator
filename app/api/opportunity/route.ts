import {
  generateOpportunityCardsWithAI,
  type OpportunityAIContext,
} from "@/lib/ai";
import { generateOpportunityCards } from "@/lib/opportunity";

function numberValue(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function stringValue(value: unknown, fallback: string, max = 80): string {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, max)
    : fallback;
}

function stringArray(value: unknown, max = 12): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").slice(0, max)
    : [];
}

function parseContext(value: unknown): OpportunityAIContext {
  const context =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  return {
    turn: Math.max(1, Math.round(numberValue(context.turn, 1))),
    maxTurns: Math.max(1, Math.round(numberValue(context.maxTurns, 12))),
    city: stringValue(context.city, "未知城市"),
    cycle: stringValue(context.cycle, "平稳"),
    roleName: stringValue(context.roleName, "人生实验参与者"),
    cash: Math.max(0, numberValue(context.cash, 0)),
    monthlyIncome: Math.max(0, numberValue(context.monthlyIncome, 0)),
    fixedExpense: Math.max(0, numberValue(context.fixedExpense, 0)),
    energy: Math.max(0, Math.min(100, numberValue(context.energy, 60))),
    relationship: Math.max(0, Math.min(100, numberValue(context.relationship, 50))),
    skills: stringArray(context.skills),
    memories: stringArray(context.memories, 16),
  };
}

export async function GET() {
  const configured = Boolean(process.env.OPENAI_API_KEY);
  return Response.json(
    {
      configured,
      provider: configured ? "openai" : "local",
      model: configured ? process.env.OPENAI_MODEL || "gpt-5-mini" : null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { intent?: unknown; context?: unknown };
    const intent = typeof body.intent === "string" ? body.intent : "";
    const apiKey = process.env.OPENAI_API_KEY;
    let result;
    if (apiKey) {
      try {
        result = await generateOpportunityCardsWithAI(intent, parseContext(body.context), {
          apiKey,
          model: process.env.OPENAI_MODEL,
        });
      } catch {
        result = generateOpportunityCards(intent);
        result.ruleMapping.splice(
          1,
          0,
          "真实 AI 本次不可用，已安全回退；所有数值仍由同一规则引擎裁决",
        );
      }
    } else {
      result = generateOpportunityCards(intent);
    }
    return Response.json(result, {
      headers: {
        "Cache-Control": "no-store",
        "X-Wealth-Life-AI": result.source,
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
