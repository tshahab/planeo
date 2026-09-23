import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { saveScenarioChange } from "@/lib/planning-scenarios";
import { PlanError } from "@/lib/portfolio-plan";
export async function POST(request: Request, { params }: { params: Promise<{ scenarioId: string }> }) { const context = await getAuthContext(); if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 }); try { const body = await request.json().catch(() => null) as Record<string, unknown> | null, issueId = typeof body?.issueId === "string" ? body.issueId : ""; if (!body) throw new PlanError("Scenario change is required."); return NextResponse.json({ change: await saveScenarioChange(context, (await params).scenarioId, issueId, body) }, { status: 201 }); } catch (cause) { const error = cause as PlanError; return NextResponse.json({ error: error.message }, { status: error.status ?? 400 }); } }
