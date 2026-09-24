# Plain-language copy pass

Use for substantial copy changes or when the quick-path rules leave ambiguity. Every string should help identify, decide, act, understand consequences or recover. Otherwise remove it.

## Rules

- Name the operator's objects/outcomes, not internal tables, protocols or implementation phases. Use the project glossary and sentence case; preserve official product names/acronyms. Keep verbs/nouns consistent across navigation, review, confirmation and result.
- Headings name tasks/objects; buttons name concrete outcomes. Remove promotional claims (“seamless”, “effortlessly”, “with confidence”) and repeated title/eyebrow/subtitle information. Put instructions at the decision point.
- Preserve essential restrictions, permission boundaries, consequences and attestations. For sensitive denials, generic wording may be correct; friendliness must not disclose restricted records or fields.
- Error = affected task + established safe cause + recovery. Never infer permission denial from an ambiguous error or expose exceptions/stack traces.
- Distinguish empty collection, no matches, denied, initial-load failure, refresh failure and partial/uncertain success. A failed load is not “No records”; a lost write response does not prove failure.
- State count scope and actual policy limits accurately. A bounded snapshot is not an enterprise total. Use display labels; distinguish missing, not applicable and restricted where safe, without inventing values.
- Placeholders are optional examples, not labels. Keep essential hints persistent and associated. Accessible names should match visible wording and distinguish the record when necessary; include announcements in copy review.
- Use existing translations, pluralization and platform locale/time-zone preferences. Avoid concatenated sentence fragments. Test long translations and supported RTL; browser locale is not necessarily authoritative.

## Examples — adapt to the task

| Before | Better |
|---|---|
| ASSET INVENTORY / Explore assets / Find assets across your organization | All assets |
| Assets assigned to Morgan, all in one place | Assigned to: Morgan |
| Move equipment with confidence | Transfers |
| Preview first. Confirm once. | Remove; expose Review and Confirm in the actual flow |
| Choose a source to unlock destinations | Choose a source first |
| Read-only server review / server preview checks eligibility | Review transfer; explain specific unavailable items when known |
| No action available, or limit reached | The distinct, established reason for this action/item |
| We hit a snag | Assets couldn't be loaded. Try again. |
| Refresh failed (previous rows still visible) | Couldn't refresh assets. Showing the previous results. Try again. |
| No results | No assets match these filters. Clear filters. |
| Done (some updates failed) | 7 assets updated; 2 weren't updated. Review the remaining items. |
| Transfer failed (response lost) | Transfer status couldn't be confirmed. Check the result before trying again. |
| Print invoice (only generates a file) | Generate PDF; then Open PDF when ready |

For a substantial copy review, show **before -> after -> reason** for materially changed strings, including errors and accessible names. Keep it in the requested report/contract, not a mandatory second document. If an operator must read paragraphs to understand the next action, simplify the interaction before adding copy.
