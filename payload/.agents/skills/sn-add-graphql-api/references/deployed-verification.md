# Verifying a deployed GraphQL API

Read after an approved install through sn-build-install, or when the user asks for a runtime query.

## Content markers

sn-build-install's marker check applies with these GraphQL fields:

- SDL: `schema` on `sys_graphql_schema`.
- Bindings: `path` on `sys_graphql_resolver_mapping`.
- Scripts: `script` on `sys_graphql_resolver` / `sys_graphql_typeresolver`.

For an imported server function, that `script` is only a generated `require(...)` shim. The resolver body is in `content` on `sys_module`, whose `path` is `<scope>/<package.json name>/<package.json version>/src/server/<file>.js`. Query:

```text
pathSTARTSWITH<scope>/^pathENDSWITH/src/server/<file>.js
```

## Runtime query

- Send through [sn-rest](../../sn-rest/SKILL.md) as `--method POST --body-file` to `/api/now/graphql`. It is a POST, so that skill's approval gate applies to the exact instance, alias and body.
- Body: `{"query":"{ <application_namespace> { <namespace> { <fields> } } }"}` with only the fields needed.
- HTTP 2xx and an `ok:true` envelope are not success: read `data` and any `errors` in the returned body.
- A denied field resolves to `null`.
- A caller with the `admin` role overrides an `Acl` check unless that ACL sets `adminOverrides: false`. A query through an admin alias shows that the resolver runs, not that the ACLs restrict anyone. Report that limit; do not switch identity or change `adminOverrides` to test without separate approval.
- Report only requested fields, never secrets or unnecessary PII.
