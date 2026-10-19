---
name: sn-explain
description: Looks up Fluent record types, field types and SDK topics with now-sdk explain. Use when about to author a record type; not product docs (sn-doc-lookup).
argument-hint: <record type or topic, e.g. business rule, table, catalog item>
compatibility: ServiceNow Fluent project and its installed SDK documentation; now-sdk explain is a local read-only lookup through the approved SDK launcher and needs no instance access or authentication.
metadata:
  version: '1'
---
Verified against: now-sdk 4.13.6 and 4.11.2 `explain` runs; the project's installed SDK is authoritative.

Look up the SDK docs for the requested type/topic and report how to author it. Run `now-sdk` in the VS Code terminal (PowerShell on Windows; bash with the `now-sdk` function on Linux) from the confirmed project directory (project `cwd`), per the [SDK command policy](../../reference/sdk-commands.md). The commands below are identical in bash.

**Always pass `--format raw`** — `pretty` adds ANSI codes that waste tokens.

1. **Exact topic names only.** Take the name from [topic names](references/topics.md) or from `--list`. Read that file when you do not already know the exact name, after an SDK version change, or when the task first touches a foundational topic (`keys-file`, `Now.include`, `Now.ref`, `$override`, `now.config.json`). Hyphenation is inconsistent (`businessrule-api` vs `business-rule-guide`). A bare keyword is not rejected: `explain table` prints `# Multiple matching topics for "table":` (a candidate list, not documentation) and `explain schedule` prints the whole `sla-api` document, both exit 0. Check that the first heading is the type you asked for.
   - `now-sdk explain --list "<keyword>" --format raw` — `# Matching topics:` then `# Possibly related topics:`. Quote multi-word keywords (unquoted, the second word fails as `Unknown command`) and prefer the spaced phrase: `--list "service catalog"` finds `catalogitem-api` and the variable APIs; `--list service-catalog` finds only flow-trigger topics. Never run `--list` without a keyword (about 260 topics).
   - `now-sdk explain <topic> --peek --format raw` — one-line summary to choose among 2–3 candidates.
2. **`-api` for the data shape:** `now-sdk explain <recordtype>-api --format raw` with the exact name, never a guessed `<keyword>-api` (`service-catalog-api` does not exist). Types without a dedicated API (field style, schedule entry) use `record-api`; their table and field-name sources are in [topic names](references/topics.md).
3. **`-guide` only when needed:** net-new records or complex composition (catalog items, flows, SP pages, scripted REST, security). Skip for simple edits or another X on an existing table.
4. **Tables:** always read the `*column-api` (`--list column`) for each non-trivial column type; skip it for a simple column only when the current `table-api` output already shows its exact shape. Never infer properties from a name.
5. **Report** tersely from the ACTUAL output (do NOT invent fields), citing the exact topic names read:
   - Required properties and key optional ones.
   - Syntax class: ordinary record, documented callback DSL, GraphQL imported-script form, or transformed/Fluent-locked automation.
   - A minimal, correct `.now.ts` snippet for the project scope from `now.config.json`. Ordinary script bodies use `Now.include` or, where `script` accepts a function, a named function imported from a server module (follow the project's form); GraphQL prefers named imported server functions; `Test`, automation and Playbook callbacks stay inline as DSL. Use primitives, `{ label }` choices, matching Table exports, `SPPage.pageId`, stable `$id`s, no unused bindings; never `new TestSuite()` or `new GraphQLApi()`. See [Fluent rules](../../instructions/fluent.instructions.md).

This skill does not authorize source edits or deployment. For authorized record creation continue with [sn-add-record](../sn-add-record/SKILL.md); GraphQL, Playbook, ATF suite and Vite UI Page authoring stay in their own skills; ATF execution is separate and approval-gated ([sn-cicd](../sn-cicd/SKILL.md)).

## Missing topic or older SDK — stop branch

Other skills point here when `explain` does not return the documentation they name.

1. **Recognize the miss.** None of these is documentation; never summarize or author from them:
   - An unknown topic: `[now-sdk] ERROR: No matching topics for "<name>"`, exit 1.
   - `--list` with no hit: `# No matches found.`, exit 0.
   - A `# Multiple matching topics` list, or a document whose heading is a different type.

   A launcher or terminal error (function not found, no exit status) is not a missing topic: the result is UNKNOWN; follow the SDK command policy.
2. **One bounded rediscovery.** Ignore the error's hint to run bare `now-sdk explain --list`. Run `now-sdk explain --list "<keyword>" --format raw` with the spaced phrase, then at most once more with one distinctive word, and read the exact topic it names.
3. **Still missing: the SDK that ran does not document it** (the launcher prefers the project-local SDK; topic sets grow between releases). Run `now-sdk --version`, then STOP authoring that type and report the topic name, keywords tried and SDK version. Do not write the shape from memory, another SDK version's docs, a sibling type, or type/constructor names.
4. **Offer, do not choose:**
   - (a) An SDK upgrade, which needs explicit scope/version approval (a global upgrade does not change a project pin; see the SDK command policy and the **sn-update-advisor** skill).
   - (b) The generic `Record()` form, only after reading `record-api`, with field names from evidence such as an authorized read-only dictionary lookup through the **sn-rest** skill, stated as a fallback without the dedicated API's type safety.
   - (c) Leaving the record out of scope.

   [sn-doc-lookup](../sn-doc-lookup/SKILL.md) answers product-behaviour questions; it is not a source for Fluent field shapes.
