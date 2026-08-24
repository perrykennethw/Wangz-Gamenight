# Repository Instructions

## Task and branch scope

- Keep one coherent outcome per Codex task and one GitHub issue per implementation branch or worktree.
- Continue in the same task for review feedback, CI failures, and corrections required by the current issue or pull request.
- Start a new task and worktree for a different issue, feature, audit, revert, or unrelated refactor.
- Base new implementation work on the latest `origin/main`, never on an unrelated feature branch.
- Use `issue-<number>-<short-description>` for issue branches. For other work, use a purpose prefix such as `feature/`, `fix/`, `chore/`, `docs/`, or `refactor/`.
- Never include Codex, agent, model, or other tool names in branch names.
- Do not modify `main` directly, merge a pull request, or expand the task beyond its stated outcome unless the user explicitly asks.
- Inspect the working tree before edits. Preserve unrelated tracked and untracked user work.

## Issue workflow

- Read the complete GitHub issue before implementation.
- Convert every acceptance criterion into a verification checklist.
- Keep changes required for the issue together; record unrelated discoveries as proposed follow-up work.
- Add or update tests when they materially protect the requested behavior.
- Keep the pull request in draft while any required criterion is incomplete, blocked, or intentionally deferred.
- Use `Closes #<number>` only when the implementation fully resolves the issue.

## Setup and verification

- Use Node.js 20.19 or newer and install dependencies with `npm ci` when needed.
- Run the most relevant focused tests first, followed by broader checks proportionate to the change.
- Run `npm run verify` before publishing repository changes when the full suite is feasible. It type-checks, builds, and runs every repository test script, including integration tests.
- At minimum, run `npm run typecheck` and `npm run build` for application changes.
- For user-interface work, verify the affected interaction in a browser. For responsive contestant work, include 320x568, 375x667, and 390x844 viewports when relevant.
- Before publishing, inspect `git diff`, run `git diff --check`, and inspect `git status --short --branch`.
- Do not publish when required validation fails unless the user explicitly directs otherwise. Report skipped checks and pre-existing failures accurately.

## Pull requests and completion

- Commit only task-related files and open a draft pull request unless the user requests a different state.
- Report the issue, branch, commit, acceptance checklist, exact validation, and pull-request URL.
- Keep follow-up work for that pull request in the same Codex task. After merge, return the local checkout to an updated `main` and clean up the merged task branch or worktree only after confirming it is safe.
