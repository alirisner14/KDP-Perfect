# push-it profile: KDP Perfect

Read by the `push-it` skill. Keep it short and accurate.

- **Version:** `version` in `package.json` (and the matching top-level entries in `package-lock.json`; use `npm version <minor|patch|major> --no-git-tag-version`). Tags are annotated, `vX.Y.Z` (existing: `v0.1.0`).
- **Changelog:** `CHANGELOG.md`, Keep a Changelog style. Entries live under `## [Unreleased]`. On release rename it to `## [X.Y.Z] - YYYY-MM-DD`, add a fresh empty `## [Unreleased]` above it, and update the compare links at the bottom (`[Unreleased]: .../compare/vX.Y.Z...HEAD`, `[X.Y.Z]: .../compare/vPREV...vX.Y.Z`).
- **Tests:** `npm run typecheck` then `npm test`. No known exceptions. (`npm run smoke` exercises the real desktop app and is run after the build in step 7; it opens a window briefly.)
- **Build:** `npm run dist:win`. Output in `release\`: `KDP Perfect X.Y.Z.exe` (portable), `KDP Perfect Setup X.Y.Z.exe` (installer), `win-unpacked\KDP Perfect.exe`. Old versions' files in `release\` are left alone. The script uses the local Electron files because a plain build can fail on a Windows directory-rename lock.
- **Docs to keep in step:** `README.md` (the Status line and feature tables), `docs/USER-GUIDE.md`, `docs/KDP-SPECS.md`, `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`. Do not change `CODE_OF_CONDUCT.md` / `SECURITY.md` unless their text changed.
- **GitHub:** remote `origin` = https://github.com/alirisner14/KDP-Perfect (branch `main`). The `gh` CLI is not installed. Pushing a `v*` tag runs `.github/workflows/release.yml`, which builds Windows, macOS and Linux packages and creates the GitHub release **from the matching CHANGELOG section**, so no `gh release create` is needed. Check the run with the public API (`https://api.github.com/repos/alirisner14/KDP-Perfect/actions/runs`). Repository description changes are manual (no tool for it).
- **Never commit:** anything Amazon-owned in the project root (calculator `.xlsm`, `KDP_*.pdf`, the Amazon Endure font and template folders). They are in `.gitignore`.
- **Shortcut:** `KDP Perfect.lnk` on the Desktop (`[Environment]::GetFolderPath('Desktop')`, which is the OneDrive Desktop) pointing at `release\win-unpacked\KDP Perfect.exe`. The user's own `KDP Perfect 0.1.0.exe - Shortcut.lnk` is theirs: never touch it.
- **Manual after a release:** none. (Dependabot PRs on GitHub are the user's to merge.)
