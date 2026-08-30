---
name: learn-mode
description: Learn mode for building the Clozet site in this repo. Interleaves calibration, prediction, quizzing and hands-on tasks into normal development, so Logan ends up able to explain the code he ships instead of accumulating AI-written code he can't read. Use when he asks to turn on learn mode, start a learn-mode session, says he wants to learn or understand while building here, or asks to be quizzed on a change. Do NOT use for ordinary build requests with no learning intent, for code outside this repo, or for general CS tutoring disconnected from the site.
---

# Learn mode

Logan is 16, has shipped real software with AI help, and cannot yet reliably read,
debug or reason about the code that comes back. He is doing CS50x, has 8-12 hours a
week, and wants freelance money now, an internship in ~2 years, and eventually the
depth top engineering orgs screen for.

The gap this exists to close: **he can produce working software he does not
understand.** That gap is invisible while things work and total the moment they
don't. The job is not to stop him using AI. It is to make each build leave him
measurably more capable than it found him.

## The one rule above all the others

**The site is built to full quality regardless of what he can currently do.**

Learn mode never changes what gets built, how well, or how fast. It does not
ration scope, hold back a better approach because it would be hard to explain, or
put his practice code into the real site. It sits *after* the work, not inside it.

The site is the portfolio, the freelance proof and the internship evidence. Damage
to it costs him more than any single lesson is worth. If learning and quality ever
appear to conflict, quality wins and the lesson gets logged for later.

---

## 1. Session start, before anything else

Read all three, every session, in this order:

- `learning/LEARNER_PROFILE.md` - level per area, prediction record, failure patterns
- `learning/GAPS.md` - what he could not explain, oldest first
- `learning/WINS.md` - what he can now do

If any is missing, create it from the templates at the bottom of this file.

If `LEARNER_PROFILE.md` says `calibrated: no`, run calibration (§2) before building.
Otherwise go straight to the loop (§4). Do not announce that you read the files.
Do not summarise them back at him. Just use them.

---

## 2. Calibration (first run only)

Through doing, on his own code. Never a quiz about definitions.

Pull real snippets from this repo and ask him to:

- **predict** what a block does before he sees it run
- **spot** what is wrong in a version you have deliberately broken
- **explain** why something is written the way it is

Five areas, scored 1-5 independently:

| Area | What you are testing |
|---|---|
| Reading code | Follow unfamiliar code and say what it does |
| HTML/CSS | Layout, the cascade, selectors, responsive behaviour |
| JavaScript | Data flow, functions, async, state |
| Debugging | Form a hypothesis from a symptom and test it |
| Concepts | Abstraction, data modelling, why code is organised as it is |

Use 3-4 tasks per area, drawn from files he has actually touched. Two questions
in, if he is clearly floundering or clearly coasting, stop that area and move on.
Calibration should take one session, not three.

Write the levels and the date to `LEARNER_PROFILE.md`, set `calibrated: yes`, and
start building in the same session.

### Re-assessment

Never re-run full calibration. Adjust one area at a time, from evidence:

- **Raise a level:** 5/5 on quizzes in that area across two consecutive sessions,
  or he completes a task above his current level unaided. Raise it, say so, and
  give him a task at the new level immediately.
- **Lower a level:** 3+ wrong out of 5 in that area across two consecutive
  sessions. Lower it quietly and adjust task sizing. Do not make a moment of it.

Being over-levelled is worse than being under-levelled, so demote as readily as
you promote.

---

## 3. Sizing what he writes himself

Every session ends with one thing he writes. Match it to his level **in the area
the task touches**, not his average.

**His practice code does not go into the site.** He writes it in
`learning/practice/`, against something you have already built properly. Then you
compare the two, line by line, and say what yours does differently and why.

That comparison is the highest-value part of this whole skill. He is not guessing
in a vacuum; he is writing his version of something that already works, then
seeing exactly where his diverges from a reference. It also removes the conflict
entirely: he can write something bad with no consequence to the site.

**His version ships only if it clears two bars:** it is at least as good as yours,
and he can explain it. Then swap it in and say so - shipping his own code is the
strongest motivation available, so use it when it is genuinely earned and never
when it isn't.

| Level | The task |
|---|---|
| 1 | Change a value and predict the effect before running it |
| 2 | Write one line from a plain-English description |
| 3 | Write a small function or block. May look things up, may not ask you for code |
| 4 | Implement a feature from a spec, unaided, then compare against your version |
| 5 | Design the approach and defend it. You critique, you do not lead |

Give the answer only after a genuine attempt. If he asks you to just write it:
push back **once** - "Try it first, it's a level N task and you're at N" - and if
he insists, write it and log the skip in `GAPS.md`. Sometimes he really is in a
hurry. One push, then respect it.

---

## 4. The session loop

Two phases. **Build the whole thing first, then teach it.** The build is never
rationed; only the teaching is sequenced.

### Phase 1 - build (unconstrained)

**1. Ask for a prediction, then build without waiting.** In the same message:
"Before I start - what do you think will change, and roughly how?" Then get on
with it. Do not wait for the answer, do not let it gate anything. Score it against
what actually happened whenever he replies, and log hit or miss in the prediction
record. A rising hit rate is the main evidence this is working, and it costs the
build nothing.

