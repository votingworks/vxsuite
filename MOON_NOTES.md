# Moon Notes

## Discoveries

- Moon can manage toolchains, i.e. nodejs/npm/rust/cargo.
- Moon assumes a monorepo with workspace settings and per-project settings.
- Tasks seem to be defined in projects under a `tasks` config key.
- Use e.g. `deps: ['^:build']` to make a task depend on a parent's tasks, in
  this example the `build` task.
- Moon CAN automatically figure out monorepo node package graphs, despite
  Claude's claim based on its research. So we don't need to specify `dependsOn`
  for standard `package.json`-based dependencies.
- Moon can use globs to specify projects within a workspace, but it doesn't seem
  to be able to just look at the whole package graph from `pnpm`. I've had to
  specify each project name/path that I want included in the root
  `.moon/workspaces.yml` file.
- Moon can specify tasks at the workspace level that are inherited by projects,
  largely obviating the need to specify per-project tasks.
- Specifying `inputs` and `outputs` for tasks seems to be the only way to make
  them use caching effectively.
- Using the `fileGroups` config lets you re-use glob sets across tasks, which is
  useful because otherwise they'd be duplicated among e.g. `build`, `lint`,
  `test`, etc.

## Questions

- Can I use `dependsOn` to declare explicit dependencies while also retaining
  implicit dependencies?
- What is the difference between `moon run` and `moon check`?
