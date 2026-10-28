export function isPrivateAddress(address: string): boolean;
export function resolvePinnedHttpsTarget(rawUrl: string, lookup?: (hostname: string, options: {all: boolean}) => Promise<Array<{address: string; family?: number}>>): Promise<{url: URL; address: string}>;
export function postPinnedHttps(rawUrl: string, options?: {lookup?: (hostname: string, options: {all: boolean}) => Promise<Array<{address: string; family?: number}>>; request?: unknown; timeoutMs?: number; headers?: Record<string, string>; body?: string}): Promise<{status: number; headers: Record<string, unknown>}>;
