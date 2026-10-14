# Minimal GraphQLApi shape

Read when writing a new `GraphQLApi` and the project has no existing one to follow. It shows a scoped role, a schema-gate ACL, a field ACL and an imported resolver.

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

`src/server/items-resolver.js`: `export function resolveItems(env) { return [/* items */] }`. Substitute this project's scope and application namespace, and compute import paths from the actual `.now.ts` depth.
