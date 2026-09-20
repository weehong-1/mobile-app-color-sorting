# Acceptance criteria

These replace the criteria in the original brief, which named sixteen apps
(bilibili, LinkedIn, CamScanner, Headspace, Pinterest, Brave, Google Maps and
others) that appear in neither reference screenshot. Agreed 2026-09-20.

## Fixtures

`fixtures/IMG_0571.PNG` and `fixtures/IMG_0572.PNG`. Both 1284x2778, 16-bit RGB,
tagged Display P3. Same device, same wallpaper, same dock. Metadata contains a
timestamp and the string "Screenshot" only.

Provisional geometry, measured from edge projections and pending the
hand-measured truth files:

| | IMG_0571 | IMG_0572 |
|---|---|---|
| Column left edges | 98, 393, 689, 984 | 97, 392, 689, 984 |
| Icon size | 203 | 203 |
| Column pitch | 295.3 | 295.3 |
| First row top | 216 | 216 |
| Row pitch | 319 | 319 |
| Occupied rows (of 6) | 0,1,2,3,4,5 | 0, 1, 5 |
| Icon count | 16 | 8 |

Occupied slots as (column, row), zero-indexed:

- **IMG_0571** (16): 1Password (0,0), Owlfiles (1,0), DeepL (0,1), Youdao (1,1),
  Gemini (0,2), DeepSeek (1,2), ChatGPT (2,2), Claude (3,2), Gmail (0,3),
  Spark (1,3), Telegram (0,4), WhatsApp (1,4), WeChat (2,4), Simplenote (0,5),
  UpNote (1,5), VoiceRecorder (2,5)
- **IMG_0572** (8): Endel (0,0), Spotify (1,0), QQMusic (2,0), TickTick (0,1),
  MinimaList (1,1), Todoist (2,1), Meitu (2,5), 轻颜 (3,5)

## 1. Grid detection

Detected icon positions land within 3px of the hand-measured truth in
`fixtures/IMG_0571.truth.json` and `fixtures/IMG_0572.truth.json`, on both
screenshots. Occupancy finds exactly 16 icons in IMG_0571 and exactly 8 in
IMG_0572, at the slots listed above.

IMG_0572 is the discriminating case for row detection: rows 2, 3 and 4 are
empty, so any scoring that averages over edges prefers a bogus pitch that skips
them. See ADR-0005.

## 2. Badges

The badges on Gmail (2) and WhatsApp (3) in IMG_0571 are detected, included in
their sprites, and excluded from their colour analysis. WhatsApp's measures
77x77px and overhangs the icon square by 33px to the right and 33px above.

Todoist in IMG_0572 has no badge, and its red tile must not produce one. The
small pink dot on 轻颜 is not an iOS badge and is not detected as one.

The brief's thresholds (R > 235, G/B < 80) match zero pixels. iOS badge red is
#FF3B30, which Display P3 stores as rgb(235, 75, 70), so `red > 235` misses by
exactly one. The predicate is an OKLCH window instead. Chroma does the
separating: the wallpaper's blurred warm regions sit in the badge's hue and
lightness range but peak at chroma 0.130, against the badge's flat 0.234.

## 3. Classification

- **Dark**: Endel, Spotify, VoiceRecorder
- **Gray**: 1Password
- **Chromatic**: Youdao, Claude, Spark, WhatsApp, WeChat, Todoist, Meitu
- **White**: Owlfiles, DeepL, Gemini, DeepSeek, ChatGPT, Gmail, Telegram,
  Simplenote, UpNote, QQMusic, TickTick, MinimaList, 轻颜

Telegram (52% white by area) and QQMusic (45%) are deliberately white: area
wins, and the accent hue orders them within the white group.

## 4. Default rainbow order

Group order is chromatic, gray, dark, white. Groups and membership are
hard-asserted; the sequence within them is computed, diffed against the expected
order below, and reported with hues rather than hard-failed.

Chromatic order, measured (dominant hue in OKLCH, anchor 345 degrees):

- IMG_0571: Youdao (28) > Claude (41) > WhatsApp (144) > WeChat (147) > Spark (259)
- IMG_0572: Meitu (19) > Todoist (29)

Two rules were sharpened once the real numbers were visible, both agreed:

- An accent must be genuinely coloured, not merely clear the per-pixel chroma
  gate. DeepL's dark navy hexagon measures chroma 0.060 against real accents at
  0.13 and above, so it joins ChatGPT's black mark at the end of the white
  group rather than sorting among the blues.
- Within the dark group, only icons with real chroma sort by hue; near-neutral
  ones follow, ordered by lightness. Endel and Spotify both measure chroma
  0.000, so their reported hues are noise.

Full agreed order, measured:

- **IMG_0571**: Youdao, Claude, WhatsApp, WeChat, Spark (chromatic) ·
  1Password (gray) · VoiceRecorder (dark) · Gmail, Owlfiles, Telegram, Gemini,
  UpNote, Simplenote, DeepSeek (white, by accent hue), then DeepL and ChatGPT
  (white, no accent).
- **IMG_0572**: Meitu, Todoist (chromatic) · Endel, Spotify (dark) · 轻颜,
  QQMusic, TickTick (white, by accent hue), then MinimaList (no accent).

Six of the nine accented whites are blue within a 41-degree span, so positions
9 to 14 of IMG_0571 rest on small differences. That is why this criterion
reports rather than hard-fails.

## 4b. Colour families order

The 'families' mode keeps the same groups and the same neutral rules; only the
chromatic group is ordered differently, by palette family and then pale to deep.
Measured with the built-in palette:

- **IMG_0571**: Claude (red family, L 0.66), Youdao (red, L 0.63), WhatsApp
  (green, L 0.79), WeChat (green, L 0.75), Spark (blue, L 0.62), then the
  neutrals exactly as in criterion 4.
- **IMG_0572**: Todoist (red, L 0.64), Meitu (red, L 0.61), then the neutrals.

Both fixtures show the mode doing its job: under the rainbow Youdao precedes
Claude on a 12-degree hue difference, and under families they share a family and
swap so the paler one leads.

## 5. Composition

Output dimensions match the input exactly (1284x2778). Icon pixels inside the
mask are byte-identical to the source. Chrome (status bar, page dots, dock) is
not reproduced. The exported PNG carries a Display P3 profile.

Layout is a choice of three, agreed 2026-09-20, defaulting to packed:

- **Packed**: slots filled from the top-left with no gaps, the block starting
  where the detected grid starts, a short last row left-aligned. IMG_0572's
  eight icons become two full rows.
- **Original positions**: sorted icons take the slots that were occupied
  before, so IMG_0572 keeps its three empty middle rows.
- **Within rows**: each row is sorted against itself; every icon keeps its row
  and its column, so a gap inside a row stays open.

Icons and labels are planned by separate functions over the same arrangement,
and a test checks every label sits under its own icon in all three layouts.
