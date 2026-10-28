export type EmailItem = {
  recipient: string;
  subject: string;
  textBody: string;
  htmlBody: string;
  mailHeaders?: Record<string, string> | null;
  dedupeKey: string;
  correlationId: string;
};
export type EmailProvider = { kind: "smtp" | "http"; send(item: EmailItem): Promise<void>; close(): void };
export function createEmailProvider(env?: Partial<NodeJS.ProcessEnv>, dependencies?: { fetch?: typeof fetch; createTransport?: (options: Record<string, unknown>) => { sendMail(message: Record<string, unknown>): Promise<unknown>; close?(): void } }): EmailProvider;
