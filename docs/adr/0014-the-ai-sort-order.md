---
status: reverted
---

# A sort order the model decides

The app can now hand the ordering of the icons to a vision model. Picking **AI
order** sends the measured colour of every icon to openrouter.ai and arranges
the page in the order that comes back. Asked for and agreed 2026-09-20, after
the evidence below was on the table rather than before.

That evidence is not favourable, and it is recorded here because a future
reader will otherwise assume nobody looked. ADR-0013 describes the experiment:
six models, three vendors, two price tiers, scored against the colour classes
criterion 3 already fixes. They managed 0.39 and 0.48 against a bar of 0.90.
Asked for a whole order, they landed 0.16 to 0.54 away from the sorter's, and
disagreed with each other by as much. This mode is therefore expected to
produce an order that is different, not better, and a different one each time.

It was still chosen, so it is built properly rather than grudgingly.

## What it costs

ADR-0003 said the page was incapable of making a request and that this was a
property anyone could check in devtools rather than a promise. That is no
longer true, and no amount of care makes it true again. `connect-src` now names
`https://openrouter.ai` instead of `'none'`, the bundle contains a `fetch`, and
`grep -r "https://" dist/` is no longer empty. The README says so in the same
words rather than burying it.

## What it does not cost

The screenshot still never leaves the device. Ordering colours needs the
colours, not the pixels, so what is sent is a lightness, a chroma and a hue per
icon and the same for its mark -- no crops, no app names, no filenames. A
reader who wants to know what went out can read the prompt in `ai-order.ts`;
it is a list of numbers.

The key is the person's own, pasted into the page, kept in the tab for the
session and never written to storage. There is no key in the bundle, nothing to
leak from a deploy, and the app still needs no environment variables.

Every other sort order is untouched and still runs with the network off. The
compositor stays pure (ADR-0002), the colour maths stays ours (ADR-0004), and
nothing about detection, cropping or composition asks anyone's opinion.

## Consequences

The output stops being a pure function of the input in this one mode: the same
screenshot can produce two different pages, and no fixture test can assert
what the model will say. The acceptance criteria therefore cover the six
deterministic orders and not this one, which is tested only for the things that
are ours to get right -- that the prompt carries numbers and nothing else, that
an order which omits, repeats or invents an icon is refused, and that a failure
is reported rather than papered over.

It fails loudly on purpose. A model that returns something unusable, or a key
that is rejected, shows an error and no image at all. Falling back quietly to
the rule-based order would leave someone looking at an arrangement they did not
ask for, believing a model had chosen it -- which is the one outcome worse than
an error message.

## Reverted, 2026-09-20

Built, run and removed the same day, at the same person's request. It worked:
`claude-sonnet-5` ordered a twenty-one icon page in eighty seconds, and three
runs at temperature zero returned byte-identical orders, so the "a model gives
a different answer each time" objection recorded above turned out not to apply
to this setup. The prediction that its order would be *different rather than
better* did hold: twelve of twenty-one positions moved, most visibly by filing
DBS digibank and DBS PayLah! with the red tiles on the strength of their red X
rather than with the dark ones.

What decided it was not the quality of the order. It was that the page had to
stop being able to say `connect-src 'none'` in order to ask, and eighty seconds
and a cent per arrangement is a poor trade for an order nobody could show was
better than the free, instant, verifiable one.

ADR-0003 is whole again and no longer marked superseded: no dependency, no
`fetch` in the bundle, `connect-src 'none'`, and `grep -r "https://" dist/`
empty. The sort orders are the six deterministic ones, and *tile then mark* --
built the same day out of the same argument -- is the one that addresses what
prompted all of this.
