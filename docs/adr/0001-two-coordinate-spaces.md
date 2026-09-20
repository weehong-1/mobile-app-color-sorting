# Detection runs on a downscaled working copy; cropping and composition run at full resolution

The brief asks for the pipeline to downscale to 1600px wide, and also for the
output to match the input's dimensions with icon pixels taken from the source.
For any screenshot wider than 1600px those cannot both hold in one coordinate
space, so we use two: grid detection and occupancy scoring run on a working copy
of at most 1600px, and the resulting geometry is scaled back into screenshot
coordinates before a single pixel is cropped. Colour analysis also samples the
full-resolution screenshot, because downscaling blends neighbouring pixels into
intermediate colours that exist nowhere in the original and would otherwise form
clusters in the quantizer.

## Consequences

Every geometry value carries an implied space, and the scale-up is the one place
a rounding error becomes a visible misalignment. Detection functions return
working-copy coordinates by design; anything that touches pixels takes
screenshot coordinates. The same screenshot uploaded at two different sizes
classifies identically, because classification never reads a resampled pixel.
