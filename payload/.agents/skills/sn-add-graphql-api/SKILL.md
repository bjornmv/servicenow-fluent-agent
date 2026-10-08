---
name: sn-add-graphql-api
description: Use when adding, changing or securing a scripted GraphQL API in a Fluent project with GraphQLApi, covering the SDL schema, resolvers, type resolvers, and schema-gate and field ACLs.
argument-hint: <API name, namespace, schema fields, roles/security requirements>
compatibility: ServiceNow Fluent project whose now-sdk documents GraphQLApi (explain graphqlapi-api succeeds); Node; authorized instance access for deployment.
metadata:
  version: '1'
---
Verified against: now-sdk 4.13.6 bundled docs (`graphqlapi-api`, `graphql-api-guide`, `acl-api`, `role-api`) and local `now-sdk build` output for the shape below; not exercised on an instance. On another SDK version the project's own `explain` output is authoritative.
Author a scripted ServiceNow GraphQL API with `GraphQLApi(...)`.

Use `now-sdk` directly in VS Code PowerShell from the confirmed project directory (project `cwd`). See the [SDK command policy](../../reference/sdk-commands.md).

## Explain first

```powershell
now-sdk explain graphqlapi-api --format raw
now-sdk explain graphql-api-guide --format raw
now-sdk explain acl-api --format raw
```

Also read `role-api` when declaring a role and `security-guide` for role/ACL design. Use the target project's installed SDK docs as authoritative. If `explain graphqlapi-api` fails with `No matching topics` (non-zero exit), the project SDK has no `GraphQLApi`: stop, report the project SDK version and offer [sn-update-advisor](../sn-update-advisor/SKILL.md) for a separately approved upgrade. Do not author from another SDK's docs.

## Required design

1. Read `now.config.json` and existing `GraphQLApi` source first: the scope drives the ACL path prefix and role names, and a `namespace` already used in the application is a build error.
2. Define SDL first. Small schema strings may be inline; prefer `Now.include('./schema.graphql')` for non-trivial SDL.
3. Call `GraphQLApi({...})`, never `new GraphQLApi()`.
4. Give the API and every resolver/type-resolver a stable `$id`; names can change, and `$id` keeps updates attached to the same record.
5. Resolver and type-resolver `script` values use a named function exported from a module under `src/server` and imported into the `.now.ts` (preferred). An inline function expression is a build error. A string or `Now.include('./resolver.js')` is copied verbatim into the resolver record with no module wrapper, so that file must be a raw platform resolver script, not an `export function` module; the build does not catch the mix-up. Avoid script strings for non-trivial logic.
6. Bind resolver `paths` as `Type:field`. Keep resolver names, paths, and type-resolver `typeName`s unique.
7. Resolver `env`: `getArguments()` / `getSource()`. Type-resolver `env`: `getArguments()` / `getObject()` / `getTypeName()`; a type resolver returns the concrete SDL type name.

## Security guardrail

Keep `requiresAuthentication`, `requiresAclAuthorization`, and `requiresSncInternalRole` enabled unless the user explicitly requests and approves a weaker model. Add schema-gate ACLs through `enforceAcl`; add field ACLs as standalone `Acl({ type: 'graphql', operation: 'execute', ... })` records.

Field ACL names are runtime slash paths such as `/xSncMyApp/catalogGql/items/cost`, not `Type:field`. The first segment is the application namespace, not the raw scope: in a scoped app the build derives it from the scope (`x_snc_my_app` → `xSncMyApp`) and silently ignores an explicit `applicationNamespace`; in global scope it is `now` unless `applicationNamespace` is set. Set `contextualAclMaxDepth` (default 4) at least as deep as every protected path; the application namespace and API namespace count as the first two segments, and deeper fields are not ACL-checked.

Gate on a `Role(...)` defined in this app and named `<scope>.<name>`, or on a role the user confirmed exists on the target; the build rejects a `Role` whose name lacks the scope prefix but accepts any role string in `roles` without checking that the role exists. Never widen roles or lower security merely to make a query pass.

## Minimal shape

