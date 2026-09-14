export function signedEnvelope(secret: string, value: unknown): { data: string; headers: Record<string, string> };
