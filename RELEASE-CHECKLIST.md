# Release checklist

Releases are automated by `.github/workflows/pipeline.yml`: every push to `main` that passes the quality gate is versioned, tagged, published to npm and released on GitHub, and the documentation is deployed afterwards.

## GitHub
- [ ] Repository created, described, and given appropriate topics and visibility
- [ ] Default branch, Actions, Pages (source: GitHub Actions), and repository URL configured
- [ ] Workflow permissions allow `github-actions[bot]` to push the release commit and tag to `main` (rulesets bypass it if `main` is protected)
- [ ] Environments `npm` and `github-pages` exist

## npm
- [ ] npm organization `maverick-ai` created (free for public packages); the package is `@maverick-ai/cli`
- [ ] First publish of a new package name done by a maintainer (`npm login`, then `npm publish` from the tagged release commit) or with the `NPM_TOKEN` secret (granular token with read and write on the `@maverick-ai` scope), because a trusted publisher can only be added to a package that already exists
- [ ] Trusted publisher configured on `@maverick-ai/cli`: user `jhonesgoncalves`, repository `maverick-ai-dev-stack`, workflow `pipeline.yml`, environment `npm`
- [ ] Publishing access set to require 2FA and disallow tokens once trusted publishing works; `NPM_TOKEN` secret removed
- [ ] `npm run release:dry` package contents audited

## Docs
- [ ] Local build and deploy action pass
- [ ] Pages URL, navigation, mobile layout, links, and SEO reviewed

## Release
- [ ] Commit messages follow Conventional Commits (`feat:` minor, `!`/`BREAKING CHANGE:` major, anything else patch)
- [ ] Tag, GitHub release, npm version, changelog, and installation test checked after the pipeline finishes
