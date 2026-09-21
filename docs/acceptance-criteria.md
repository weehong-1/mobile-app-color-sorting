# Acceptance criteria

These replace the criteria in the original brief, which named sixteen apps
(bilibili, LinkedIn, CamScanner, Headspace, Pinterest, Brave, Google Maps and
others) that appear in neither reference screenshot. Agreed 2026-09-20.

## Fixtures

`fixtures/IMG_0571.PNG` and `fixtures/IMG_0572.PNG`. Both 1284x2778, 16-bit RGB,
tagged Display P3. Same device, same wallpaper, same dock. Metadata contains a
timestamp and the string "Screenshot" only.

`fixtures/IMG_0910.PNG` was added 2026-09-20, after the sorter silently dropped
an icon from it. A different device (1206x2622), a different wallpaper, and the
same format and metadata. It is a detection fixture, and since 2026-09-21 the
fixture for the default order: criteria 1, 2, 4c and 4d are measured on it, and
criteria 3, 4, 4b and 5 on the first two. Criterion 5's dimensions are those of
the first two, as its text says.

Provisional geometry, measured from edge projections and pending the
hand-measured truth files:

| | IMG_0571 | IMG_0572 | IMG_0910 |
|---|---|---|---|
| Column left edges | 98, 393, 689, 984 | 97, 392, 689, 984 | 95, 373, 650, 928 |
| Icon size | 203 | 203 | 191 |
| Column pitch | 295.3 | 295.3 | 277.8 |
| First row top | 216 | 216 | 268 |
| Row pitch | 319 | 319 | 301 |
| Occupied rows (of 6) | 0,1,2,3,4,5 | 0, 1, 5 | 0,1,2,3,4,5 |
| Icon count | 16 | 8 | 21 |

Occupied slots as (column, row), zero-indexed:

- **IMG_0571** (16): 1Password (0,0), Owlfiles (1,0), DeepL (0,1), Youdao (1,1),
  Gemini (0,2), DeepSeek (1,2), ChatGPT (2,2), Claude (3,2), Gmail (0,3),
  Spark (1,3), Telegram (0,4), WhatsApp (1,4), WeChat (2,4), Simplenote (0,5),
  UpNote (1,5), VoiceRecorder (2,5)
- **IMG_0572** (8): Endel (0,0), Spotify (1,0), QQMusic (2,0), TickTick (0,1),
  MinimaList (1,1), Todoist (2,1), Meitu (2,5), 轻颜 (3,5)
- **IMG_0910** (21): every slot of rows 0 to 4, and DBS PayLah! alone at (0,5)

## 1. Grid detection

Detected icon positions land within 3px of the hand-measured truth in
`fixtures/IMG_0571.truth.json`, `fixtures/IMG_0572.truth.json` and
`fixtures/IMG_0910.truth.json`, on all three screenshots. Occupancy finds
exactly 16 icons in IMG_0571, exactly 8 in IMG_0572 and exactly 21 in IMG_0910,
at the slots listed above.

IMG_0572 is the discriminating case for row detection: rows 2, 3 and 4 are
empty, so any scoring that averages over edges prefers a bogus pitch that skips
them. See ADR-0005.

IMG_0910 is the discriminating case for occupancy. Singpass at (2,3) is a flat
red tile with a small white glyph, so the mean gradient inside its square is
1.82 against 0.73 for blurred wallpaper — too close for the threshold to split
on, and the icon was dropped. Twenty icons then packed into exactly five rows,
which is what made the loss easy to miss. Occupancy reads the icon's outline as
well as its interior for this reason; see ADR-0008.

Healthy 365 at (0,2) is measured by hand in the truth file rather than by
`scripts/measure-truth.ts`. It is a white card on pale blue wallpaper with a
grey rim inside its left and right edges and a green strip along its bottom,
and the scanline method reports those instead of the icon's own edges. The
correction lives in the script, so the truth file stays reproducible.

## 2. Badges

The badges on Gmail (2) and WhatsApp (3) in IMG_0571 are detected, included in
their sprites, and excluded from their colour analysis. WhatsApp's measures
77x77px and overhangs the icon square by 33px to the right and 33px above.

Todoist in IMG_0572 has no badge, and its red tile must not produce one. The
small pink dot on 轻颜 is not an iOS badge and is not detected as one.

