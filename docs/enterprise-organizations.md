# Enterprise organizations

Organizations are an optional governance boundary above workspaces. Existing workspaces are unchanged until an owner adopts them. Adoption is compare-and-set and there is intentionally no API for moving an adopted workspace; support-led migration must validate both tenant boundaries and preserve an audit trail.

Domain ownership uses a one-time 256-bit value in `_planeo-verification.<domain>`. Claims are globally unique, expire after 24 hours, and are accepted only while pending. Revocation does not make a previously observed challenge reusable; a future reclaim flow must issue a fresh challenge after the revocation cooling period.

Authentication policy is evaluated server-side. SSO enforcement can disable password login only when a confirmed break-glass administrator exists. Break-glass use and policy mutations produce immutable workspace audit events. Session lifetime changes apply to newly issued sessions; administrators should revoke older sessions when shortening policy.

## Rollback

The migration is additive and does not backfill existing workspaces. Before rolling it back, disable organization policy enforcement and remove organization associations. Do not detach or reassign adopted workspaces by direct SQL in production.
