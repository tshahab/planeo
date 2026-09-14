import type { Prisma } from "@prisma/client";

export const QUERY_LANGUAGE_VERSION = 1;
export const MAX_QUERY_LENGTH = 2_000;
export const MAX_QUERY_COST = 100;
export const QUERY_FIELDS = ["key", "text", "summary", "description", "project", "type", "status", "assignee", "reporter", "priority", "label", "sprint", "release", "parent", "link", "requestType", "created", "updated", "due", "resolved"] as const;

type Field = typeof QUERY_FIELDS[number];
type Operator = "=" | "!=" | ">" | ">=" | "<" | "<=" | "~" | "IN" | "NOT IN";
type Node = { kind: "and"; left: Node; right: Node } | { kind: "or"; left: Node; right: Node } | { kind: "not"; value: Node } | { kind: "term"; field: Field; operator: Operator; values: string[] };
type Token = { value: string; offset: number };

export class QueryLanguageError extends Error {
  constructor(message: string, readonly offset: number, readonly code: "INVALID_QUERY" | "QUERY_TOO_COMPLEX" = "INVALID_QUERY") { super(message); }
}

export function parseAdvancedQuery(source: string) {
  if (source.length > MAX_QUERY_LENGTH) throw new QueryLanguageError(`Query exceeds ${MAX_QUERY_LENGTH} characters.`, MAX_QUERY_LENGTH, "QUERY_TOO_COMPLEX");
  const tokens = tokenize(source); let cursor = 0; let cost = 0;
  const peek = (value?: string) => value ? tokens[cursor]?.value.toUpperCase() === value : tokens[cursor];
  const take = () => tokens[cursor++];
  const expect = (value: string) => { const token = take(); if (!token || token.value.toUpperCase() !== value) throw error(`Expected ${value}.`, token, source.length); return token; };
  const expression = (): Node => { let node = conjunction(); while (peek("OR")) { take(); node = { kind: "or", left: node, right: conjunction() }; cost += 3; } return node; };
  const conjunction = (): Node => { let node = unary(); while (peek("AND")) { take(); node = { kind: "and", left: node, right: unary() }; cost++; } return node; };
  const unary = (): Node => { if (peek("NOT")) { take(); cost += 2; return { kind: "not", value: unary() }; } if (peek("(")) { take(); const node = expression(); expect(")"); return node; } return term(); };
  const term = (): Node => {
    const fieldToken = take(); const normalized = fieldToken?.value.toLowerCase() as Field;
    if (!fieldToken || !QUERY_FIELDS.includes(normalized)) throw error("Expected a supported field name.", fieldToken, source.length);
    const operatorToken = take(); if (!operatorToken) throw error("Expected a comparison operator.", operatorToken, source.length);
    let operator = operatorToken.value.toUpperCase();
    if (operator === "NOT" && peek("IN")) { take(); operator = "NOT IN"; }
    if (!["=", "!=", ">", ">=", "<", "<=", "~", "IN", "NOT IN"].includes(operator)) throw error("Expected =, !=, ~, IN, NOT IN, >, >=, <, or <=.", operatorToken, source.length);
    const values: string[] = [];
    if (operator.endsWith("IN")) { expect("("); do { const value = take(); if (!value || [")", ","].includes(value.value)) throw error("Expected a value in the list.", value, source.length); values.push(value.value); if (!peek(",")) break; take(); } while (true); expect(")"); cost += values.length * 2; }
    else { const value = take(); if (!value || ["(", ")", ","].includes(value.value)) throw error("Expected a comparison value.", value, source.length); values.push(value.value); }
    cost += normalized === "text" || normalized === "description" || operator === "~" ? 5 : 1;
    if (cost > MAX_QUERY_COST) throw new QueryLanguageError(`Query cost ${cost} exceeds limit ${MAX_QUERY_COST}.`, fieldToken.offset, "QUERY_TOO_COMPLEX");
    return { kind: "term", field: normalized, operator: operator as Operator, values };
  };
  if (!tokens.length) throw new QueryLanguageError("Query cannot be empty.", 0);
  const ast = expression();
  if (cursor !== tokens.length) throw error(`Unexpected token “${tokens[cursor].value}”.`, tokens[cursor], source.length);
  return { ast, cost, version: QUERY_LANGUAGE_VERSION };
}

export function compileAdvancedQuery(source: string, now = new Date()): { where: Prisma.IssueWhereInput; cost: number; version: number } {
  const parsed = parseAdvancedQuery(source);
  return { ...parsed, where: compile(parsed.ast, now) };
}

