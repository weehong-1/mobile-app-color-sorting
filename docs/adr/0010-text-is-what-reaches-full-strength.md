# A label region is text only if it reaches full strength

`extractLabel` estimates the wallpaper behind a label strip, solves per channel
for how much white was laid over it, and keeps the smallest of the three. That
rejects a coloured mark, which lifts one channel far more than the others, and
a shadow, which lowers all three.

It does not reject the wallpaper's own bright edges, which lift all three
channels together exactly as white text does. IMG_0910 has one: a bright
diagonal runs through several label strips, and a sliver of it was drawn beside
Alipay's name in every composition.

What separates them is not colour but conviction. The solve is normalised by
the headroom the background left, so white text recovers to 1 at the centre of
every stroke no matter what is behind it. A wallpaper edge lifts part of the
way and stops. Measured across the three fixtures, 382 of the 386 recovered
regions peak at 1.00; the four that do not peak at 0.49 or below, and all four
are wallpaper.

So connected regions of lit pixels that never reach 0.9 are erased, whole. A
region rather than a pixel, because raising the threshold instead would thin
every glyph's antialiased edge to keep the same promise.

## Consequences

Labels are now recovered under all 45 icons across the three fixtures, and
nothing else is. A label rendered so faintly that no stroke of it recovers
fully would be dropped entirely, but no such label exists on any iOS home
screen: the system draws them in opaque white.

Connected-component labelling adds a pass over each strip — about 250 by 65
pixels — and a byte per pixel of it. The label pass already costs more than
that in medians.
