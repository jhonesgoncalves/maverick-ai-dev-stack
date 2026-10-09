# Release checklist

Releases are automated by `.github/workflows/pipeline.yml`: every push to `main` that passes the quality gate is versioned, tagged, published to npm and released on GitHub, and the documentation is deployed afterwards.

## GitHub
- [ ] Repository created, described, and given appropriate topics and visibility
- [ ] Default branch, Actions, Pages (source: GitHub Actions), and repository URL configured
- [ ] Workflow permissions allow `github-actions[bot]` to push the release commit and tag to `main` (rulesets bypass it if `main` is protected)
- [ ] Environments `npm` and `github-pages` exist

## npm
- [ ] Trusted publisher configured on npmjs.com: user `jhonesgoncalves`, repository `maverick-ai-dev-stack`, workflow `pipeline.yml`, environment `npm`
- [ ] Package publishing access set to require 2FA and disallow tokens once trusted publishing works; `NPM_TOKEN` secret removed
- [ ] `npm run release:dry` package contents audited

## Docs
- [ ] Local build and deploy action pass
- [ ] Pages URL, navigation, mobile layout, links, and SEO reviewed

## Release
- [ ] Commit messages follow Conventional Commits (`feat:` minor, `!`/`BREAKING CHANGE:` major, anything else patch)
- [ ] Tag, GitHub release, npm version, changelog, and installation test checked after the pipeline finishes
