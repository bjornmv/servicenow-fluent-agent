---
name: sn-add-graphql-api
description: Authors scripted GraphQL APIs in Fluent (schema, resolvers, ACLs). Use when adding, changing or securing one.
argument-hint: <API name, namespace, schema fields, roles/security requirements>
compatibility: ServiceNow Fluent project whose now-sdk documents GraphQLApi (explain graphqlapi-api succeeds); Node; authorized instance access for deployment.
metadata:
  version: '1'
---
Verified against: now-sdk 4.13.6 bundled docs and local `now-sdk build` output; not exercised on an instance.

Author a scripted ServiceNow GraphQL API with `GraphQLApi(...)`. Use `now-sdk` directly in the VS Code terminal (PowerShell on Windows; bash with the [`now-sdk` function](../../reference/sdk-commands.md#linux-and-vs-code-server-bash) on Linux) from the confirmed project directory (project `cwd`); see the [SDK command policy](../../reference/sdk-commands.md).

## Explain first

```powershell
now-sdk explain graphqlapi-api --format raw
now-sdk explain graphql-api-guide --format raw
now-sdk explain acl-api --format raw
```

bash (Linux, VS Code server):

```bash
now-sdk explain graphqlapi-api --format raw
now-sdk explain graphql-api-guide --format raw
now-sdk explain acl-api --format raw
```

Add `role-api` when declaring a role and `security-guide` for role/ACL design. The project's SDK docs are authoritative. If `explain graphqlapi-api` fails with `No matching topics` (non-zero exit), the project SDK has no `GraphQLApi`: stop, report the project SDK version and offer [sn-update-advisor](../sn-update-advisor/SKILL.md) for a separately approved upgrade. Do not author from another SDK's docs.

## Design

1. Read `now.config.json` and existing `GraphQLApi` source first: the scope drives the ACL path prefix and role names, and reusing a `namespace` already in the application is a build error.
2. Write the SDL first; inline only small schemas, otherwise `Now.include('./schema.graphql')`.
3. Call `GraphQLApi({...})`, never `new GraphQLApi()`. Give the API and every resolver/type resolver a stable `$id`.
4. Resolver/type-resolver `script`: prefer a named function exported from a module under `src/server` and imported into the `.now.ts`. An inline function expression is a build error. A string or `Now.include('./resolver.js')` is copied verbatim with no module wrapper, so that file must be a raw platform resolver script, not an `export function` module; the build does not catch the mix-up.
5. Bind resolver `paths` as `Type:field`. Keep resolver names, paths and type-resolver `typeName`s unique.
6. Resolver `env`: `getArguments()` / `getSource()`. Type-resolver `env`: `getArguments()` / `getObject()` / `getTypeName()`; a type resolver returns the concrete SDL type name.

Read [references/minimal-shape.md](references/minimal-shape.md) when the project has no `GraphQLApi` to copy.

## Security

- Keep `requiresAuthentication`, `requiresAclAuthorization`, and `requiresSncInternalRole` enabled unless the user explicitly requests and approves a weaker model.
- Schema-gate ACLs go in `enforceAcl`; field ACLs are standalone `Acl({ type: 'graphql', operation: 'execute', ... })` records named by runtime slash path such as `/xSncMyApp/catalogGql/items/cost`, not `Type:field`. The first segment is the application namespace, not the raw scope: in a scoped app the build derives it from the scope (`x_snc_my_app` → `xSncMyApp`) and silently ignores `applicationNamespace`; in global scope it is `now` unless `applicationNamespace` is set.
- Set `contextualAclMaxDepth` (default 4) at least as deep as every protected path, counting both namespaces as the first two segments; deeper fields are not ACL-checked.
- Gate on a `Role(...)` defined in this app and named `<scope>.<name>`, or on a role the user confirmed exists on the target. The build rejects an unprefixed `Role` name but never checks that a `roles` string exists.
- Never widen roles or lower security merely to make a query pass.

## Build and verify

Run `now-sdk build`; map errors with [sn-fix-build](../sn-fix-build/SKILL.md) (a resolver module missing or outside `src/server` gives `TS80`, plus `TS2307` if the file does not exist). A clean build does not validate the SDL, resolver `paths`, field ACL names or `contextualAclMaxDepth`, so compare the generated values with the source:

```powershell
Get-ChildItem -Path dist\app -Recurse -Filter 'sys_graphql_schema_*.xml' | Select-String -Pattern '<application_namespace>|<namespace>|<contextual_acl_max_depth>|<requires_'
Get-ChildItem -Path dist\app -Recurse -Filter 'sys_security_acl_*.xml' | Select-String -SimpleMatch -Pattern '<name>'
```

bash (Linux, VS Code server):

```bash
grep -rE --include='sys_graphql_schema_*.xml' '<application_namespace>|<namespace>|<contextual_acl_max_depth>|<requires_' dist/app
grep -rF --include='sys_security_acl_*.xml' '<name>' dist/app
```

In bash, grep exit 1 means no match; exit 2 is a command error, not a clean result.

- Except the schema-gate ACLs in `enforceAcl`, every GraphQL ACL `<name>` must start with `/<application_namespace>/<namespace>/` exactly as built (copy it; `x_1234567_my_app` becomes `x1234567MyApp`), have no more segments than `<contextual_acl_max_depth>`, and follow SDL field names.
- The three `<requires_*>` values must be `true` unless a weaker model was approved.

## Deploy and runtime

- Deploy only on request, through [sn-build-install](../sn-build-install/SKILL.md); do not install from this skill. For an imported resolver, the deployed body is `content` on `sys_module`, not the `require(...)` shim in `script`.
- Run a runtime query only on request, through [sn-rest](../sn-rest/SKILL.md). It is a POST, so that skill's approval gate applies to the exact instance, alias and body. An `admin` caller overrides any ACL without `adminOverrides: false`; do not switch identity or change `adminOverrides` without separate approval.
- Read [references/deployed-verification.md](references/deployed-verification.md) when verifying deployed content or running a runtime query.
