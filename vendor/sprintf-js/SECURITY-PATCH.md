# AbangTa security backport

Upstream sprintf-js 1.0.3 source (BSD-3-Clause license preserved), with a local
backport for GHSA-hp3w-g68c-fv3c. No patched upstream release was available.
The local version is not a published upstream release.

The formatter validates caller-controlled width and precision as nonnegative safe
integers capped at 10000 BEFORE conversion/padding. Formats are capped at 65536
characters before parsing. This preserves ordinary Jest/argparse help rendering
while preventing unbounded allocations from huge precision or padding values.

Local forks are not covered by registry advisory matching. Tests must verify both
ordinary formatting and oversized width/precision, including direct format ASTs.
Replace this backport when an official patched upstream release becomes available.

Upstream: https://github.com/alexei/sprintf.js
Advisory: https://github.com/advisories/GHSA-hp3w-g68c-fv3c
