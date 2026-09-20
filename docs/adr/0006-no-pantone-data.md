# The colour-family palette ships our own values, never Pantone's

The "colour families" sort came from a request to sort the way a Pantone chart
is arranged: hue families as rows, each running pale to deep. The arrangement is
the useful idea and we have taken it. The colour values behind it we have not.

Pantone's numeric colour definitions are licensed intellectual property — this
is why Adobe removed the Pantone libraries from Creative Cloud in 2022 and made
them a paid plugin — and "PANTONE" is a trademark. A static site anyone can
publish is not somewhere to bundle a scraped copy of that data, and the
interface does not use the name.

Instead the app ships a palette of its own: seven hue families in six steps,
shaped like the chart but with values we chose. Anyone with licensed access to a
colour book can paste their own list of hex values and names into the app, and
it will be used in full. That keeps the capability the request was really about
while keeping someone else's data out of the repository.

## Consequences

The built-in palette is a design artefact that someone has to maintain by eye;
it is not derived from any standard, and it should not be described as matching
one. Because family boundaries are clustered from whatever palette is loaded, a
pasted palette genuinely changes the grouping rather than only the names — which
is what makes the paste box worth having.
