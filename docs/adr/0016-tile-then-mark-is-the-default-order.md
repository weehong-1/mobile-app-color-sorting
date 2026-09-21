# The app opens on *tile, then mark*

Agreed 2026-09-21. The default order is *tile, then mark* rather than *rainbow,
grouped*, and it leads the dropdown.

ADR-0014 built this mode and closed by calling it "the one that addresses what
prompted all of this", then left the app opening on the rainbow. That was the
state a person arrived in again the next day, describing the same problem in
their own words: a page of white cards, each with a different logo, that they
wanted ordered by the logos. The mode that does it was fourth in a list of six
and had to be found.

A default is an answer to the question "what did you want?", and for a phone
screenshot the answer is mostly white cards and coloured tiles. The rainbow asks
each icon a single question — what colour are you? — and a white card with a red
logo has no honest answer to it. This mode declines that question: the tile
groups, the mark orders, and both keep their own colour.

## What else changed with it

Two rules were sharpened on the same day, out of the same page:

- Marks are banded into 15 degrees of hue, and icons inside a band run pale to
  deep. The four red logos on the reference page measure 40.95, 41.05, 43.38 and
  44.53 degrees from the anchor — an order resting on differences nobody can
  see. One band makes them one red and lets lightness decide. The same tie-break
  now applies to the rainbow's white group, which had the same fault.
- A near-black tile is dark even when it scrapes over the cut, which is ADR-0015
  and which moved TNG eWallet out of the middle of the colours.

## Consequences

Criterion 4d records the full order for `IMG_0910` and is hard-asserted, so the
order the app opens on is now the one the acceptance criteria check. Criteria 4
and 4b still describe the rainbow and families orders and are unchanged; their
tests pass the mode explicitly rather than relying on the default.

`DEFAULT_SORT_OPTIONS` and `DEFAULT_PREFERENCES` agree, so there is one default
rather than a library one and an interface one. A saved preference still wins:
anyone who chose the rainbow before today keeps it, and only a fresh browser
sees the change.

The bands have edges, and one falls at 45 degrees from the anchor — half a
degree past Great Eastern's lion, at 44.53, the reddest of the four reds. A
screenshot that measured it a shade warmer would file it in the next band and
lift it out of the red run. A test pins both sides of that edge so the day it
happens is a failure with a number in it rather than a silent reordering. The
alternative considered was clustering marks by the gaps between them, which
cannot split two reds three degrees apart but makes an icon's position depend on
which other icons share the page; fixed bands were chosen for being predictable
without running anything.
