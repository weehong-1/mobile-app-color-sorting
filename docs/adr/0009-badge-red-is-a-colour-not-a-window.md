# Badge red is one colour, and a badge is solid

A badge pixel used to be one that fell inside an OKLCH window drawn around iOS
badge red: lightness 0.50 to 0.80, chroma above 0.17, hue 10 to 45. That window
has to be wide enough to hold a real badge under any screenshot's colour space,
and once it is that wide it holds most red app tiles too.

Which matters, because `detectBadge` floods outwards from red pixels and gives
up when the region it finds is too big to be a badge. A red tile that the fill
can reach is a red tile that costs the icon its badge. Singpass in IMG_0910 is
exactly that case, and its badge was missing from every composition.

Badge red is #FF3B30 — one colour, not a range. A pixel is now badge red if it
lies within 0.06 of it in OKLab. The same badge in an sRGB screenshot lands
0.013 away, and a badge's antialiased rim about 0.042, so both are in. The red
tiles sharing IMG_0910 with it — Singpass, AIA+, OCBC, MySingtel — sit 0.114,
0.084, 0.063 and 0.053 away, so they are out.

That alone was not enough. A badged tile is drawn with an antialiased top edge
one pixel tall, and on Singpass that edge measures 0.015 from badge red: a
hairline the fill could seed from and follow across the full width of the tile.
So the mask is eroded by a pixel before anything is filled, and the box grown
back by one afterwards. A badge is 78 pixels across and survives that; a
one-pixel line does not exist afterwards at all.

## Consequences

Gmail's and WhatsApp's badges in IMG_0571 measure the same 77x77 they did
before, so criterion 2's numbers are unchanged.

The two halves are coupled, and neither is optional. Erosion alone does not
recover Singpass's badge, because the wide colour window still swallows the
tile. The tolerance alone does not either, because the hairline is inside it.
And erosion moved what the size cap is good for: it trims an escaped region
too, enough that one can come back small enough to pass, so keeping a red tile
from producing a badge now rests on the tolerance. Tested with the old window
and the new erosion together, Todoist in IMG_0572 produces a 105px false badge
-- which is what criterion 2 has forbidden since the beginning, and what the
sparse fixture's "finds no badges at all" test catches.

The remaining unreachable case is a tile painted in the badge's own colour,
which no colour test can separate from a badge sitting on it. The fill escapes,
the box comes out too big, and the icon keeps its badge only in the sense that
nothing false is drawn over it. `sprite.test.ts` asserts that outcome rather
than pretending it away.

Erosion costs one extra pass over the search window and one byte per pixel of
it, on a window of about 170 by 190 pixels per icon. The colour conversions,
which dominate, now run once per window pixel instead of twice.