function compile(node: Node, now: Date): Prisma.IssueWhereInput {
  if (node.kind === "and") return { AND: [compile(node.left, now), compile(node.right, now)] };
  if (node.kind === "or") return { OR: [compile(node.left, now), compile(node.right, now)] };
  if (node.kind === "not") return { NOT: compile(node.value, now) };
  const value = node.values[0], scalar = comparison(node.operator, node.values);
  switch (node.field) {
    case "summary": return { summary: textComparison(node.operator, value) };
    case "description": return { description: { string_contains: value } };
    case "text": return { OR: [{ summary: { contains: value, mode: "insensitive" } }, { description: { string_contains: value } }] };
    case "key": { const match = /^([A-Z][A-Z0-9]{1,9})-(\d+)$/i.exec(value); return match ? { project: { key: match[1].toUpperCase() }, number: Number(match[2]) } : { id: "__no_match__" }; }
    case "project": return { project: { key: scalar as Prisma.StringFilter } };
    case "type": return { issueType: { name: scalar as Prisma.StringFilter } };
    case "status": return { status: { name: scalar as Prisma.StringFilter } };
    case "assignee": return userPredicate("assignee", node.operator, node.values);
    case "reporter": return userPredicate("reporter", node.operator, node.values);
    case "priority": return { priority: scalar as Prisma.EnumPriorityFilter };
    case "label": return relationPredicate("labels", "label", "name", node.operator, node.values);
    case "sprint": return relationPredicate("sprintIssues", "sprint", "name", node.operator, node.values);
    case "release": return relationPredicate("releases", "release", "name", node.operator, node.values);
    case "parent": return { parent: { is: { summary: textComparison(node.operator, value) } } };
    case "link": return { OR: [{ outwardLinks: { some: { type: textComparison(node.operator, value) } } }, { inwardLinks: { some: { type: textComparison(node.operator, value) } } }] };
    case "requestType": return { serviceRequest: { requestType: { name: textComparison(node.operator, value) } } };
    case "created": return { createdAt: dateComparison(node.operator, value, now) };
    case "updated": return { updatedAt: dateComparison(node.operator, value, now) };
    case "due": return { dueDate: dateComparison(node.operator, value, now) };
    case "resolved": return { completedAt: dateComparison(node.operator, value, now) };
  }
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = []; let index = 0;
  while (index < source.length) { if (/\s/.test(source[index])) { index++; continue; } const offset = index;
    if (/[(),]/.test(source[index])) { tokens.push({ value: source[index++], offset }); continue; }
    const op = /^(>=|<=|!=|=|>|<|~)/.exec(source.slice(index)); if (op) { tokens.push({ value: op[1], offset }); index += op[1].length; continue; }
    if (source[index] === '"') { index++; let value = ""; while (index < source.length && source[index] !== '"') { if (source[index] === "\\" && index + 1 < source.length) index++; value += source[index++]; } if (source[index] !== '"') throw new QueryLanguageError("Unterminated quoted value.", offset); index++; tokens.push({ value, offset }); continue; }
    const word = /^[^\s(),=<>!~]+/.exec(source.slice(index)); if (!word) throw new QueryLanguageError("Invalid character.", offset); tokens.push({ value: word[0], offset }); index += word[0].length;
  } return tokens;
}
function error(message: string, token: Token | undefined, fallback: number) { return new QueryLanguageError(message, token?.offset ?? fallback); }
function comparison(operator: Operator, values: string[]) { if (operator === "IN") return { in: values }; if (operator === "NOT IN") return { notIn: values }; if (operator === "!=") return { not: values[0] }; if (operator === ">") return { gt: values[0] }; if (operator === ">=") return { gte: values[0] }; if (operator === "<") return { lt: values[0] }; if (operator === "<=") return { lte: values[0] }; return operator === "~" ? { contains: values[0], mode: "insensitive" as const } : values[0]; }
function textComparison(operator: Operator, value: string): Prisma.StringFilter { return operator === "!=" ? { not: value, mode: "insensitive" } : operator === "~" ? { contains: value, mode: "insensitive" } : { equals: value, mode: "insensitive" }; }
function userPredicate(field: "assignee" | "reporter", operator: Operator, values: string[]): Prisma.IssueWhereInput { const names = operator.endsWith("IN") ? { in: values, mode: "insensitive" as const } : textComparison(operator, values[0]); return { [field]: { is: { OR: [{ name: names }, { email: names }] } } }; }
function relationPredicate(relation: string, nested: string, field: string, operator: Operator, values: string[]): Prisma.IssueWhereInput { const condition = { [nested]: { [field]: operator.endsWith("IN") ? { in: values, mode: "insensitive" } : textComparison(operator, values[0]) } }; return { [relation]: operator === "!=" || operator === "NOT IN" ? { none: condition } : { some: condition } } as Prisma.IssueWhereInput; }
function dateComparison(operator: Operator, value: string, now: Date): Prisma.DateTimeFilter<"Issue"> { const date = relativeDate(value, now); if (!date) throw new QueryLanguageError("Date values must be YYYY-MM-DD, now, today, or a relative duration such as -7d.", 0); if (operator === ">") return { gt: date }; if (operator === ">=") return { gte: date }; if (operator === "<") return { lt: date }; if (operator === "<=") return { lte: date }; if (operator === "!=") return { not: date }; return { equals: date }; }
function relativeDate(value: string, now: Date) { if (value === "now") return now; if (value === "today") return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())); const relative = /^(-?\d+)([dhw])$/.exec(value); if (relative) { const multipliers = { d: 864e5, h: 36e5, w: 6048e5 }; return new Date(now.getTime() + Number(relative[1]) * multipliers[relative[2] as keyof typeof multipliers]); } const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00.000Z`) : null; return date && !Number.isNaN(date.getTime()) ? date : null; }
