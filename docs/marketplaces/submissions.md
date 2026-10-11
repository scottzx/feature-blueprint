# DSH marketplace submissions

Status checked 2026-10-11. dsplugin has automatically discovered this repository, but its advertised Git installation failed acceptance. Other submissions remain pending review or compatibility.

| Channel | Receipt / status |
| --- | --- |
| canonical awesome / dsh-market shared feed | [PR7030](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/7030), pending |
| DSH Plugin Store | Web form received on 2026-10-10 at 06:09:23 UTC, HTTP200 and success=true; manual review pending |
| dsplugin | Automatic discovery is public, but the advertised Git command failed installation; acceptance blocked. Existing [PR342](https://github.com/vbarter/dsh-plugin-registry/pull/342) was updated to correct the command to pinned npm 0.4.1 (head `94194b73e51098768cd422f586e33d5157b350ca`); OPEN, awaiting review |
| DSH Marketplace | Web form received on 2026-10-11 at 10:11:14.078 UTC, HTTP200, ok=true and duplicate=false; queued for review |
| DSH STORE | [Artifact-route compatibility request1362](https://github.com/AI-Scarlett/DSH-Store/issues/1362); blocked, not a plugin listing request |
| dsh.pub | [Root-package case in compatibility131](https://github.com/dsh-pub/dsh-pub/issues/131#issuecomment-6094515573); maintainer [plans artifact support](https://github.com/dsh-pub/dsh-pub/issues/131#issuecomment-6103964957), and we [replied with pinned fixtures](https://github.com/dsh-pub/dsh-pub/issues/131#issuecomment-6107952113). Route not implemented; still blocked, not a plugin submission |

The only installation target is `@1agents/feature-blueprint@0.4.1` at the root. The public source manifest is 0.3.0 without generated runtime files; use npm or the [verified artifact mirror](https://github.com/scottzx/feature-blueprint/releases/tag/npm-v0.4.1). The npm artifact's source commit remains unknown (`gitHead` is absent); documentation commits and the mirror Release tag do not establish it.

Separate new profiles passed both npm and Release installation, real Loader/client serving, file save and stale-write rejection. See [verification](verification.md) and [sanitized route evidence](install-routes.json). These are publication preparation checks. Each market's actual advertised target requires independent acceptance after listing. The separate dsplugin acceptance failure and the new Marketplace form receipt are recorded in [sanitized market evidence](market-acceptance.json).

Canonical PR7030 passed all CI checks, including full site build and Submission gate, on 2026-10-10 ([run](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/actions/runs/38029859938)). Maintainer review is still pending.

On 2026-10-11, dsplugin advertised `dsh plugin --profile web add github:scottzx/feature-blueprint`. In a new isolated profile, it resolved source version 0.3.0 at `0f3f369b072b8179297963e0ab9b92914f975243` and exited 1 with `ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED`. The fixed Git tree lacks the declared runtime and browser `dist` files. No source build was run, and npm/Release was not substituted for the market's command. Loader, browser and save checks were not reached. PR342 corrects the actual catalog entry to `dsh plugin --profile web add @1agents/feature-blueprint@0.4.1`; the channel stays blocked until that correction is published and independently tested.

The earlier DSH Marketplace inspection failure on 2026-10-10 was superseded by the received form above. Do not resubmit either received web form. A received form and a planned compatibility feature are not confirmed listings or successful market acceptance.
