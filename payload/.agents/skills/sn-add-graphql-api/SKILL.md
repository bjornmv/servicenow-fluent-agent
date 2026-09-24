---
name: sn-add-graphql-api
description: Author and secure a now-sdk 4.11 GraphQLApi with SDL, imported server resolvers, type resolvers, and schema/field ACLs.
argument-hint: <API name, namespace, schema fields, roles/security requirements>
---
Author a scripted ServiceNow GraphQL API with `GraphQLApi(...)`.

Use `now-sdk` directly in VS Code PowerShell; in Pi use the `now_sdk` tool with arguments and project `cwd`. See the [SDK command policy](../../reference/sdk-commands.md).

## Explain first

```powershell
now-sdk explain graphqlapi-api --format raw
now-sdk explain graphql-api-guide --format raw
```

Read `security-guide` when adding ACLs. Use the installed now-sdk 4.11+ docs as authoritative.

## Required design

1. Define SDL first. Small schema strings may be inline; prefer `Now.include('./schema.graphql')` for non-trivial SDL.
2. Call `GraphQLApi({...})`, never `new GraphQLApi()`.
3. Give the API and every resolver/type-resolver a stable `$id`.
4. Resolver and type-resolver `script` values use a named function imported from `src/server` (preferred) or `Now.include`. An inline function expression is a build error; avoid inline script strings for non-trivial logic.
5. Bind resolver `paths` as `Type:field`. Keep resolver names, paths, and type-resolver `typeName`s unique.
6. Resolver `env`: `getArguments()` / `getSource()`. Type-resolver `env`: `getArguments()` / `getObject()` / `getTypeName()`.

## Security guardrail

Keep `requiresAuthentication`, `requiresAclAuthorization`, and `requiresSncInternalRole` enabled unless the user explicitly requests and approves a weaker model. Add schema-gate ACLs through `enforceAcl`; add field ACLs as standalone `Acl({ type: 'graphql', operation: 'execute', ... })` records.

Field ACL names are runtime slash paths such as `/xSncMyApp/catalogGql/items/cost`, not `Type:field`. Set `contextualAclMaxDepth` at least as deep as every protected path; the application namespace and API namespace count as the first two segments. Never widen roles or lower security merely to make a query pass.

## Minimal shape

```typescript
import { Acl, GraphQLApi } from '@servicenow/sdk/core'
import { resolveItems } from '../../server/items-resolver'

const schemaGate = Acl({
    $id: Now.ID['gql_schema_gate'],
    type: 'graphql',
    name: 'catalogGql',
    operation: 'execute',
    roles: ['catalog_reader'],
})

GraphQLApi({
    $id: Now.ID['catalog_graphql'],
    name: 'Catalog GraphQL',
    namespace: 'catalogGql',
    enforceAcl: [schemaGate],
    schema: 'type Query { items: [String] }',
    resolvers: [{
        $id: Now.ID['items_resolver'],
        name: 'itemsResolver',
        paths: ['Query:items'],
        script: resolveItems,
    }],
})
```

Compute import paths from the actual `.now.ts` depth. Run `now-sdk build`; use **sn-build-install** for deployment/content verification. If runtime verification is requested, POST a least-privilege query to `/api/now/graphql` and report only requested fields—never secrets or unnecessary PII.
