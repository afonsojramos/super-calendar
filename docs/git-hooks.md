# Git hooks

Commit checks use hk, pinned in `mise.toml` and configured in `hk.pkl`.

## Install in each clone

For an existing Husky clone, first remove the repository-local `core.hooksPath` if it points into `.husky`: `git config --local --unset core.hooksPath`. Preserve unrelated custom hook paths.

```sh
mise install
mise exec -- hk install --mise
mise exec -- hk validate
```

Dependency installation does not install hooks. Repeat the hk installation in each independent clone. Linked worktrees share the repository's hook configuration.

## Run checks

```sh
mise exec -- hk check --all
mise exec -- hk fix
```

The pre-commit hook stashes unstaged and untracked work, checks the staged snapshot, and restores the saved work. It runs the existing whole-project formatting, lint, types, and Jest tests; it does not auto-fix files.

If restoring unstaged work fails, follow hk's recovery message and inspect the index, working tree, and saved stash before continuing.
