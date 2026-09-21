# On a white tile, the mark is the icon's colour

Area decides an icon's colour, and on a white tile area picks the tile. That is
how Donate Blood — a red cartoon drop over a third of a white square — came to
sit in the white group, eleven places from AIA+, Singtel, OCBC and Singpass,
with which it shares both its hue and its reason for being red. Telegram,
QQMusic and Healthy 365 were the same story on other pages. Three separate
reports of "it failed to sort this icon" were all this one rule.

The rule was not wrong about the pixels. It was wrong about what a white tile
is. A navy tile is a colour someone chose; a white tile is a background they
left behind the thing they drew. So a white winner now yields to the mark on it
once that mark covers a fifth of the icon, and the icon is measured from the
mark instead. Below a fifth the tile keeps the icon: a small logo is a detail,
and Gmail's 17% envelope stays an accent on a white tile rather than dragging
the icon into the reds.

The mark must also be genuinely coloured, by the same threshold the accent
already used, so DeepL's near-neutral navy hexagon (chroma 0.060) is still a
mark on a white tile and not a blue icon.

This reverses the earlier criterion that Telegram (52% white by area) and
QQMusic (45%) were *deliberately* white. Both are now read as the colour of
their mark, and the acceptance criteria record the new classification. Agreed
2026-09-20.

## Consequences

The white group shrinks to tiles that are genuinely mostly white: plain ones,
ones with a small logo, and ones whose mark is too near-neutral to sort by. On
the reference pages it went from thirteen icons to six, five and nine. That is
the point — the group had been collecting icons that are white only in the
sense that their background is.

A fifth is a threshold with a screenshot behind it rather than a principle:
Donate Blood's drop is 33%, Great Eastern's lion 39%, MyPB's logo 21%, and the
marks that should stay marks measure 17% and below. Icons landing between those
figures are the ones to re-measure if the bar ever moves. `markMinShare` is the
option; it is not exposed in the interface.

Only white winners yield this way. A dark tile keeps its icon — Spotify's green
circle covers 46% of a black square, and nobody calls Spotify a green app — and
a grey tile is taken over only under the stricter gradient rule of ADR-0007.

## Correction, 2026-09-21

`markMinShare` **is** exposed in the interface, as the slider labelled "a mark
takes its white tile above". The control shipped after this ADR was written and
the sentence above was never corrected. The decision it records still holds; the
claim about the interface does not.
