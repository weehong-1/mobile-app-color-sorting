# Composition rasterises masks by hand into an RGBA buffer instead of using the Canvas API

The Canvas API does not exist in Node, so a Canvas-based compositor could not be
tested under Vitest — and composition is exactly what the acceptance criteria
pin down (output dimensions match the input, icon pixels match the source inside
the mask). Rather than add node-canvas, which is a native dependency and a
different rasteriser from the browser's, composition writes into a plain
`Uint8ClampedArray`: fill the background, then alpha-blend each sprite through a
supersampled coverage mask for the rounded rect and the badge pill. The browser
hands the finished buffer to `putImageData`; Node tests call the identical
function.

## Consequences

There is a hand-written rasteriser in a project that has a Canvas available.
That is deliberate: it makes the pixel-level acceptance criteria directly
testable and guarantees the browser and the test suite produce the same bytes.
Canvas is still used at the I/O edges, for decoding an upload and for producing
the downloadable PNG. Antialiasing quality is ours to get right rather than the
platform's.
