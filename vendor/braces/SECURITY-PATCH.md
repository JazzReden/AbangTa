# AbangTa security backport

This is the MIT-licensed upstream braces 3.0.3 source, with a local security
backport for GHSA-vfj7-8cjw-p6xm. It is NOT a published upstream release.

Changes: the iterative parser rejects nesting at 64 stack frames before building
an unsafe tree; recursive compile/stringify/expand walkers also enforce a depth
limit for caller-supplied ASTs. Ordinary glob behavior and upstream exports remain
unchanged. The application does not accept user-supplied build glob patterns.

The local version identifies this patched artifact, not an audit suppression.
Local packages are not covered by registry advisory matching: regression tests
must continue checking deep balanced/unbalanced/mixed patterns and direct ASTs.
Replace this backport with an official patched release when one is available.

Upstream: https://github.com/micromatch/braces/tree/3.0.3
Advisory: https://github.com/advisories/GHSA-vfj7-8cjw-p6xm
The original LICENSE is preserved.
