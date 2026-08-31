# SCIM 2.0 provisioning

Planeo exposes organization-scoped `/api/scim/v2/{organization}` Users, Groups, ServiceProviderConfig, ResourceTypes, and Schemas endpoints. Tokens are shown once, stored as SHA-256 hashes, independently scoped, expiring, rate-limited, and revocable.

SCIM identity is keyed by an immutable Planeo resource ID plus unique organization `externalId` and normalized `userName`. Retried creates converge on the existing resource only when both stable identifiers agree. Email collisions outside the organization are rejected. A SAML login may link a SCIM-managed account only when the signed persistent NameID exactly equals its SCIM external ID; email alone never links accounts.

Setting `active=false` or deleting a User preserves the user and attributable history while immediately deactivating organization/workspace membership and revoking sessions only in that organization. Group membership accepts only active SCIM users from the same organization. Group-to-workspace/project mappings are validated against immutable organization ownership and become inputs to the shared permission layer.

Provisioning logs store action, resource type/ID, status, error code, and bounded counts only; request payloads and credentials are never stored. The migration is additive. Disable and revoke SCIM tokens before rollback; deprovisioned users require an explicit administrator or SCIM reactivation.
