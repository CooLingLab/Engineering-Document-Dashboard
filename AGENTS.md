# Agent instructions

This repository is the Engineering Document Dashboard application. Before changing code, read README.md and .devflow/workflow.json and .devflow/state.json.

The dashboard currently reads target GitHub repositories without writing to them. Do not change that security boundary without explicit user approval. Do not store credentials or private document content in tracked files.

Treat .devflow/state.json as a declared plan, not proof of implementation. Never mark a gate approved or a feature complete without evidence and required human approval. Update state only when the corresponding work was actually performed.

Run npm run typecheck, npm test, npm run build and npm run check:dist when changing application code. Report failures and limitations honestly.
