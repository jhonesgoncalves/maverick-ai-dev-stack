# Publishing

Maverick is prepared for release but is not published by this repository.

1. Check the intended npm package name manually.
2. Run `npm login`, `npm whoami`, `npm pack --dry-run`, and `npm pack`.
3. Inspect the tarball, then run `npm publish --dry-run`.
4. Confirm version and licenses, then publish only with maintainer approval.
