---
status: accepted
---

# The second opinion failed its exam, so it is gone

ADR-0012 put vision models to work as an advisory second opinion and wrote down
the condition under which the idea would be abandoned: the models had to
reproduce the colour classes criterion 3 already fixes, at about ninety per
cent, before a word they said about ordering was believed. They were asked, and
they did not. Removed 2026-09-20, the same day it was built.

Two trios were tried against the two reference pages, twenty-three icons with
an agreed class between them:

| | pooled score | best model | worst model |
|---|---|---|---|
| haiku-4.5, gemini-3.5-flash-lite, gpt-4o-mini | 0.39 | 0.63 | 0.21 |
| claude-sonnet-5, gemini-3.8-flash, gpt-5.6-sol | 0.48 | 0.58 | 0.38 |

Ten times the price bought nine points against a bar of 0.90.

## What they were actually wrong about

Almost nothing, and always the same thing. Of the twelve penalty points the
stronger trio lost, ten came from white tiles carrying a coloured mark: Gmail,
Owlfiles, UpNote, Gemini and 轻颜, each of which criterion 3 calls white and
every model called chromatic. Score them on the eighteen icons where our own
rule is not in dispute and they reach 0.89; the cheap trio reaches 0.88. Six
models across three vendors and two price tiers agree with each other and
disagree with us, on one rule, unanimously.

So the exam stopped measuring whether models can see colour -- they can -- and
started measuring whether they share our answer about white tiles. That is not
a question an exam can settle, and a tool whose findings are all one contested
judgement cannot be an independent check on that judgement.

The same week, a person looking at the sorted output objected to the same rule
from the opposite direction: that MyPB, Donate Blood and Great Eastern, whose
marks cover 21%, 33% and 39%, should read as white cards. The models would push
the threshold towards zero and the eye that reported it would push the
threshold up. Twenty per cent was never a fact. It is a preference, and it is a
slider now, which is the one thing this experiment earned and the one thing
kept.

## Consequences

`scripts/second-opinion/` is deleted, along with its verdict files, the
`OPENROUTER_API_KEY` plumbing and the *Second opinion* and *Verdict* entries in
`CONTEXT.md`. *Truth* stays: the truth files and `scripts/measure-truth.ts` are
older than any of this and still earn it.

ADR-0003 is untouched and was never at risk. Nothing here ever entered `src/`,
the dependencies or the bundle, which is why removing it is a deletion rather
than an extraction: `grep -r "https://" dist/` was empty before and after.

Anyone tempted to try this again should know it was tried, that the models are
capable, and that the failure was ours -- we asked them to arbitrate a rule we
had not settled ourselves. Settle the rule first.
