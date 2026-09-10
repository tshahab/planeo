# Service email adapter

Configure a service project's mailbox at `/projects/KEY/settings/mailbox` as a project administrator. Saving rotates its secret. Configure routing with your provider separately; Planeo does not provision DNS or an SMTP server.

The trusted adapter must authenticate the sender using the provider's authenticated delivery metadata (including aligned sender authentication). Never copy `From` into `verifiedSender` without verification. Keep the mailbox secret server-side. The public endpoint trusts only the signed adapter envelope, not mail authentication headers supplied by a sender.

POST `/api/service/mail/MAILBOX_ID` with JSON:

```json
{"providerId":"stable-delivery-id","verifiedSender":"customer@example.test","recipient":"help@example.test","raw":"BASE64_RFC822_MESSAGE"}
```

Send `x-mail-timestamp` as UTC Unix seconds and `x-mail-signature` as lowercase hex HMAC-SHA256 of `timestamp + "." + exact JSON bytes`, using the mailbox secret. Timestamps expire after five minutes; retries use a fresh signature but the same provider ID and Message-ID. Request bodies are bounded, with a 2 MiB decoded mail limit. Only active, verified customers with current project and request permissions are accepted. Subjects never determine threading.

Mail is converted to plain text; HTML is never rendered. Unsafe attachments quarantine the entire delivery without storing the attachment or creating a partial conversation. Recent status/reason diagnostics are available to project administrators. Unknown senders, required portal consent, and unsupported required fields need the customer to use the portal; quarantines cannot be released to bypass these checks.

Outgoing replies use the transactional email outbox. Each recipient gets a separate message, with authorization and suppression checked again at delivery. The adapter must preserve the supplied Message-ID, Reply-To, References, In-Reply-To, and X-Planeo-Loop headers. Internal notes never enter this outbox. A disabled mailbox stops queued portal mail.

For authenticated hard bounces or complaints, POST signed JSON to `/api/service/mail/MAILBOX_ID/bounce`, with `reason` (`HARD_BOUNCE` or `COMPLAINT`), `email`, and the original outbox dedupe key as `deliveryKey`. Only a matching project delivery can suppress that recipient. Never log signing secrets or raw mail. Provider failures remain retryable outbox failures and do not undo customer or agent actions.

Use the Docker Compose mail-capture service for development. Do not point development adapters or test workers at a live email service.
