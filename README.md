# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## Branch Protection

The `master` branch is intended to be protected — direct pushes blocked, all changes via pull requests with a passing build check.

### Current enforcement

| Layer | Mechanism | Catches |
|-------|-----------|---------|
| CI gate | `.github/workflows/deploy.yml` runs `npm run build` on every PR; deploy step is skipped on PRs and runs only on master pushes (PR #101) | Silent build breaks before merge |
| Local | `scripts/pre-push-master-block.sh` installed as a git pre-push hook | Direct `git push origin master` from a developer machine |

### Install the local hook

```sh
cp scripts/pre-push-master-block.sh .git/hooks/pre-push
chmod +x .git/hooks/pre-push
```

Override in genuine emergencies with `git push --no-verify`.

### Future: GitHub-level enforcement

GitHub branch protection / rulesets do not enforce on private personal-account repos under the free plan. When this repo migrates to a GitHub Team organization account, configure a ruleset for the `master` branch with:

- Enforcement: Active
- Target: default branch
- Rules: Restrict deletions; Block force pushes; Require a pull request before merging; Require status checks to pass (required check: `deploy`)

This locks down the same intent at the platform layer.
