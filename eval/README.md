# Private evaluation suite

> `PRIVATE_EVAL_ONLY` — never include this directory in a candidate package.

This directory contains the maintainer-only evaluation harness for the full-stack
interview. It tests the documented backend contract through HTTP and does not import or
assume candidate classes, packages, controller names, or data structures.

## Quick start

Prerequisites:

- Java 25 available through `JAVA_HOME` or `PATH`;
- Node.js 22.12 or later;
- network access for Maven dependencies when they are not already cached.

Run against an extracted candidate submission:

```bash
./eval/run.sh /absolute/path/to/candidate-submission
```

The supplied path may be the project root or a directory containing one project folder.
The evaluator copies the submission into a temporary directory, so it never overwrites
candidate source or fixtures.

Reports are written to `eval/reports/` as both Markdown and JSON. The command exits with
status `0` only when every strict automated check passes.

Useful options:

```bash
./eval/run.sh /path/to/submission --keep-workdir
./eval/run.sh /path/to/submission --report-dir /tmp/lucy-report
```

## Automated evidence

The harness records three separate groups:

1. candidate-visible backend test result (`./mvnw test`);
2. private HTTP contract checks;
3. harness/setup failures, if any.

HTTP checks cover:

- supplied-fixture response status, media type, schema, join, order, and multiline data;
- empty messages through a private fixture replacement;
- alternate users/messages that expose fixed-size, positional-join, and ordering assumptions;
- one valid `POST /api/messages`, including server-generated ID/timestamp and later GET visibility;
- concurrent valid POSTs, checking successful responses, distinct integer IDs, no lost writes,
  and exactly-once visibility through GET.

The concurrency test deliberately does **not** require gap-free IDs, a particular lock,
an `AtomicInteger`, a repository class, or any other implementation detail.

## Fairness boundaries

- Strict alternate-fixture checks use only documented valid records.
- Invalid input and unknown-user policy are reviewed manually because the candidate is
  explicitly allowed to choose and document those behaviours.
- If a candidate intentionally moves the documented fixture paths, treat fixture-injection
  failure as a harness compatibility issue and inspect the submission before scoring it.
- Held-out results are evidence about behaviour, not a replacement for reviewing the
  candidate's own tests, notes, trade-offs, and interview explanation.
- A missing undocumented frontend composer is not a failure; only backend POST is required.

## Manual evaluation checklist

After the automated backend run:

1. Follow the candidate's documented frontend install, test, and build commands from a
   clean dependency tree.
2. Run frontend and backend together and verify the Java API is the final data source.
3. Inspect desktop (>450px) and mobile (<=450px) layouts against `frontend/design/`.
4. Verify loading, empty, error, and recovery behaviour with semantic accessibility output.
5. Review avatar failure treatment, multiline rendering, and stable list keys.
6. Review candidate-authored tests independently of this suite.
7. Read assumptions, trade-offs, unfinished work, verification notes, and AI-usage notes.
8. Score the evidence with `reviewer-rubric.md` and record it in `review-template.md`.
9. Turn uncertain findings into interview questions instead of inferring intent.

## Packaging safety

Create candidate archives only with:

```bash
./scripts/package-for-interview.sh
```

That script uses a top-level allowlist and calls `scripts/verify-candidate-package.sh`.
The verifier rejects evaluator paths, private markers, reports, build output, dependencies,
editor state, symlinks, and unsafe archive paths.

To audit an existing ZIP independently:

```bash
./scripts/verify-candidate-package.sh /path/to/archive.zip
```

Never attach `eval/`, evaluation reports, private fixtures, or a reference solution to a
candidate email, shared Drive folder, or public release.
