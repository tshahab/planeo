import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { publishScenario } from "@/lib/planning-scenarios";
import { PlanError } from "@/lib/portfolio-plan";
export async function POST(request: Request, { params }: { params: Promise<{ scenarioId: string }> }) { const context = await getAuthContext(); if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 }); try { const body = await request.json().catch(() => null) as { changeIds?: unknown } | null; return NextResponse.json(await publishScenario(context, (await params).scenarioId, body?.changeIds)); } catch (cause) { const error = cause as PlanError; return NextResponse.json({ error: error.message }, { status: error.status ?? 400 }); } }