Alipay (9), Singpass (17) and DBS digibank (35) in IMG_0910 are detected, and
nothing else on that page is. Singpass is the hard one, and was missed until
2026-09-20: its badge sits on a red tile, and the page carries three more red
tiles that wear no badge. See ADR-0009.

The brief's thresholds (R > 235, G/B < 80) match zero pixels. iOS badge red is
#FF3B30, which Display P3 stores as rgb(235, 75, 70), so `red > 235` misses by
exactly one. The predicate is a distance from that colour in OKLab, tolerance
0.06: an sRGB screenshot's badge lands 0.013 away and a badge's antialiased rim
about 0.042, while the red tiles on IMG_0910 sit 0.053 to 0.114 away. Blurred
wallpaper is never close — its warm regions peak at chroma 0.130 against the
badge's 0.234, which alone puts them past 0.1.

## 3. Classification

- **Dark**: Endel, Spotify, VoiceRecorder
- **Gray**: 1Password
- **Chromatic**: Youdao, Claude, Spark, WhatsApp, WeChat, Todoist, Meitu,
  Telegram, DeepSeek, Simplenote, QQMusic
- **White**: Owlfiles, DeepL, Gemini, ChatGPT, Gmail, UpNote, TickTick,
  MinimaList, 轻颜

Area wins, with two exceptions, both agreed 2026-09-20 and both measured from
the coloured pixels instead of the winning cluster. A third rule, agreed
2026-09-21, decides not which colour wins but which bucket it lands in.

- **A white tile is a background, not a colour.** Once the mark on it covers a
  fifth of the icon, the mark speaks for the icon — `docs/adr/0011`. This is
  what moves Telegram (52% white by area, blue mark 48%), QQMusic (45% white,
  yellow 40%), DeepSeek (21%) and Simplenote (27%) into the chromatic group,
  reversing the earlier criterion that Telegram and QQMusic were deliberately
  white. Gmail's mark measures 17% and stays an accent on a white tile; DeepL's
  navy hexagon stays one because it is too near-neutral to sort by at all.
- **A winner that holds a minority of the icon has not won.** A neutral whose
  coloured pixels cover at least half the icon and at least twice what it covers
  is discarded — the gradient-tile case of `docs/adr/0007`. No icon in either
  fixture meets that test; Instagram, on a screenshot outside the fixtures, is
  the case it was written for, at 79% coloured against an 18% white.
- **A tile too dark to read as a colour is dark.** Dark below the lightness cut
  outright, and dark below the cut plus 0.10 when chroma is at most 0.15 —
  `docs/adr/0015`. No icon on either fixture here moves: the rule was written
  for TNG eWallet on IMG_0910, at lightness 0.328 against a cut of 0.320, and
  the band from 0.33 to 0.51 is empty across all three screenshots.

## 4. Rainbow order

Not the default since 2026-09-21 — see 4d — but still the mode the neutral rules
are documented against, and the tests name it explicitly rather than relying on
the default.

Group order is chromatic, then the neutrals as one ramp: white, gray, dark.
Groups and membership are hard-asserted; the sequence within them is computed,
diffed against the expected order below, and reported with hues rather than
hard-failed.

The neutral groups ran gray, dark, white until 2026-09-20, which scattered them:
a light grey tile landed between the blues and the blacks, and the white tiles
trailed the blacks. Keeping them in one ramp from white down to black is what
gives a light grey icon somewhere to sit. The gray group runs pale to deep for
the same reason, and `whiteFirst` now leads with the ramp — white, gray, dark,
chromatic — rather than moving the white group alone.

Chromatic order, measured (dominant hue in OKLCH, anchor 345 degrees):

- IMG_0571: Youdao (27) > Claude (39) > WhatsApp (147) > WeChat (151) >
  Telegram (234) > Spark (255) > Simplenote (264) > DeepSeek (270)
- IMG_0572: Meitu (19) > Todoist (28) > QQMusic (98)

Two rules were sharpened once the real numbers were visible, both agreed:

- An accent must be genuinely coloured, not merely clear the per-pixel chroma
  gate. DeepL's dark navy hexagon measures chroma 0.060 against real accents at
  0.13 and above, so it joins ChatGPT's black mark at the end of the white
  group rather than sorting among the blues.
- Within the dark group, only icons with real chroma sort by hue; near-neutral
  ones follow, ordered by lightness. Endel and Spotify both measure chroma
  0.000, so their reported hues are noise.

Full agreed order, measured:

