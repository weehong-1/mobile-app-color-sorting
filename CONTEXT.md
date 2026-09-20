# Icon Sorter

A browser-only tool that takes a screenshot of an iPhone home screen, finds the
app icons in it, and re-composes those exact cropped icons in colour-sorted
order on a solid background. Nothing leaves the device.

## Language

### The image and its spaces

**Screenshot**:
The image the user uploads, at its original pixel dimensions. The output always
matches these dimensions.
_Avoid_: source, input, photo

**Working copy**:
A downscaled copy of the screenshot, at most 1600px wide, used for grid
detection. Geometry found here is scaled back to screenshot coordinates before
any pixels are cropped.
_Avoid_: thumbnail, preview, small image

### The grid

**Grid**:
The regular arrangement of icon positions inferred from the screenshot,
described by left edge, top edge, icon size, column pitch and row pitch.

**Slot**:
One position in the grid. A slot is either occupied or empty; emptiness is
decided by how much gradient energy sits inside it.

**Icon**:
The square region of screenshot pixels at an occupied slot. The unit that gets
sorted.
_Avoid_: app, tile, image

**Sprite**:
What is actually drawn into the output for one icon: the rounded-corner-masked
icon square, plus its badge if it has one. A sprite can be larger than the icon
square, because a badge overhangs it.
_Avoid_: crop, cutout

**Badge**:
The notification bubble that overhangs an icon's top-right corner. It belongs to
its icon and travels with it, but is excluded from that icon's colour analysis.
_Avoid_: notification, bubble, count

**New app dot**:
The small blue dot that sits beside some app labels. It belongs to no icon and
is ignored entirely.

**Label**:
The app name rendered in white text beneath an icon. Optional in the output,
where it is re-drawn in a colour that contrasts with the chosen background.
_Avoid_: caption, name, title

**Chrome**:
The parts of the screenshot that are not the icon grid: status bar, page
indicator dots, dock. Never reproduced in the output.

### Colour

**Dominant colour**:
The colour covering the largest area of an icon. Area wins: a mostly-navy icon
with a thin teal stripe is navy.
_Avoid_: main colour, primary colour, average colour

**Accent colour**:
An icon's largest well-saturated region that is far from its dominant colour,
if it covers enough of the icon to count. Used to order icons that share a
white or dark dominant colour.
_Avoid_: secondary colour, highlight

**Colour class**:
Which of four buckets an icon's dominant colour falls into: **chromatic**,
**gray**, **dark** or **white**. The buckets sort as groups before icons sort
within them.

**Rainbow anchor**:
The hue the sorted order begins at, so that pinks lead and violets trail rather
than the order starting at an arbitrary red.

### Output

**Sort mode**:
The rule that turns a set of icons into an order: rainbow with groups, hue only,
colour families, or lightness in either direction.

**Palette**:
A set of colours, each optionally named, that chromatic icons can be grouped
against. One is built in; another can be pasted in to replace it.
_Avoid_: swatch book, colour library, theme

**Swatch**:
One colour in a palette. Swatches supply the names shown for a colour; they do
not themselves decide any icon's position.

**Family**:
A cluster of a palette's swatches sharing a region of hue. Chromatic icons are
grouped into families, families are ordered by hue from the rainbow anchor, and
icons within one are ordered from pale to deep.
_Avoid_: bucket, group, band

**Layout**:
Which slots the sorted icons are given, and how far the sort reaches. **Packed**
fills slots from the top-left with no gaps and sorts the whole page. **Original
positions** gives the sorted icons the slots that were occupied before, so the
page keeps its shape. **Within rows** sorts each row against itself, leaving
every icon in the row and the column it started in.
_Avoid_: packing mode

**Arrangement**:
The result of applying a layout: which slot each icon actually ends up in. The
layout is the rule; the arrangement is what it produced.

**Composition**:
The output image: the chosen background colour, with sprites drawn into the
slots the layout assigns them.
_Avoid_: result, render, export
