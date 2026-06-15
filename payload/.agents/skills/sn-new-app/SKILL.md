---
name: sn-new-app
description: Scaffold a new scoped ServiceNow Fluent app with now-sdk init. Use when starting a brand-new app in an empty workspace (no now.config.json), or when the user asks to create/scaffold a new scoped application.
argument-hint: <app name> (scope + short-desc collected interactively)
---
Scaffold a new scoped ServiceNow Fluent app. Examples below show `node "$NowSdk" <cmd>` — define `$NowSdk` on the same PowerShell line as each command: `$NowSdk = if (Test-Path 'node_modules\@servicenow\sdk\bin\index.js') { 'node_modules\@servicenow\sdk\bin\index.js' } else { Join-Path $env:APPDATA 'npm\node_modules\@servicenow\sdk\bin\index.js' }; node "$NowSdk" <cmd>`.

Collect: app name, scope (`x_<org>_<feature>`), short description — from the argument/conversation.

## Prereqs
- OAuth must be configured first — `init` needs an authenticated instance to reserve the scope. If no alias exists, run the **sn-auth** skill (`node "$NowSdk" auth --add https://<instance>.service-now.com`, choose `oauth`, set an alias, browser login, Accept, paste code). Re-run `auth --add` once only after an SDK upgrade that crosses a keychain-library change (happened once, at 4.3; stable since — see **sn-auth**); if the workspace has `node_modules/@servicenow/sdk`, upgrade that local SDK first with `npm.cmd install "@servicenow/sdk@latest"` because the resolver uses project-local SDKs before the global SDK.

## Steps
1. Scope naming: enforce `x_<vendor_prefix>_<feature>` — lowercase, underscores only, no spaces. **The vendor prefix is instance-bound, NOT freely chosen** — on a PDI it is the numeric account code (e.g. `x_1535598_`). A wrong-prefix scope scaffolds AND builds fine, then fails much later at install with an obscure error ("application was null"). Resolve the prefix FIRST:
   ```powershell
   $SnRest = Join-Path $env:USERPROFILE '.agents\skills\sn-rest\sn-rest.js'; node "$SnRest" --alias <alias> --instance https://<instance>.service-now.com "/api/now/table/sys_properties?sysparm_query=name=glide.appcreator.company.code&sysparm_fields=value"
   ```
   The scope MUST start with `x_<that value>_`. If `init` warns the scope "does not start with your instance's vendor prefix", treat it as a STOP condition — fix the scope; do not proceed (the warning is non-blocking but the later install failure is not). **Scope is capped at 18 characters total** including the `x_` prefix; `init` rejects longer values. The `x_acme_*` values in the examples below are illustrative only. Validate + fix before proceeding.
2. **Preferred — non-interactive `init`** (skips every prompt; same flags work for `init` and `init --from`):
   ```powershell
   $NowSdk = if (Test-Path 'node_modules\@servicenow\sdk\bin\index.js') { 'node_modules\@servicenow\sdk\bin\index.js' } else { Join-Path $env:APPDATA 'npm\node_modules\@servicenow\sdk\bin\index.js' }; node "$NowSdk" init --auth <alias> --appName "My App" --packageName my-app --scopeName x_acme_my_app
   ```
   - `--packageName` follows npm naming (lowercase, hyphens).
   - `--scopeName` is the `x_<vendor_prefix>_<feature>` value (instance-bound prefix — see step 1), capped at 18 chars.
   - `--appName` is the human-readable name.
   - Optional: `--template <name>` to start from a built-in template.
   - Auth alias → must already exist; see Prereqs. `init` reserves the scope on the instance over that auth, so a working alias is mandatory.
3. Fallback — interactive: run `node "$NowSdk" init` in the workspace root. Print the command first. Use sync terminal mode with a generous timeout; answer one prompt at a time with `send_to_terminal`, reading the next prompt before sending the next answer. Prompts: App name, Package/scope name, Short description, Auth alias.
4. **Install npm dependencies** — `init` writes `package.json` but does not install. `build` and any further skill calls require the local `node_modules`:
   ```powershell
   npm.cmd install
   ```
   This populates `node_modules/@servicenow/sdk` (the resolver will prefer it over the global SDK from now on).
5. Verify the scaffold landed:
   - `now.config.json` exists at root and its `scope` matches the chosen value.
   - `src/fluent/` exists for `*.now.ts` declarative records (`javascript.basic`/`typescript.basic` templates; the `base` template creates config files only — no `src/` at all, which is normal for it).
   - NO template creates `src/scripts/` or `src/ui/` — their absence after `init` is NORMAL, not a failed scaffold. They are this bundle's convention for `Now.include`'d record scripts: create them on first use (`mkdir` when first externalizing a script). The SDK's own templates put example code in `src/server/` (and `src/client/` in the react/vue templates).
   - `node_modules/@servicenow/sdk/bin/index.js` exists (proves the install ran).
6. Report `now.config.json` contents + the created `src/` layout. Do NOT author records yet — use the per-record skills (sn-add-table, sn-add-business-rule, …).
