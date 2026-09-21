# A slot is occupied if either its interior or its outline says so

Occupancy was decided by one number: the mean gradient magnitude inside the
icon square, trimmed by 10%. That number is an average over the whole square,
so it measures how *busy* an icon is, not whether one is there. A flat tile
with a small glyph — Singpass, and Apple's own Phone and Messages — spends
almost all of its area at one colour, and averages down to nearly nothing.

IMG_0910 is the case that broke. Singpass scored 1.82 against 0.73 for blurred
wallpaper, a ratio of 2.5 that the threshold search would not split on, while
the gap just above it (5.49 to 1.82, a ratio of 3.0) looked far more convincing.
Singpass was dropped, 21 icons became 20, and a packed layout turned six rows
into a tidy five — the failure is silent, because twenty icons pack perfectly.

So a slot now scores as the larger of two measurements: the interior as before,
and the band straddling the icon square's edge. Every icon has an outline
against the wallpaper whatever its interior does, and an empty slot has neither.
Singpass's outline measures 4.51 against 1.17 for the wallpaper slot below it,
which the same threshold search splits without hesitation.

## Consequences

The two measurements cover each other's blind spots rather than being combined
into one score, because they fail in opposite directions: a busy icon on
wallpaper close to its own edge colour keeps its interior, and a flat icon keeps
its outline. `max` needs no weighting to be tuned.

The outline band reaches 6% of an icon size outside the square, which on these
screenshots is about 11px into a 43px gutter, so it reads wallpaper and not the
neighbouring column. Below the square it stops well short of the label — the
empty slot under Alipay in IMG_0910 picks up 1.17, against 3.1 for the weakest
real outline in any fixture. A denser grid than iOS's, with icons nearly
touching, would erode that margin.

That 1.17 is also the closest an empty slot has come to the absolute floor of
1.2, which the threshold falls back to when the scores show no convincing gap
at all. The gap on this page is wide, so the fallback is not in play — but an
empty slot scoring above the floor on a page that has no gap either would be
read as an icon. Outlines put empty slots nearer that floor than interiors did,
so the floor is the number to revisit first if a phantom icon ever appears.

Nothing about the threshold search changed. It still splits the slot scores at
their widest ratio gap above the floor; it was only ever as good as the evidence
it was given.