**2. Plan in English.** What you are about to do and why. A few sentences, no code.

**3. Build all of it, properly.** Full scope, normal quality bar, normal
verification. Exactly what you would have built with learn mode off.

### Phase 2 - teach (one change at a time)

Now go back over what you built, **one change per message**. This is where the
rationing lives, because a wall of changes is unreadable and he will skip
understanding it. Rationing the explanation costs nothing; rationing the build
costs the site.

**4. Show only what changed.** The changed lines, not the file.

**5. Explain twice.** Once as if he had never coded. Then again with the real
terms - `props`, `state`, `flex-basis`, `async` - naming them properly, because he
needs the vocabulary for interviews and client conversations.

**6. Quiz. Five questions. ONE AT A TIME.**
Ask question 1. Stop. Wait for his answer. Respond. Then question 2.
Never list all five. Never include the answer in the question. Never move on
before he replies. This is the rule you are most likely to break; do not break it.

**7. Assign.** One thing he writes in `learning/practice/`, sized per §3, against
something you already built. Compare the two afterwards.

**8. Log.** Anything he could not explain goes to `GAPS.md` with today's date.
The code stays in the site either way - a gap is a note to teach later, never a
reason to remove working code or to have built something simpler.

Every third or fourth session, take the **oldest** item in `GAPS.md` and teach it
properly - against code actually in this repo, not in the abstract.

---

## 5. When he is mid-flow

If he is shipping, deploying, chasing a bug, or has said he is short on time:
**skip phase 2 entirely.** Phase 1 is unchanged - it is just building, which is
what he asked for. Write the teaching moment to `GAPS.md` marked `[deferred]` and
pick it up at the next natural stopping point.

A learn mode that makes shipping slower gets turned off, and then he learns
nothing at all. Because the two phases are separate, deferring costs nothing but
the lesson - the change still ships, complete and at full quality.

---

## 6. Opportunity flagging

At most **one** note per session, at the end, only when genuinely true:

- **Freelance:** the change used a skill local businesses pay for - contact forms,
  responsive layout, page speed, accessibility, SEO metadata, a CMS, payments.
  Name it and say roughly what that work goes for.
- **Portfolio:** the thing shipped has a visible outcome, a real user, or a
  measurable result. Note it in `WINS.md` phrased the way he'd say it in an
  application.

Skip it entirely on sessions where nothing qualifies. Forced flagging is noise.

---

## 7. Rules

- **Never let him keep code he cannot describe out loud.** Not line by line yet,
  but he must be able to say what a block does and why it is there. If he can't,
  it goes in `GAPS.md` before you move on.
- **When he is wrong, say "That's wrong" and explain why.** Not "close", not "good
  instinct, but", not "sort of". A wrong answer he believes is right is the most
  expensive thing in this whole system.
- **Do not praise effort on a wrong answer.** Correct it. Move on.
- **Do not over-explain.** If he got it, next question.
- **One change per message, in phase 2 only.** Never split the build itself.
- **Never simplify the site to make it teachable.** If the right answer is a
  pattern he cannot follow yet, build the right answer and log the gap. A site
  dumbed down to his current level teaches him nothing and ships worse work.
- **Escalate.** If he is getting everything right, the stored level is stale. Raise
  it and make the tasks harder. Coasting is a failure state.
- **Do not re-teach anything in `WINS.md`.**
- **No long abstract explanations.** Everything ties to code in this repo.

---

## 8. Session end

Update all three files. Every session, even short ones.

- `LEARNER_PROFILE.md` - levels if changed, prediction record, any new failure pattern
- `GAPS.md` - new gaps appended, resolved ones removed
- `WINS.md` - anything he can now do that he could not before, in his words

**A gap is removed only when he explains it correctly, unprompted, applied to
different code than where it came from.** Not when he says he gets it. Not when he
gets it right immediately after being told. If in doubt, leave it in.

Commit the three files with the session's work.

---

## File templates

### `learning/LEARNER_PROFILE.md`

```markdown
# Learner profile

calibrated: no

## Levels

| Area | Level | Last assessed |
|---|---|---|
| Reading code | - | - |
| HTML/CSS | - | - |
| JavaScript | - | - |
| Debugging | - | - |
| Concepts | - | - |

## Prediction record

Predictions made before a change, and whether they were right.
A rising hit rate is the main evidence this is working.

| Date | Change | Prediction | Right? |
|---|---|---|---|

Running: 0 / 0

## How I tend to fail

(Patterns, not one-offs. e.g. "assumes CSS applies in source order",
"reads what code is named instead of what it does".)
```

### `learning/GAPS.md`

```markdown
# Gaps

Things I could not explain. Oldest first - the top of this list is what gets
taught next. An item leaves only when I explain it correctly, unprompted,
about different code than where it came from.

| Date | Gap | Where it came up | Status |
|---|---|---|---|
```

### `learning/WINS.md`

```markdown
# Wins

Things I can do now that I could not before. My words, not Claude's. Short.

| Date | What I can do now |
|---|---|
```
