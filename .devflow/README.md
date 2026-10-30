# DevFlow V3 · experimental contract

The product uses a canonical eight-stage lifecycle. `workflow.json` defines stable phase IDs, document conventions, and skippable phases. UI stage topology is locked. `state.json` is a proposed per-feature machine-readable state file; it is **not yet loaded from target repositories by the Dashboard**. The current Dashboard still tracks manual status by Git branch in its configuration repository.

## Current guarantees
- New projects default to the V3 stage template; previously saved custom flow configurations are not silently migrated.
- The Dashboard can migrate an old configuration to V3 after explicit confirmation, preserving a backup and without writing to the target repository.
- The page presents stages read-only; optional stages may be manually marked skipped per branch. This is not an agent approval.
- Stage documents may be marked needed, later, or not needed, and status can be manually updated.

## Next milestones
1. Validate and load `.devflow/workflow.json`, `state.json`, and artifact indexes from selected target repositories.
2. Add a per-feature view and human approval gate state with evidence checks.
3. Map to OpenSpec artifacts, and add documented Agent Skills.
4. Add permission-scoped writes only with explicit confirmation; retain target read-only mode by default.

This is a project-specific experimental contract, not a universal standard or complete agent execution protocol.
