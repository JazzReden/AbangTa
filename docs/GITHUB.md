# First GitHub push

The repository uses GitHub's README/security-policy conventions and Vercel's separation of contributor and security guidance:

- https://docs.github.com/en/repositories/creating-and-managing-repositories/best-practices-for-repositories
- https://github.com/vercel/next.js/blob/canary/contributing.md
- https://github.com/vercel/next.js/security/policy

## Before uploading

1. Run the checks in README.md. Review `git status --short` and `git diff --cached` before committing.
2. Confirm `.env`, `.env.local`, database exports, private uploads, build caches and `node_modules` are excluded. Preserve migration SQL and licenses.
3. Create an empty **private** GitHub repository initially. Set its remote using the URL GitHub provides, then commit and push from VS Code Source Control or Git.
4. Enable available secret scanning/push protection and Dependabot alerts in repository settings. Protect the default branch and require CI before merging when your GitHub plan supports it.
5. CI runs on pull requests and pushes to `main` using an isolated MySQL service. Its credentials are disposable test values, not deployment credentials. GitHub Actions has read-only repository permissions.

No deployment secrets are required for CI. Configure deployment environment values separately. Do not add an open-source license unless the owner chooses its terms; third-party licenses remain applicable to their assets and dependencies.
