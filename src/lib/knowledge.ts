export function sanitizeKnowledgeBody(input: string) {
  return input.slice(0, 100_000).replace(/<script[\s\S]*?<\/script>/gi, "").replace(/\son\w+\s*=\s*(["']).*?\1/gi, "").replace(/javascript:/gi, "").replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, "");
}
