# GitHub and GitLab development integrations

Planeo stores provider credentials and webhook secrets encrypted and returns only a credential fingerprint. GitHub connections should grant read-only metadata access to selected repositories plus webhook delivery access. GitLab tokens should use `read_api` and `read_repository`; write scopes are not required.

Self-hosted GitLab base URLs must use HTTPS without embedded credentials. Operators remain responsible for trusted TLS, DNS, egress allow-lists, and ensuring the instance is reachable from Planeo. Repository selection is explicit. Revocation stops ingestion without deleting historical issue links, and inaccessible repositories are shown as unavailable until a resync restores access.

Provider webhooks must include GitHub's `X-Hub-Signature-256` and `X-GitHub-Delivery`, or GitLab's secret token and event UUID. Delivery IDs are idempotent. Provider timestamps ensure late webhooks cannot overwrite newer state. Automated tests use signed local payload simulators and never require live provider credentials.
