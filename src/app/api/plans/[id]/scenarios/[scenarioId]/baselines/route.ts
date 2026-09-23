import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { createBaseline } from "@/lib/planning-scenarios";
import { PlanError } from "@/lib/portfolio-plan";
export async function POST(request: Request, { params }: { params: Promise<{ scenarioId: string }> }) { const context = await getAuthContext(); if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 }); try { const body = await request.json().catch(() => null) as { name?: unknown } | null, name = typeof body?.name === "string" ? body.name.trim() : ""; return NextResponse.json({ baseline: await createBaseline(context, (await params).scenarioId, name) }, { status: 201 }); } catch (cause) { const error = cause as PlanError; return NextResponse.json({ error: error.message }, { status: error.status ?? 400 }); } }
