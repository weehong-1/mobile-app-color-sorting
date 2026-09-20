# The pipeline works in Display P3, not sRGB

Both reference screenshots are tagged Display P3 (`iCCP: kCGColorSpaceDisplayP3`,
`cICP` primaries 12), as iPhone screenshots generally are. This is not a
detail we can ignore: a browser canvas silently converts P3 to sRGB while sharp
does not, so the same screenshot would yield different pixel values in the app
and in the test suite. It also explains why the badge thresholds we were given
(R > 235, G/B < 80) match zero pixels in these files — they describe
colour-managed sRGB values, not stored P3 ones.

We therefore work in P3 throughout: a `display-p3` canvas in the browser, raw
values in Node, and OKLab conversion using P3 primaries rather than sRGB ones.
The deciding argument is that converting to sRGB clips out-of-gamut reds and
greens, and clipping collapses distinct saturated hues onto the same value —
which is precisely the information a hue sort depends on. Keeping P3 also means
the composed output matches the screenshot's own colours.

## Consequences

The OKLab matrices are P3-based; anyone comparing them to the published sRGB
ones will find they differ, and that is deliberate. Browsers without
`display-p3` canvas support need a documented sRGB fallback, which produces
slightly different ordering among the most saturated icons. The exported PNG
must carry a P3 profile or it will appear desaturated when viewed.
