# Components, tokens and SDK UI Page guides

Read when building a new surface, first using a component family, or when an SDK guide's rule conflicts with the project. Apply this order on every path:

1. The project's proven convention and approved contract.
2. For a new surface or the first use of a component family, the SDK's bundled guides. Read only the task-relevant sections, once, from the confirmed project directory with `now-sdk explain <topic> --format raw` ([command policy](../../../reference/sdk-commands.md)):
   - `ui-page-guide`: components, URL routing.
   - `ui-page-patterns-guide`: dirty state, CSS limits.
   - `ui-page-theming-guide`: Horizon `--now-*` tokens.

   When the project already depends on `@servicenow/react-components`, also read the component docs shipped in that package before use; props and events differ from React norms.
3. Semantic HTML where no supported component fits, the project already uses it, or the component family has not passed `sn-ui-page-vite`'s target-runtime compatibility gate.

Record a deviation from the guides in the contract.

The guides' absolutes (React 18.2.0, always `@servicenow/react-components`, never a build config) describe new pages on the default build. They never justify changing an existing project's React version, adding the library without approval, or removing the Vite files `sn-ui-page-vite` owns.
