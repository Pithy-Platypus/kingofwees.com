# kingofwees.com

Rules stay *in* CLAUDE.md files; references point outward to elaboration only. A pointer is not a load — anything that must change behaviour is stated here, not cited from here.

**Orientation** → Folders should contain a README.md that contains the orientation for that folder.

**Elaboration** → `docs/patterns/` (the incident, the measurement, the rejected alternative). Read before *changing* a rule, not before following one.

**Per-area constraints** → nested `CLAUDE.md`, loaded automatically when reading files in that directory.

**Treat compiler warnings as part of the change.** After a refactor that renames symbols, fully-qualifies names, removes call sites or deletes a method, run `(cd ~/repos/kingofwees.com/source && dotnet clean && dotnet build)` OR the react/vite equivalent and resolve every new warning. Each phase lands warning-free; don't batch cleanup. When removing a method from an interface or public type, build **before** touching tests: the compiler errors reveal every cross-cutting caller.

Update in the same commit as the change:

- **`PLAN.md`** — flip a step's status marker when it starts and when it finishes, and rewrite the handoff prompt at every stop. Wallie reads it to see what's done; a stale marker reads as true.
- **`CLAUDE.md` files** — constraints only, for the agent. A rule earns a place only if acting without it produces a wrong result that looks right. Orientation goes to a README; incidents and measurements go to `docs/patterns/`.
- **READMEs** (`source/`, `docs/patterns/`, `infra/`) — for humans: orientation, setup, inventories, routing tables. `source/README.md` also needs updating when you add a service or contract type, change a project reference, or add a frontend module.
- **`docs/`** — (where documenation should reside), `patterns/` (why rules exist;)
