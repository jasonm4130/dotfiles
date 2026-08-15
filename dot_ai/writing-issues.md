# Filing issues upstream

How to write a bug report or feature request that a maintainer acts on. Written
for the case that actually comes up here: a defect found in someone else's
library, provider or tool while building something with it.

**Never file, comment on, or reopen anything on someone else's tracker without
explicit approval.** Draft it, show Jason, wait. Filing is outward-facing and
public, and a wrong or duplicate report costs a stranger their unpaid time.

## The one thing to understand first

Triage is expensive and asymmetric. One or two people face an unbounded stream of
reports, and their default is to close. React Native's kelset, after four years
maintaining, estimated that of five issues read on an average day, three are an
instant close, one needs heavy hand-holding, and one is useful. So the report is
not competing against a blank slate — it is competing for attention against a
queue, and everything below is about paying down the maintainer's cost rather
than your own convenience.

Anthony Fu (Vue/Vite) calls a minimal reproduction "asking for equity of the
effort spent": without one the maintainer spends hours just establishing whether
the bug is real. Simon Tatham's older framing is still the most useful single
sentence — the aim is **to let the programmer see the program failing in front of
them.** Everything else is a proxy for that.

## Rank your evidence honestly

Laurence Tratt's six tiers, best to worst, are the most practical calibration
available:

1. A test case and a complete fix
2. A test case and a partial fix
3. A test case alone
4. A partial description of how to trigger it
5. A description of the effects
6. "It doesn't work"

Tiers 2–3 are usually enough for a maintainer to work out what happened. Tiers
4–5 "can go either way." Know which tier you are filing at, and if you are at 4
or below, ask whether an hour's more work moves you to 3 — that hour is
routinely cheaper than the round-trip it saves.

The tier that matters most is not the one you'd guess: **a failing test written
against the project's own code often beats a reproduction of your setup**, because
it runs in their CI without your environment. Nolan Lawson's advice is to open a
PR with just the failing test, even when you cannot fix it — it "bypasses a lot of
lengthy discussion about how to reproduce the bug."

## Structure

Follow the project's issue template exactly where one exists — structured YAML
templates measurably outperform prose, and skipping fields reads as carelessness.
Absent a template, this order works and mirrors what the good ones ask for:

**Summary** — one dense paragraph: what is impossible or broken, the exact error,
and the mechanism if you know it. A maintainer decides whether to keep reading
here.

