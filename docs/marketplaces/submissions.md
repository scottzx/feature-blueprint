# DSH marketplace submissions

Status checked 2026-10-10; submissions are awaiting review, not yet confirmed listings.

| Channel | Receipt / status |
| --- | --- |
| canonical awesome / dsh-market shared feed | [PR7030](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/7030), pending |
| DSH Plugin Store | Web form received at 06:09:23 UTC, HTTP200 and success=true; manual review pending |
| dsplugin | [PR342](https://github.com/vbarter/dsh-plugin-registry/pull/342), pinned npm install command; pending |
| DSH Marketplace | Repository inspection at 06:03:53 UTC failed due to GitHub rate limiting; not submitted |
| DSH STORE | [Artifact-route compatibility request1362](https://github.com/AI-Scarlett/DSH-Store/issues/1362); blocked, not a plugin listing request |
| dsh.pub | [Root-package case in compatibility131](https://github.com/dsh-pub/dsh-pub/issues/131#issuecomment-6094515573); blocked, not a plugin submission |

The only installation target is `@1agents/feature-blueprint@0.4.1` at the root. The public source manifest is 0.3.0 without generated runtime files; use npm or the [verified artifact mirror](https://github.com/scottzx/feature-blueprint/releases/tag/npm-v0.4.1). The npm artifact's source commit remains unknown.

Separate new profiles passed both npm and Release installation, real Loader/client serving, file save and stale-write rejection. See [verification](verification.md) and [sanitized route evidence](install-routes.json). These are publication preparation checks. Each market's actual advertised target still requires independent acceptance after listing.
