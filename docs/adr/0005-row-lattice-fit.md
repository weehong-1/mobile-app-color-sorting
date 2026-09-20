# Row pitch is found by fitting a lattice to detected row bands, not by brute-force search

Columns are found by brute-force search over left edge, size and pitch, as
originally specified. Rows are not, because a screenshot can have empty rows in
the middle of the grid: IMG_0572 occupies rows 0, 1 and 5 with three empty rows
between. Any scoring that averages over edges rewards a pitch that skips the
empty rows — a pitch of 1595 landing only on rows 0 and 5 scores a perfect mean,
while the correct pitch of 319 is penalised for the empty rows it honestly
crosses.

Instead we detect individual row bands as peaks in the horizontal edge
projection, then choose the largest (y0, q) lattice that explains every detected
band. On IMG_0572 the correct pitch explains 216, 535 and 1811 as indices 0, 1
and 5; the bogus 1595 leaves 535 unexplained and is rejected; a half-pitch also
explains all three but loses for being smaller.

## Consequences

Rows and columns are found by different algorithms, which looks inconsistent
until you know why. Missing rows cost nothing, because a lattice point with no
band is simply never scored. The method depends on band peak detection being
reliable; when it finds fewer than two bands there is nothing to fit, and that
case falls through to the manual controls.
