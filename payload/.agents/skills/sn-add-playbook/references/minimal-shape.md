# Minimal PlaybookDefinition shape

Read when writing a new playbook and the project has no existing `PlaybookDefinition` to follow.

```typescript
import { ActivityDefinitions, PlaybookDefinition, wfa } from '@servicenow/sdk/automation'

PlaybookDefinition(
    { $id: Now.ID['intake_pb'], label: 'Intake', name: 'intake', parentTable: 'incident' },
    { triggers: [] },
    {
        lanes: () => {
            const review = wfa.playbook.lane({
                config: { $id: Now.ID['lane_review'], label: 'Review', name: 'review', order: 1, startRule: wfa.playbook.run.Immediately(), restartRule: 'RUN_ONLY_ONCE' },
                activities: () => {
                    const brief = wfa.playbook.activity(
                        ActivityDefinitions.Core.Instruction,
                        { $id: Now.ID['act_brief'], label: 'Brief', name: 'brief', order: 1, startRule: wfa.playbook.run.Immediately(), restartRule: 'RUN_ONLY_ONCE' },
                        { message: 'Review the record.' },
                    )
                    return { brief: brief }
                },
            })
            return { review: review }
        },
    },
)
```

For on-demand, the first argument drops `parentTable` and adds `executionType: 'on_demand'`, and the second becomes `{ permissions: () => ({ roles: [{ role: '<sys_user_role sys_id>', view: true, launch: true }] }) }`.
