# Marker field per record type

Read when choosing which live field to read for the content-marker check. Read only that field, and pick a literal from the changed source that exists only in the new version.

- Server scripts: `script` on `sys_script`, `sys_script_include`, `sys_ui_action`, etc.
- ACLs: `script` / `condition` on `sys_security_acl`.
- Email notifications: `message_html` / `subject` on `sysevent_email_action`.
- Service Portal: `template` / `script` / `client_script` / `css` on `sp_widget` and on `sp_header_footer` (inherited from `sp_widget`); `css` on `sp_css`.
- UI Pages: `html` / `client_script` / `processing_script` on `sys_ui_page`. For a built React page `html` holds only the built HTML entry; see **sn-ui-page-vite** for where bundled TSX text lands.
- GraphQL: `schema` on `sys_graphql_schema`, `path` on `sys_graphql_resolver_mapping`; for an imported server function the resolver `script` is only a generated `require(...)` shim and the body is in `content` on `sys_module` (see **sn-add-graphql-api**).
- Playbooks: `label` / `status` on `sys_pd_process_definition`. Build and install never activate a playbook; report Playbook Designer activation as an outstanding manual step (see **sn-add-playbook**).
- Records with no script body (properties, columns, modules, roles, choices): read the changed field itself, for example `value` on `sys_properties` by `name`, and compare it with the new source value.

## Flows and custom actions

Step content is a gzipped+base64 `values` blob on the instance AND in the build XML, so no marker search works in either place. Read the header instead, by the sys_id in `src/fluent/generated/keys.ts`:

- `status,active,master_snapshot,latest_snapshot` on `sys_hub_flow`
- `state,active,master_snapshot,latest_snapshot` on `sys_hub_action_type_definition`

A flow is published only when the live row shows `status` published and `active` true. Report the values read, and prove behaviour by exercising the flow.
