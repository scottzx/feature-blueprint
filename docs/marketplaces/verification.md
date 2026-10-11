# DSH plugin installation verification

Tested on 2026-10-10 with the public npm package **`@1agents/feature-blueprint@0.4.1`**, verified first from the byte-checked tarball and then independently through the pinned npm and fixed Release URLs. The root package provides the plugin and CLIs; `packages/dsh-plugin` is private development source and must not be advertised as a separate install target.

## Artifact

- Official npm tarball: https://registry.npmjs.org/@1agents/feature-blueprint/-/feature-blueprint-0.4.1.tgz
- Size: 5,496,140 bytes.
- SHA-256: `5e4ef5ed55be7956373003a66bfd940312c887498037950b2f72713e6c896216`.
- SHA-512 matches the registry integrity. See [machine-readable evidence](artifact-verification.json).
- Package includes `cordis.patch.yml`, `dist/index.js`, plugin `host.js`, `client.js`, lazy `client.canvas.js`, CLI files, MIT licenses and third-party notices.

The public source manifest at `4c01c6d845991425038de7f6ae20eea438e78fff` is `0.3.0`, with generated `dist` excluded from Git. npm `0.4.1` has no recorded source `gitHead`. The `npm-v0.4.1` Release tag anchors documentation and mirrors the original npm tarball; it does not assert that the tag is its build source.

## Actual environment and checks

- Node.js 22.22.1; pnpm 10.34.5.
- Existing local DSH development tree: manifest `0.2.0-rc.1`, base commit `21638c56315ae6a2b552d6091945d3144c9af32e`, with pre-existing local changes. This is not a claim about an unmodified official release.
- Separate temporary `HOME`, `DSH_HOME`, workspace and new `web` profile; telemetry disabled; no personal sessions or credentials copied.
- Three independent fresh environments succeeded and enabled the same public root bundle: the byte-verified local tarball, `dsh plugin --profile web add @1agents/feature-blueprint@0.4.1`, and `dsh plugin --profile web add https://github.com/scottzx/feature-blueprint/releases/download/npm-v0.4.1/feature-blueprint-0.4.1.tgz`.
- The npm and Release profiles both resolved version `0.4.1`, recorded the same official npm integrity in the lockfile, and matched the patch and six inspected runtime/client entries byte for byte. Each route independently passed Loader, HTTP and save checks below.
- Real DSH Cordis Loader, ClientModuleRegistry and full web profile started without plugin activation warnings.
- Main and lazy canvas client requests returned HTTP 200 with bytes matching the installed package.
- Real plugin file-save RPC succeeded; a stale revision was rejected and did not replace newer content.
- No model call was made. All owned servers were stopped, their ports closed, and temporary homes, profiles and credentials removed. Both original development trees retained their initial file fingerprints.

This is publication preparation testing. Each market's actual advertised installation target must be checked again in a separate fresh environment after that market lists the plugin. The successful results above do not verify Git source installation. The separate dsplugin advertised Git installation failure is recorded below.

## Screenshots

The screenshots below show the actual plugin in that isolated DSH web profile, using synthetic project data only.

![Mind map file editor in DSH](screenshots/mind-map.png)

![Excalidraw file preview in DSH](screenshots/excalidraw-canvas.png)

Both file previews were opened through the DSH workspace browser. The 13-topic document and its converted 42-element canvas are synthetic fixtures. The browser used a 1440 × 900 desktop viewport. Session sidebar entries for Mind Map and Canvas were also observed in the real plugin.

## dsplugin advertised installation acceptance — 2026-10-11

The public automatically discovered entry for `scottzx/feature-blueprint` advertised:

```sh
dsh plugin --profile web add github:scottzx/feature-blueprint
```

This exact command was tested independently in a new temporary `HOME`, `DSH_HOME`, synthetic workspace and `web` profile, using the same DSH development environment described above. It exited 1 after approximately 29 seconds with `ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED`. The resolved package was source version `0.3.0` at commit `0f3f369b072b8179297963e0ab9b92914f975243`, rather than published npm `0.4.1`. A complete fixed Git tree confirmed that `cordis.patch.yml` exists, while `dist/index.js` and the plugin's generated host, main client and lazy canvas files are not committed.

The failure occurred at Git dependency preparation. No source build was run or build allowlist changed. No npm or Release target was substituted. Installation did not complete, so bundle enablement, Loader, client HTTP, file save and stale-write rejection were not verified for this market route. This is a failed post-listing installation check, not a failure of the independently verified npm/Release archives.

No plugin server or listening port was started. The temporary home, profile, package cache and credentials were removed, no owned processes remained, and raw private logs were removed. Before/after Git status and diff fingerprints matched for both original development trees (DSH: 337 existing changed entries; project: 61). No personal sessions or credentials were copied, and no model call was made. See [sanitized market evidence](market-acceptance.json).

Existing [PR342](https://github.com/vbarter/dsh-plugin-registry/pull/342) now corrects the command to pinned `@1agents/feature-blueprint@0.4.1`; it remains open. Once the corrected command is public, dsplugin requires another independent fresh-profile installation and full runtime acceptance. The npm artifact's build-source commit remains unknown.