```typescript
import { Acl, GraphQLApi, Role } from '@servicenow/sdk/core'
import { resolveItems } from '../../server/items-resolver'

const reader = Role({ name: 'x_snc_my_app.catalog_reader' })
const costReader = Role({ name: 'x_snc_my_app.catalog_cost_reader' })

const schemaGate = Acl({
    $id: Now.ID['gql_schema_gate'],
    type: 'graphql',
    name: 'catalogGql',
    operation: 'execute',
    roles: [reader],
})

Acl({
    $id: Now.ID['gql_cost_field'],
    type: 'graphql',
    name: '/xSncMyApp/catalogGql/items/cost',
    operation: 'execute',
    roles: [costReader],
})

GraphQLApi({
    $id: Now.ID['catalog_graphql'],
    name: 'Catalog GraphQL',
    namespace: 'catalogGql',
    enforceAcl: [schemaGate],
    schema: 'type Item { name: String cost: Float } type Query { items: [Item] }',
    resolvers: [{
        $id: Now.ID['items_resolver'],
        name: 'itemsResolver',
        paths: ['Query:items'],
        script: resolveItems,
    }],
})
```

`src/server/items-resolver.js` exports the imported function: `export function resolveItems(env) { return [/* items */] }`. Replace `x_snc_my_app` / `xSncMyApp` with this project's scope and application namespace, and compute import paths from the actual `.now.ts` depth.

## Build and verify

Run `now-sdk build`; map errors with [sn-fix-build](../sn-fix-build/SKILL.md). A resolver module that is missing or outside `src/server` fails the build (`TS80`, plus `TS2307` when the file does not exist), but a clean build does not validate the SDL, that resolver `paths` exist in it, field ACL names, or `contextualAclMaxDepth`. After a clean build, read the generated values and compare them with the source:

```powershell
Get-ChildItem -Path dist\app -Recurse -Filter 'sys_graphql_schema_*.xml' | Select-String -Pattern '<application_namespace>|<namespace>|<contextual_acl_max_depth>|<requires_'
Get-ChildItem -Path dist\app -Recurse -Filter 'sys_security_acl_*.xml' | Select-String -SimpleMatch -Pattern '<name>'
```

Apart from the schema-gate ACLs referenced by `enforceAcl`, every GraphQL ACL `<name>` must start with `/<application_namespace>/<namespace>/` exactly as built (copy the prefix; a scope such as `x_1234567_my_app` becomes `x1234567MyApp`), have no more segments than `<contextual_acl_max_depth>`, and follow field names present in the SDL. The three `<requires_*>` values must be `true` unless a weaker model was approved.

When deployment is requested, use [sn-build-install](../sn-build-install/SKILL.md); do not install from this skill. Its marker check applies with these GraphQL fields: SDL in `schema` on `sys_graphql_schema`; bindings in `path` on `sys_graphql_resolver_mapping`; scripts in `script` on `sys_graphql_resolver` / `sys_graphql_typeresolver`. For an imported server function that `script` is only a generated `require(...)` shim: the resolver body is in `content` on `sys_module`, whose `path` is `<scope>/<package.json name>/<package.json version>/src/server/<file>.js` (query `pathSTARTSWITH<scope>/^pathENDSWITH/src/server/<file>.js`).

If runtime verification is requested, send the query through [sn-rest](../sn-rest/SKILL.md) as `--method POST --body-file` to `/api/now/graphql`; it is a POST, so that skill's approval gate applies to the exact instance, alias and body. The body is `{"query":"{ <application_namespace> { <namespace> { <fields> } } }"}` with only the fields needed. HTTP 2xx and an `ok:true` envelope are not success: read `data` and any `errors` in the returned body. A denied field resolves to `null`, and a caller with the `admin` role overrides an `Acl` check unless that ACL sets `adminOverrides: false`, so a query through an admin alias shows that the resolver runs, not that the ACLs restrict anyone. Report that limit; do not switch identity or change `adminOverrides` to test without separate approval. Report only requested fields—never secrets or unnecessary PII.
