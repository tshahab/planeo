import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { QueueError } from "./service-queues";

export function queueFailure(error: unknown) {
  if (error instanceof QueueError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2034", "P2002"].includes(error.code)) return NextResponse.json({ error: "Concurrent changes detected. Refresh and retry." }, { status: 409 });
  return NextResponse.json({ error: "Queue operation could not be completed." }, { status: 400 });
}
