# Lux (AIUX): validated lessons and conditional remedies

## Evidence boundary

A small standalone, read-only incident demo was built and installed during 2026-09-08 using SDK 4.11.0, AIUX 22.42.3, Lit 3.3.2, npm 11.6.2 and Node 25.2.1. Forty-one project tests passed, and a signed-in session hydrated the page, loaded a bounded snapshot, filtered locally and refreshed through its UI handler. Those are historical results, not tests of a new app or this skill distribution.

Visible-window, physical keyboard, 320px reflow, high contrast, real failure/retry and unauthorized-user runtime acceptance were incomplete. The hidden-window 320px attempt measured a zero-width widget; do not reuse that result as responsive approval. No impersonation was performed.

Node 24 LTS >=24.15.0 was recommended, not validated there. A transitive dependency declared Node 20/22/24 support rather than Node 25. The local production-dependency audit had 11 high and 1 moderate findings (including meta-vulnerability entries), plus deprecations. This is not a clean security baseline or proof that the instance's existing platform assets share the same dependency tree. Reassess current versions/reachability before wider use; do not freeze those counts as current forever.

## Dependency installation and Windows commands

A scaffold manifest is not an installed dependency tree. Prefer the project's existing manager/lockfile. The separate npm installation's JavaScript CLI worked through Node without changing policies or retrying the blocked pnpm launcher.

Resolve the real Node/npm/SDK locations rather than hardcoding a maintainer's profile. A common Windows layout is `<node-directory>/node_modules/npm/bin/npm-cli.js`; confirm it exists and read its package metadata. Use it only when permitted. A direct Node command is a normal entry point, not authorization to evade an explicit policy denial. If denied, stop for an approved path.

For npm, use `ci --ignore-scripts` with an existing valid lockfile or `install --ignore-scripts` when creating one. Review and pin versions, preserve the lockfile, review needed hooks individually and inspect audit findings separately. `ignore-scripts` skips the official skill-copy postinstall as well as native dependency hooks; read any setup script before running it manually.

## Windows asset 404

**Symptom:** SSR heading/shell appears, but the page/widget never hydrates or makes its RPC. A script URL returns 404. Generated `component_compile_metadata.asset` contains e.g. `home\\page-hash.js` instead of `home/page-hash.js`.

Check actual asset fields and network responses first. Missing dependencies, authorization failures and arbitrary module 404s are not automatically this bug.

For the confirmed 22.42.3 metadata shape, reviewed templates are provided:

- [now.prebuild.mjs](../assets/now.prebuild.mjs) → app root `now.prebuild.mjs`
- [normalize-aiux-assets.mjs](../assets/scripts/normalize-aiux-assets.mjs) → app `scripts/normalize-aiux-assets.mjs`

Do not overwrite an existing hook/helper. Review compatibility, merge existing steps, and register the hook in `now.config.json` only if needed:

```json
{"scripts": {"prebuild": "now.prebuild.mjs"}}
```

The hook replaces the default UI prebuild with a call to the same public `buildManifestAndMetadata` API and SDK-provided filesystem/Rollup. It normalizes only the `asset` property within the generated `component_compile_metadata` and `isolate_compile_metadata` JSON fields **before** Fluent XML generation. It leaves JavaScript, source maps, IDs and other fields untouched. It does not patch vendor code, remove tombstones, install packages or deploy.

The normalizer fails on malformed/unsupported targeted metadata and unsafe absolute/traversal paths. Already-portable paths are unchanged. Check the current SDK task API and metadata shape before adapting it to another version; do not assume it is needed forever or run a second default build after normalization.

Rebuild, assert no backslashes in emitted URL-valued asset fields, inspect the full payload, then obtain deployment approval. Verify a served HTTP-200 asset body plus actual custom-element registration after install. Do not manually patch generated XML or globally replace backslashes in JSON/JavaScript.

## Native gallery prefetch

**Symptom:** native cards render but log:

```text
getUserPreference('glide.ui.accessibility.show_hidden_controls') was not pre-fetched
```

Inspect the current component's requirements and generated `required_user_preferences`. The tested SDK detects literal getter calls in source. A confirmed workaround was a literal read from the public AIUX **core** API in the widget's gallery-rendering path:

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
