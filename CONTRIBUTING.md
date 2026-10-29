# Contributing to KDP Perfect

Thanks for helping! Bug reports, spec corrections, docs fixes and features are all welcome. By participating you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Quick start

```bash
git clone https://github.com/ontherisedigital/KDP-Perfect.git
cd KDP-Perfect
npm install
npm run dev            # UI in the browser (fastest feedback)
npm run dev:desktop    # UI inside the Electron shell
npm test               # unit tests
npm run typecheck
```

Requires Node.js 20+. Before opening a pull request run:

```bash
npm run typecheck && npm test && npm run build
```

For changes that touch `electron/` or file saving, also run `npm run smoke` (launches the real desktop app and checks the exported files).

## Ground rules

- **Specs are sacred.** KDP numbers live only in `src/core/specs.ts` (and `interior.ts`). Any change needs a source (calculator or KDP help URL) in the PR and an update to [docs/KDP-SPECS.md](docs/KDP-SPECS.md). If you can, add a test that fails without it.
- **Keep the core pure.** `src/core` must not touch the DOM, `window` or Node APIs (the one exception is `render/canvas.ts`, which only runs in the UI). Units are inches.
- **One scene, many renderers.** Visual changes belong in `src/core/scene.ts` so the preview, PNG, JPG and PDF stay identical.
- **No new runtime dependencies without discussion.** The bundle is small on purpose; open an issue first.
- **Electron stays locked down.** Don't enable `nodeIntegration`, widen the preload bridge, or loosen the CSP without a security discussion (see [SECURITY.md](SECURITY.md)).
- **Don't commit Amazon material.** The calculator, manuscript templates, Amazon Endure font and KDP PDFs are Amazon's property and are git-ignored. Do not paste their contents into the repo; derived *numbers* with a source are fine.

## Code style

- TypeScript `strict`; no `any`. Prefer small pure functions and explicit return types on exports.
- Match the surrounding code (formatting, naming, comment density). Comments explain *why*, not *what*.
- UI: vanilla DOM, accessible by default (labels, `aria-pressed`, keyboard focus, `prefers-reduced-motion`, light and dark themes).

## Tests

- New maths or rules → a test in `tests/` (golden values where a source exists).
- New scene elements → make sure the "everything stays inside the canvas" test still passes for all presets.
- Bug fixes → a regression test that fails before the fix.

## Commits and pull requests

- Short imperative commit subjects ("Fix spine text width for 79 pages"). Reference issues with `Fixes #123`.
- Keep PRs focused; describe *what* and *why*, include screenshots or an exported sample for visual changes, and tick the checklist in the PR template.
- Update `CHANGELOG.md` under **Unreleased**.

## Reporting bugs

Use the **Bug report** template and include: trim size, ink/paper, page count, app version, OS, and what you expected vs. saw. For a wrong measurement, link the KDP page or calculator cell that disagrees.

## Releasing (maintainers)

1. Update `CHANGELOG.md` and bump `version` in `package.json`.
2. Tag: `git tag v0.x.y && git push --tags`.
3. The **Release** workflow builds Windows and Linux packages and attaches them to a GitHub release.