**Versions** — exact strings, not "latest". Library version, language/runtime
version, OS, relevant hardware, and the date you verified it live. curl asks for
the output of `curl -V`; Rust's ICE template *requires* `rustc --version
--verbose`. Give the machine-generated string, not your recollection of it.

**Reproduction** — minimal and complete. The Terraform AWS provider quantifies the
value bluntly: a 10-line config that reproduces a bug is "perhaps 100× more
useful" than a 1000-line one. Then the actual failure output, verbatim, including
error numbers. Then, if you have it, the payload or trace that shows the wrong
value on the wire.

**Root cause** — if you found it. Name the function, file and line; quote the
source verbatim in a code block; explain the mechanism in prose. This is a formal
triage stage in its own right, not a bonus: Terraform Core labels an issue
`explained` once someone locates the defect in the codebase, separately from
`confirmed`. Miško Hevery (Angular) says the most helpful thing beyond repro steps
is a guess at where the bug lives, "even if the guess is completely wrong."

**Ruling out the adjacent** — name the existing issue or fix that looks like
yours and say precisely why it does not cover this. Skipping this is how a real
report gets closed as a duplicate.

**Workaround** — what you did instead, and what it costs. This is also what makes
the report useful to the next person who hits it via search.

**Suggested fix** — concrete, and offer the PR if you have one.

## Facts, then speculation, and never blended

Tatham: "make very clear what are actual facts ... and what are speculations.
Leave out speculations if you want to, but don't leave out facts." Mozilla says
the same. This is the rule most often broken by a *confident* reporter, and it
is the one that destroys credibility fastest — a mechanism you assembled from
circumstantial evidence, stated as fact, gets found out the moment a maintainer
who knows the code reads it.

Say "not established" where it is not established. A report that separates what
was observed from what is inferred is more persuasive, not less.

## Be verbose rather than terse

"If you say too much, the programmer can ignore some of it. If you say too
little, they have to come back and ask more questions." The round-trip is the
expensive part — Home Assistant maintainers say outright that an issue needing
back-and-forth before investigation can begin is one they are unlikely to reach.
Length is not the cost. A wasted round-trip is.

## When a clean reproduction is impossible

The vendor hardware case, the paid API, the state that took a real session to
reach. Maintainers do **not** lower the bar here; they accept different evidence
for the same claim. Substitute, in rough order of strength:

- **A failing test against their code**, using captured real-world data as the
  fixture. This is the strongest move available and it converts an
  environment-bound bug into something their CI can run.
- **Captured payloads** — the actual request and response, before and after.
  Terraform requires `TF_LOG=trace` output in a gist; curl requires `-v`/`--trace`;
  Home Assistant wants the redacted diagnostics JSON plus debug logs. Redact
  secrets yourself, and say that you did.
- **Source-level root-cause analysis** with file and line references.
- **Bisection to a culprit commit.** The kernel's regression process is explicit
  that maintainers often *cannot* reproduce environment-specific bugs and that
  locating the commit therefore falls to the reporter.
- **Before/after captures** from the real system, with the diff called out.

Terraform Core's `waiting for reproduction` is a *status, not a rejection* — it
stays open while you supply evidence, and closes after ~30 days of silence with an
invitation to resubmit. Treat a "cannot reproduce" reply as a request, not a
verdict.

Say plainly what you could not test, and why. Chromium now explicitly rejects
unvalidated AI-generated reports — the ambient trust level for a report that
looks confident but was not verified is dropping, and the defence is showing your
work.

## Feature requests are a different genre

The evidence standard inverts: **a bug is proved by a reproduction, a feature is
argued by a use case.** Structure follows from that.

Check where they go first — GNOME, PrestaShop, Rust and CPython route feature
requests to Discussions or a forum, because open-ended "is this needed" debate
degrades a tracker meant for closeable work. Go, Rust and Python all require a
design doc, RFC or PEP for anything notable.

State the problem before the solution: what you are trying to accomplish, who is
affected and how often, and why the existing workaround is insufficient. Leading
with your proposed solution is the XY problem, and it is the standard failure
mode. Include prior art and the alternatives you rejected. Say whether you are
willing to implement it.

Feature requests get closed for reasons a bug never does — out of scope,
maintenance burden disproportionate to the benefit, no maintainer capacity, or
an API "spelled wrong for the project." None of those are about whether your idea
is good.

## What actually gets things closed

| Close reason | The fix |
|---|---|
| Cannot reproduce | Minimal repro, or the substitutes above |
| Not enough information | Versions, verbatim output, environment — before being asked |
| Stale | Answer the info request; two weeks of silence is a common auto-close |
| Duplicate | Search first, and name the near-misses you ruled out |
| Intended behaviour | Quote the doc you believed, and say what you expected |
| Out of scope / capacity | Only applies to features; argue the use case, not the patch |

Search before filing. Eric Raymond's point is that visible diligence is a
*credibility* signal, not a formality — showing what you already checked is what
distinguishes you from the three-in-five that get closed on sight.

Duplicates are worth one correction: developers report encountering them often
but **do not consider them especially harmful**, and duplicate reports were
measured to add extra stack traces, screenshots and patches not in the original.
Do not let fear of duplicating stop you filing something well-evidenced — search
properly, then file, and link the one you think it might duplicate.

## Sources

Maintainer guidance — Tatham, [How to Report Bugs Effectively](https://www.chiark.greenend.org.uk/~sgtatham/bugs.html) · [curl BUGS](https://curl.se/docs/bugs.html) · [Django](https://docs.djangoproject.com/en/dev/internals/contributing/bugs-and-features/) · [Mozilla Bug Writing Guidelines](https://developer.mozilla.org/docs/mozilla/qa/bug_writing_guidelines) · [Chromium](https://www.chromium.org/for-testers/bug-reporting-guidelines/) and [security-for-agents](https://chromium.googlesource.com/chromium/src/+/main/docs/security/security-for-agents.md) · [Terraform BUGPROCESS.md](https://github.com/hashicorp/terraform/blob/main/BUGPROCESS.md) · [terraform-provider-aws debugging](https://hashicorp.github.io/terraform-provider-aws/debugging/) · [external-dns](https://github.com/kubernetes-sigs/external-dns/blob/master/docs/contributing/bug-report.md) · [Home Assistant](https://www.home-assistant.io/help/reporting_issues/) · [Linux kernel reporting-regressions](https://docs.kernel.org/admin-guide/reporting-regressions.html) · ESR, [How To Ask Questions The Smart Way](http://www.catb.org/~esr/faqs/smart-questions.html)

Triage and burnout — [Anthony Fu, Why Reproductions are Required](https://antfu.me/posts/why-reproductions-are-required) · [Peter Hutterer, libinput issue policy](http://who-t.blogspot.com/2024/12/a-new-issue-policy-for-libinput-closing.html) · [kelset, React Native retrospective](https://gist.github.com/kelset/05ae2f4a861c2252fc592ebadd7e0f25) · [Miško Hevery, How to file an issue](https://blog.angular.dev/how-to-file-an-issue-715391a093d2) · [Théo Zimmermann on stale bots](https://www.theozimmermann.net/2021/11/known-issues/) · [Jeff Geerling, burden of a maintainer](https://www.jeffgeerling.com/blog/2022/burden-open-source-maintainer) · [jlowin, saying no](https://jlowin.dev/blog/oss-maintainers-guide-to-saying-no)

No-repro case — [Tratt, A week of bug reporting](https://tratt.net/laurie/blog/2022/a_week_of_bug_reporting.html) · [Nolan Lawson, How to fix a bug in an open source project](https://nolanlawson.com/2015/12/28/how-to-fix-a-bug-in-an-open-source-project)

Research — Bettenburg et al., [What Makes a Good Bug Report?](https://thomas-zimmermann.com/publications/files/bettenburg-fse-2008.pdf) (FSE 2008; 466 responses. Correlation between what developers consider important and what reporters provide: −0.035, while reporters' own sense of what matters correlates 0.839 with developers' — a tooling gap, not ignorance) · [Zimmermann et al., TSE 2010](https://thomas-zimmermann.com/publications/files/zimmermann-tse-2010.pdf) · [Duplicate Bug Reports Considered Harmful… Really?](https://people.csail.mit.edu/hunkim/images/b/b2/Papers_Bettenburg2008icsm.pdf) (ICSM 2008) · [Joorabchi et al., MSR 2014](https://dl.acm.org/doi/10.1145/2597073.2597098) (~17% of reports non-reproducible; 66% of those later marked Fixed were eventually reproduced) · [Rahman, Khomh & Castelluccio, EMSE 2022](https://web.cs.dal.ca/~masud/papers/masud-EMSE2022.pdf) · [Chaparro et al., Euler, FSE 2019](https://ojcchar.github.io/files/13-fse19.pdf) (~49% of reports contain no steps to reproduce) · [Issue templates, 100 projects / 1.9M issues](https://dl.acm.org/doi/10.1145/3643673) (mean time-to-resolution 103 vs 381 days; YAML templates 24 vs 81 days — note a [TSE 2022 regression-discontinuity study](https://whystar.github.io/res/paper/template-TSE2022.pdf) finds resolution duration *longer* post-adoption once selection effects are controlled, so treat the headline numbers as contested)
