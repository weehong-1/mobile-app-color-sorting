# A neutral winner that holds a minority of the icon loses to the icon's colour

The dominant colour is the colour covering the largest area, found as the
heaviest neighbourhood of quantiser bins. That works on the icon a phone screen
is mostly made of: a flat tile, possibly shaded, with a mark on it. It fails on
a tile painted as a gradient.

Instagram is the case that exposed it. Its tile sweeps from orange through pink
to violet, so no two neighbouring bins hold the same colour and the heaviest
neighbourhood collects 18% of the pixels -- the flat white camera outline. The
icon was filed as white and sorted into the tail with the white tiles, as far
from the reds and pinks it plainly belongs to as the order can put it. Nothing
in the pipeline was wrong at any step; "area wins" had simply crowned a winner
with 18% of the vote.

So the crowning has a quorum. When the winner is neutral, coloured pixels cover
at least half the icon, and they cover at least twice what the winner does, the
icon is measured among its coloured pixels instead and the neutral is discarded.

Both gates matter, and the second is the one doing the work. A white tile with a
big coloured logo -- QQMusic's yellow circle, at 58% coloured against a 41%
white -- passes the first gate and fails the second, and stays white, which is
what the acceptance criteria agreed it should be. Instagram fails neither: 79%
against 18%, a ratio of four.

## Consequences

An icon can now be classified from a colour that covers a small share of it --
Instagram's reported dominant covers 11% -- which looks wrong in the debug table
until you read it as "the largest coloured region in an icon that has no flat
region at all". `dominantShare` is therefore not a confidence measure and should
not be shown as one.

The ratio gate sits in the gap between the two behaviours rather than on a
principle: across the three reference screenshots the highest ratio among icons
that should stay neutral is 1.4, and Instagram is 4.4. A screenshot full of
gradient icons would be the thing to re-measure it against.
