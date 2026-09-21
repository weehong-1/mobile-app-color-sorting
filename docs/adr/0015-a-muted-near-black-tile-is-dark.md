# A tile too dark to read as a colour is dark, however it is classified

TNG eWallet is a near-black navy square. It measures lightness 0.328 against a
dark cut of 0.320, so it missed the dark group by eight thousandths and was
filed among the colours — where its hue, 263 degrees, stood it between Alipay's
blue and the white cards, a black tile in the middle of a run of colour. Nothing
in the pipeline was wrong at any step. The cut simply fell in a place where an
icon could sit.

So the cut reaches further down for a tile with little colour in it: dark below
the cut outright, and dark below the cut plus 0.10 when chroma is at most 0.15.
TNG, at chroma 0.119, is swept up. A genuinely vivid deep tile is not: a royal
purple at lightness 0.40 and chroma 0.25 is a colour someone chose, and calling
it black because it is dark would be the same mistake in the other direction.

The margin rides the cut rather than sitting at a fixed lightness, because the
cut is the one dial the interface offers — "dark icons below lightness" — and a
person dragging it means to move where dark begins. A fixed 0.42 would stop
doing anything the moment they dragged past it.

## Why these numbers

Measured across all three reference screenshots, forty-five icons. The band
between **0.33 and 0.51** is empty: nothing, tile or mark, lands in it.

| lightness | chroma | icon |
|---|---|---|
| 0.271 | 0.030 | DBS PayLah! (dark) |
| **0.328** | **0.119** | **TNG eWallet** |
| 0.511 | 0.188 | MyPB's red logo |
| 0.539 | 0.217 | Singpass (chromatic) |

The margin could therefore be anything from 0.01 to 0.18 and move TNG alone. It
is 0.10 because that is roughly the middle of the empty band, and no fixture
disagrees with it. The chroma gate at 0.15 has weaker evidence: TNG measures
0.119 and the nearest chromatic tiles measure 0.19 and above, so the gate sits
in a gap of 0.07 with nothing in it. A screenshot carrying a deep, saturated
tile — a wine red, a forest green — is the thing to re-measure it against.

## Consequences

This changes classification in every mode, not just the one it was built for.
TNG now appears in the dark group under the rainbow as well, which is the same
judgement applied consistently rather than a special case for the new order.

Nothing else moves. Re-running all three fixtures after the change, every other
icon keeps the class it had, and the agreed rainbow and families orders in
criteria 4 and 4b are byte-identical.

A tile can now be filed dark while reporting a hue with real chroma in it —
TNG's 0.119 is not noise, unlike the 0.000 of Endel and Spotify. The dark
group's own ordering already handles this: tinted darks sort by hue ahead of the
near-neutral ones, so TNG leads DBS digibank and PayLah! under the rainbow.

`mutedDarkMargin` and `mutedDarkMaxChroma` are the options. Neither is exposed
in the interface; the cut they extend already is.