- **IMG_0571**: Youdao, Claude, WhatsApp, WeChat, Telegram, Spark, Simplenote,
  DeepSeek (chromatic) · Gmail, Owlfiles, Gemini, UpNote (white, by accent hue),
  then DeepL and ChatGPT (white, no accent) · 1Password (gray) · VoiceRecorder
  (dark).
- **IMG_0572**: Meitu, Todoist, QQMusic (chromatic) · 轻颜, TickTick (white, by
  accent hue), then MinimaList (no accent) · Endel, Spotify (dark).

Three of IMG_0571's four accented whites are blue within a 31-degree span, and
its last four chromatic icons within 36, so those positions rest on small
differences. That is why this criterion reports rather than hard-fails.

## 4b. Colour families order

The 'families' mode keeps the same groups and the same neutral rules; only the
chromatic group is ordered differently, by palette family and then pale to deep.
Measured with the built-in palette:

- **IMG_0571**: Claude (red family, L 0.66), Youdao (red, L 0.63), WhatsApp
  (green, L 0.79), WeChat (green, L 0.75), Telegram (blue, L 0.67), Spark
  (blue, L 0.62), DeepSeek (blue, L 0.60), Simplenote (blue, L 0.55), then the
  neutrals exactly as in criterion 4.
- **IMG_0572**: Todoist (red, L 0.64), Meitu (red, L 0.61), QQMusic (yellow,
  L 0.89), then the neutrals.

Both fixtures show the mode doing its job: under the rainbow Youdao precedes
Claude on a 12-degree hue difference, and under families they share a family and
swap so the paler one leads.

The white groups in criterion 4 are ordered by accent hue in bands of 15 degrees
and pale to deep inside a band, agreed 2026-09-21 and shared with the mode in
4d. It changes no order recorded above: Gemini and UpNote are the only pair on
either fixture that share a band, at 272.2 and 274.6 degrees, and lightness
0.641 against 0.529 keeps Gemini ahead — where before it led on 2.4 degrees.

## 4c. Labels

Every icon on all three fixtures recovers a label, at a coverage between 2% and
35% of its strip. Labels are re-drawn in a colour that contrasts with the
chosen background, and each sits under the icon it belongs to in all three
layouts.

Nothing but text may survive. The blue "new app" dot is rejected by solving per
channel and taking the minimum, and a shadow by the same rule. IMG_0910 adds a
third case, found 2026-09-20: its wallpaper has a bright diagonal edge crossing
several label strips, which lifts every channel at once and so passes both of
those tests. It is rejected by how far it gets instead — see ADR-0010.

## 4d. Default order: tile, then mark

The order the app opens on, agreed 2026-09-21 (`docs/adr/0016`) and measured on
`IMG_0910`, the page it was built for. Unlike criteria 4 and 4b this one is
hard-asserted, because it is the order nobody chooses and therefore the one
nobody notices changing.

The tile decides the group and the mark decides the sequence inside it, so the
groups here are tile classes: Donate Blood is a red icon on a white card, and it
belongs with the cards.

- **Coloured tiles** (by tile hue): AIA+, MySingtel, OCBC Business, OCBC,
  Singpass, Maxis, CPF Mobile, Alipay
- **White cards** (by mark, one hue band at a time, pale to deep inside a band):
  Donate Blood (L 0.585), Great Eastern (0.548), Healthy 365 (0.527), MyPB
  (0.511) — all four in the red band — then MyNIISe (gold, 115 degrees), then
  中国移动 (0.597), Authenticator (0.507) and SC Mobile (271 degrees, its own
  band) in the blues, then SP and MyICA Mobile, which carry no mark at all
- **Dark tiles**: DBS digibank, DBS PayLah!, TNG eWallet

Three things this fixture is the discriminating case for:

- **TNG eWallet is a dark tile**, at lightness 0.328 against a cut of 0.320. It
  used to sit between Alipay and the white cards, a near-black square in the
  middle of a run of colour. See `docs/adr/0015`.
- **The four red marks are one red.** They measure 40.95, 41.05, 43.38 and 44.53
  degrees from the anchor, so ordering them by hue is ordering them by noise.
  Great Eastern's 44.53 is half a degree inside the band edge at 45.00, which is
  the number to re-measure if that icon ever leaves the red run.
- **SP and MyICA Mobile carry no mark.** The SPgroup swirl and the ICA crest are
  below the chroma bar of 0.11 that ADR-0011 set, so they end the white group in
  reading order rather than sorting among the blues.

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
