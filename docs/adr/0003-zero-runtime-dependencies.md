# No runtime dependencies, no network access

culori was available and declined; so was a UI framework. sRGB-OKLab-OKLCH
conversion is about forty lines of well-specified matrix maths that we need in
the hot loop of the quantizer, where a parse-by-string colour library would be
the slowest thing in the pipeline, and the UI is a handful of sliders, a canvas
and a select. Beyond bundle size, the point is the first goal: screenshots never
leave the device. With no runtime dependencies, no external fonts or CDNs, no
analytics, and a Content-Security-Policy meta tag setting `connect-src 'none'`,
that stops being a promise about how the code was written and becomes a property
of the page that anyone can verify in devtools.

## Consequences

The colour maths is ours to test, and it is unit-tested against known reference
values rather than trusted. Adding any runtime dependency later means revisiting
this decision, not just editing package.json: a dependency that fetches anything
breaks the stated guarantee. sharp and Vitest remain dev-only, and never ship.
