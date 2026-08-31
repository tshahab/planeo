# SAML 2.0 single sign-on

Planeo requires signed assertions and validates the configured issuer, SP audience, ACS destination, assertion time bounds, request correlation, and one-time assertion identifiers. SP requests use SHA-256 signatures. IdP-initiated responses are denied unless explicitly enabled.

Identity linking is based on the stable `(organization, issuer, NameID)` tuple. A mutable email claim never links an existing account. JIT may create a new account only when organization policy permits it and the asserted email belongs to a currently verified organization domain; an email collision is denied for administrator review.

IdP metadata imports reject DTD/entity declarations, non-HTTPS endpoints in production, oversized documents, and invalid certificates. Multiple IdP certificates remain active during rollover. SP signing and assertion-decryption private keys are encrypted at rest and never returned by APIs.

Administrators must complete a test authentication before enabling SAML. Enforced SSO continues to honor the separately confirmed break-glass controls. Disable SSO before rollback; the additive migration may remain in place without affecting local authentication.
