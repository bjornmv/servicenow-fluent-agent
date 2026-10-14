# `init` templates: layout and sample records

| Template | Use | Writes |
| --- | --- | --- |
| `typescript.basic` / `javascript.basic` | Fluent-only app | `src/fluent/` and `src/server/` |
| `javascript.react`, `typescript.react`, `typescript.vue` | Adds a sample full-stack UI page | `src/client/` and `src/fluent/ui-pages/` |
| `base` | Empty boilerplate | Config files only, no `src/` |
| `javascript.aiux` / `javascript.aiux-extension` | Lux/AIUX | Not this skill: use **sn-lux** for scaffold AND install (different install rules; `aiux-extension` prompts for extra parameters) |

A missing `src/` after asking for any template other than `base` means the wrong template was applied — stop, do not treat it as normal.

No template creates `src/scripts/` or `src/ui/`. Their absence after `init` is normal: they are this bundle's convention for `Now.include`'d record scripts. Create them on first use (`mkdir` when first externalizing a script).

## Sample records

The templates ship live sample records:

- `*.basic` writes `src/fluent/example.now.ts` (an active onLoad Client Script and an after-update Business Rule, both on `incident`) plus the `src/server/script.ts`/`.js` it imports.
- `*.react` / `*.vue` write a sample incident-manager UI page under `src/fluent/ui-pages/` and `src/client/`; the samples also embed the scope.

Removing a `*.basic` sample means removing the example and the script it imports together.
