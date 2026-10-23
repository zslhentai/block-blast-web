# GitHub Pages deployment

## Release configuration

- Repository: https://github.com/zslhentai/block-blast-web
- Release branch: `work` (the existing `main` branch is not overwritten).
- Automatic workflow: `.github/workflows/deploy.yml`, on every push to `work`.
- Verification: reusable `tests.yml` runs frozen dependency install, TypeScript, unit tests, all three Chromium E2E profiles, blocked-script guard, and portable build/smoke check. E2E builds the production `dist/` first. A failed verification prevents deployment.
- Deployment: `actions/configure-pages@v5`, `actions/deploy-pages@v4`, `github-pages` environment, Pages write + OIDC permissions. Only `work` can execute the deployment job, including manual dispatches.
- Resources: Vite `base: './'`; the production JS/CSS references are relative. Local E2E uses `/block-blast-web/`, matching the expected Pages project path. No runtime CDN, backend, or external image resources are required.
- Expected address: https://zslhentai.github.io/block-blast-web/ — an expected address is not evidence that deployment succeeded.

## First-time repository settings

1. **Settings → Pages → Build and deployment → Source → GitHub Actions**.
2. **Settings → Actions → General**: allow the actions used by these workflows.
3. If **Settings → Environments → github-pages → Deployment branches and tags** restricts deployment, allow `work`. Keep any required reviewer approvals and approve the concrete deployment there if configured.
4. Push to `work`, or use **Actions → Deploy verified game to GitHub Pages → failed/pending run → Re-run all jobs** after correcting settings. The manual dispatch button may not appear until the workflow exists on the default branch; push deployment does not require that button.

The workflow checks Pages configuration rather than silently changing repository settings. It does not require a personal token in repository secrets. Changing `main` into the release branch later requires changing the push filter, deployment guard, and environment branch rule together.

## MVP provenance and rollback

Reviewed MVP history:

- `2737a7e`: import `haoliu-dev/block-blast-phone@8cf18eb45c4c4ea7b11283d55c51369e07d11ca4`.
- `c99eeb9`: complete and repair classic MVP.
- `03d7644`: record validation and limitations.

Root `LICENSE` is byte-identical to the upstream MIT text at all three commits: Copyright (c) 2026 Hao Liu. The in-game settings retain the full license. Source and fixed version are recorded in `docs/upstream/SOURCE.md`. The earlier research commit `d76194e` remains in history.

Deployment changes do not modify `src/`, `index.html`, game dependencies, or Vite's validated relative base. To undo a release, revert its relevant commit on `work` and push; verification and deployment run again. Do not force-push away the preserved MVP history. To temporarily stop publication, disable the deployment workflow from Actions.

## Verification boundaries

Local production-subpath E2E covers script readiness, real drag input, placement/clearing/scoring, restart, full save/reload, settings and responsive layouts. The blocked-script guard must observe a failed normal boot test when JavaScript is unavailable.

The iPhone/Android profiles are Chromium emulation, not real iPhone Safari or Android Chrome devices. A local pass does not establish a hosted-site pass. After deployment, separately inspect the actual HTTPS page and JS/CSS responses, play through dragging and clearing, restart, and reload saved progress at the public origin. Local preview and Pages use separate localStorage origins, so their saves do not transfer automatically.

Hosted offline reload/PWA caching remains outside this deployment change. Visual redesign, APK, game architecture, and game rules remain unchanged.

## Publication observations — 2026-10-23

Initial remote inspection: `main` pointed to `8750226`; no remote `work` branch existed. HTTPS Git access worked. The managed environment proxy rejected `api.github.com` and `zslhentai.github.io` with CONNECT 403. GitHub's public repository and Actions HTML returned 200, but the settings page was unavailable without an authenticated web session. Therefore neither Pages configuration nor the public game's availability was verified at this point.

The cloud environment network draft now includes `api.github.com` and `zslhentai.github.io` while preserving package-manager presets. Saving that draft does not activate it: review/save and publish it in the cloud environment settings before retrying API and public-site checks. This cloud setting is separate from GitHub's Pages Source setting.

### Push and actual GitHub Actions result

- Successfully pushed `work` at `26e9957d46fcfce66e81817154a20775fc5efc58`, preserving all three MVP commits and the earlier research commit. Remote `refs/heads/work` was checked with `git ls-remote`. No force push or change to `main`.
- Local `bun run check` passed again: typecheck, 57 unit tests, 33 production-subpath E2E tests, expected blocked-script failure guard, portable build and offline-play smoke check. E2E builds the production files; generated JS/CSS paths are `./assets/...`, the files exist, and the built JS retains the MIT license text.
- The push automatically triggered [deployment run 39957189838](https://github.com/zslhentai/block-blast-web/actions/runs/39957189838). Its `verify / verify` job passed and uploaded the Pages and portable-preview artifacts. The deployment failed in `actions/configure-pages@v5` with `Get Pages site failed ... Not Found` (Pages API 404), before `actions/deploy-pages` could publish. This is a publication/configuration failure, not a failed game test.
- First enable **Settings → Pages → Source → GitHub Actions**, then rerun the deployment or push to `work`. If an environment branch rule blocks the next attempt, allow `work` using the settings above.
- [Official configure-pages input definition](https://github.com/actions/configure-pages/blob/v5/action.yml) states that `enablement` requires a token other than `GITHUB_TOKEN`, with Pages/admin permissions. No personal token was copied into workflow files or secrets. The current API network restriction prevents performing the repository setup from this environment.
- Public gameplay, HTTPS asset responses, and public-origin storage could not be verified because `zslhentai.github.io` is blocked by the proxy. **No successful public deployment or publicly playable link is claimed.** The address above remains the expected destination. Real mobile-device testing is also still unverified.

This documentation update itself will trigger a new run on `work`; consult the [current deployment runs](https://github.com/zslhentai/block-blast-web/actions/workflows/deploy.yml) for the latest status. The original MVP validation JSON is retained as historical evidence, rather than rewriting its earlier `git_pushed: false` observation.
