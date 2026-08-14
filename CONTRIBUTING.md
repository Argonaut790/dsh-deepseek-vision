# Contributing

Thank you for helping improve `dsh-deepseek-vision`.

## Before you start

- Use Node.js 22.19 or Node.js 24.
- Use Corepack-managed Yarn 1.22.22; do not use another package manager.
- For substantial changes, open an issue before investing significant effort.
- Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).
- Follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Development setup

```sh
corepack enable
corepack prepare yarn@1.22.22 --activate
yarn install --frozen-lockfile
```

Create a focused branch, make the smallest practical change, and add or update
tests for behavior changes.

## Verification

Run the same primary checks used by CI:

```sh
yarn typecheck
yarn build
yarn test
yarn pack --filename /tmp/dsh-deepseek-vision.tgz
```

The final command creates a local package archive for inspection; it does not
publish anything.

## Pull requests

Keep pull requests focused, explain the motivation and user-visible impact,
link related issues, and note any security or compatibility considerations.
Ensure generated build output and local configuration are not committed.

By contributing, you agree that your contributions are licensed under the
project's MIT License.
