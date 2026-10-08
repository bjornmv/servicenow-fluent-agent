# Lux (AIUX): validated lessons and conditional remedies

## Evidence boundary

Verified against: SDK 4.11.0, AIUX 22.42.3, Lit 3.3.2, npm 11.6.2 and Node 25.2.1 in a small standalone, read-only incident demo built and installed during 2026-09-08 (historical evidence, not newly verified against another SDK version). Forty-one project tests passed, and a signed-in session hydrated the page, loaded a bounded snapshot, filtered locally and refreshed through its UI handler. Those are historical results, not tests of a new app or this skill distribution.

Visible-window, physical keyboard, 320px reflow, high contrast, real failure/retry and unauthorized-user runtime acceptance were incomplete. The hidden-window 320px attempt measured a zero-width widget; do not reuse that result as responsive approval. No impersonation was performed.

Node 24 LTS >=24.15.0 was recommended, not validated there. A transitive dependency declared Node 20/22/24 support rather than Node 25. The local production-dependency audit had 11 high and 1 moderate findings (including meta-vulnerability entries), plus deprecations. This is not a clean security baseline or proof that the instance's existing platform assets share the same dependency tree. Reassess current versions/reachability before wider use; do not freeze those counts as current forever.

## Dependency installation and Windows commands

A scaffold manifest is not an installed dependency tree. Prefer the project's existing manager/lockfile. A fresh AIUX scaffold has neither a lockfile nor a `packageManager` field; its scripts and `AGENTS.md` assume pnpm (see sn-lux section 2 for the choice). The separate npm installation's JavaScript CLI worked through Node without changing policies or retrying the blocked pnpm launcher.

Resolve the real Node/npm/SDK locations rather than hardcoding a maintainer's profile. A common Windows layout is `<node-directory>/node_modules/npm/bin/npm-cli.js`; confirm it exists and read its package metadata. Use it only when permitted. A direct Node command is a normal entry point, not authorization to evade an explicit policy denial. If denied, stop for an approved path.

For npm, use `ci --ignore-scripts` with an existing valid lockfile or `install --ignore-scripts` when creating one. Review and pin versions, preserve the lockfile, review needed hooks individually and inspect audit findings separately. `ignore-scripts` skips the official skill-copy postinstall as well as native dependency hooks; read any setup script before running it manually.

## Windows asset 404

**Symptom:** SSR heading/shell appears, but the page/widget never hydrates or makes its RPC. A script URL returns 404. Generated `component_compile_metadata.asset` contains e.g. `home\\page-hash.js` instead of `home/page-hash.js`.

Check actual asset fields and network responses first. Missing dependencies, authorization failures and arbitrary module 404s are not automatically this bug.

Check the installed `@servicenow/aiux` version first: a project may declare `latest` and be far newer than 22.42.3. AIUX 22.67.1 contains a POSIX normalization for entry names; whether that removes this symptom on Windows was not tested, so decide from the actual generated `asset` values (the check in SKILL.md section 2), not from the version.

For the confirmed 22.42.3 metadata shape, reviewed templates are provided. Review them in the skill folder; copying them into the app is a project-configuration change that needs approval:

- [now.prebuild.mjs](../assets/now.prebuild.mjs) → app root `now.prebuild.mjs`
- [normalize-aiux-assets.mjs](../assets/scripts/normalize-aiux-assets.mjs) → app `scripts/normalize-aiux-assets.mjs`

Do not overwrite an existing hook/helper; merge existing steps. A `now.prebuild.mjs` in the app root is discovered by the SDK automatically, so copying it there activates it on the next build and replaces the default UI prebuild; no `now.config.json` entry is needed. An existing `scripts.prebuild` entry takes precedence over the root file, and a different path needs one:

```json
{"scripts": {"prebuild": "<path>/now.prebuild.mjs"}}
```

Confirm the build log shows `Running script "prebuild" from <expected path>`.

The hook replaces the default UI prebuild with a call to the same public `buildManifestAndMetadata` API, using the SDK-provided filesystem. It imports Rollup from the project's own `@servicenow/isomorphic-rollup` and, unlike the default build, has no bundled fallback: confirm `node_modules/@servicenow/isomorphic-rollup/package.json` exists at the app root before copying, and do not add it as a new dependency without approval. It runs only the AIUX builder, so it does not suit a project that also has HTML UI Pages under the client directory. It normalizes only the `asset` property within the `component_compile_metadata` and `isolate_compile_metadata` JSON fields of generated `sys_aix_widget` records **before** Fluent XML generation; other records that carry an `asset` value (in 22.67.1, `sys_aix_dependency` `client_script_compile_metadata`) are not covered. It leaves JavaScript, source maps, IDs and other fields untouched. It does not patch vendor code, remove tombstones, install packages or deploy.

The normalizer fails on malformed/unsupported targeted metadata and unsafe absolute/traversal paths. Already-portable paths are unchanged. Check the current SDK task API and metadata shape before adapting it to another version; do not assume it is needed forever or run a second default build after normalization.

Rebuild, assert no backslashes in any generated `asset` value across all records (not only the fields the adapter rewrites), inspect the full payload, then obtain deployment approval. Verify a served HTTP-200 asset body plus actual custom-element registration after install. Do not manually patch generated XML or globally replace backslashes in JSON/JavaScript.

## Native gallery prefetch

**Symptom:** native cards render but log:

```text
getUserPreference('glide.ui.accessibility.show_hidden_controls') was not pre-fetched
```

Inspect the current component's requirements and generated `required_user_preferences` first. The AIUX build (not the ServiceNow SDK) detects getter calls with string-literal arguments in source; AIUX 22.67.1 also merges requirements declared in the packaged components' manifest, so add the workaround only if the key is absent from the built record. A confirmed workaround on 22.42.3 was a literal read from the public AIUX **core** API in the widget's gallery-rendering path:

```js
import {getUserPreference} from '@servicenow/aiux/aiux-components-core';

// Declare the native gallery's inherited dependency for build-time extraction.
// The native gallery consumes the cached value; this call does not write it.
getUserPreference('glide.ui.accessibility.show_hidden_controls');
```

Keep it inside the appropriate component method, not an unrelated top-level browser side effect. Verify the requirement on both the page and widget when applicable, read it back after an approved update, then retest the console. Do not call `setUserPreference`, force the value, remove accessibility behavior, or suppress the error logger as a fix.

## Tombstones and UI verification

The initial demo's early theme edit left an elective DELETE instruction outside `update/`. Inspection found it before deployment. A backup and evidence that the custom swatch had never been installed allowed deliberate cleanup of only that obsolete local key. This is **not** a recipe to delete generated keys generally, especially after deployment.

Some internal page/widget rows were visible as metadata identities but unavailable through a direct widget Table API query. Do not broaden privileges to obtain them. Verify available content fields, authenticated served frontend content and runtime behavior, and report the exact evidence boundary.

A hidden document can still execute a DOM-triggered handler and return real data while compositor screenshots, physical input and animation/reflow measurements are unreliable. Record functional and visual/accessibility results separately. Use standard browser tools; do not work around script-path or browser-profile security restrictions.
