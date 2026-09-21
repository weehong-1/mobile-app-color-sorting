---
status: superseded by ADR-0013
---

# A second opinion never ships

Three of IMG_0571's accented whites sit within a 31-degree hue span and its
last four chromatic icons within 36, which is why criterion 4 reports its
ordering rather than hard-failing on it. Classification has been wrong twice in
ways only an eye caught — ADR-0011 and ADR-0007 are both that story. So vision
models are now asked what they see: which class an icon belongs to, and whether
two neighbours in an order are the right way round. They are asked from a
script, on a developer's machine, and never from the app. Agreed 2026-09-20.

ADR-0003 says the page is incapable of making a request and that this is a
property anyone can check in devtools rather than a promise. That is unchanged
and not up for revisiting. The models occupy the slot `sharp` and Vitest already
occupy — development tooling that never ships — and the boundary is drawn where
those two already draw it:

- No runtime dependency, and no new dev dependency either: the request is a
  `fetch` we wrote.
- Nothing reachable from the app's entry point. The tool lives in `scripts/`
  with the debug and truth-measuring scripts, and what it borrows it borrows
  from `src/test-support/`, which is dev-only and never bundled — the same
  directory `scripts/debug.ts` already imports.
- `package.json` gains a script to run it by, the way `debug` has one. Nothing
  enters `dependencies` or `devDependencies`.
- `connect-src 'none'` and the rest of the Content-Security-Policy stay exactly
  as they were, and `grep -r "https://" dist/` still comes back empty.

A second opinion is advisory. It can disagree loudly; it cannot order icons.
The output of this program stays a pure function of its input, and the fixture
assertions stay repeatable, because a remote model deciding an arrangement
would end both.

## Considered options

**Inside the app, with the user's own key.** Rejected. It would keep the
offline guarantee for the honest majority while deleting the paragraph in the
README that let any of them verify it.

**A single model.** Rejected, and it is why this is OpenRouter rather than a
vendor SDK: one model's confident mistake is indistinguishable from a finding.
Three models from three different vendors are asked the same blinded question,
and only the seams where they agree with each other and disagree with us are
worth reading. Models from one vendor share a lineage and would be wrong
together.

**Live calls in CI.** Rejected. A verdict is reviewed once and committed beside
the truth, where it becomes an ordinary fixture and a deterministic test.
Regressions are caught by those committed verdicts and by snapshots, offline
and for nothing; the models are for finding where the rule is wrong, not where
the code moved.

## Consequences

The models are blinded. No app names, no filenames, no hint of our order —
icons go in as numbers in a seeded shuffle. The truth files name Singpass,
WhatsApp and QQMusic, and a model told those names would answer from brand
knowledge rather than from the pixels, often correctly enough that we would
never notice the datum had stopped being independent.

Two payloads, split by job. The order question sends swatches of the measured
colours, so no pixels and no app identity leave, with the OKLCH figures in the
prompt because a clipped picture cannot resolve a 12-degree tie. The
classification question sends the icon crops themselves, which does mean the
apps on these three home screens — banking among them — are seen by whichever
provider serves the request. Requests carry `data_collection: 'deny'` for that
reason. Anyone uncomfortable with the trade should run the order half alone.

Verdicts live in `fixtures/<name>.verdict.json`, beside the truth but not in
it: `scripts/measure-truth.ts` rewrites its file wholesale, and a verdict is
not regenerable the way a measurement is.

This decision reverses if the models fail the exam that already exists.
Criterion 3 hard-asserts every icon's class, so the consensus is graded against
it before any ordering verdict is believed: below about ninety per cent, with
chromatic-for-white confusion counting double because that is the judgement
ADR-0011 turns on, the verdicts are noise and this goes away rather than being
quietly trusted.

The second opinion is re-run when `analysis.ts`, `sort.ts` or `palette.ts`
changes, and when a fixture is added. A verdict file left diffing against a
changed rule is the conversation worth having.
