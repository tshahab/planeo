import sanitizeHtml from "sanitize-html";

export function sanitizeKnowledgeBody(input: string) {
  return sanitizeHtml(input.slice(0, 100_000), {
    allowedTags: ["p", "br", "strong", "em", "u", "s", "blockquote", "ul", "ol", "li", "h2", "h3", "h4", "a", "code", "pre"],
    allowedAttributes: { a: ["href", "title", "target", "rel"] },
    allowedSchemes: ["http", "https", "mailto"],
    allowProtocolRelative: false,
    enforceHtmlBoundary: true,
  });
}
