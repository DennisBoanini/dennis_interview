# Reviewer rubric

## Review principles

- Score demonstrated behaviour and judgement, not resemblance to a reference implementation.
- Apply the same core requirements to mid-level and senior candidates. Raise the depth expected
  from senior candidates without silently adding features to their scope.
- Do not reward abstraction, dependency count, or test count by themselves.
- AI usage is permitted. Assess understanding, correction, and verification, not whether a tool
  was used.
- Treat private checks as evidence about observable correctness, not as the complete evaluation.
- Score the candidate's own test selection independently from private pass/fail results.
- Never use a private check to enforce behaviour absent from the published contract.
- Record evidence for every score so uncertain areas can be validated in the interview.

## Scoring

### 1. Functional behaviour — 25 points

| Score | Evidence |
| --- | --- |
| 0–9 | Major path does not run; API or UI is absent; transformation is fundamentally incorrect. |
| 10–17 | Main path works with supplied data but has correctness gaps in ordering, joining, multiline messages, or UI states. |
| 18–22 | Correct end-to-end behaviour, responsive layout, and deliberate edge-case handling. |
| 23–25 | Robust, deterministic behaviour with especially clear handling of malformed or changing fixture data, without unnecessary scope. |

### 2. Backend and API design — 20 points

| Score | Evidence |
| --- | --- |
| 0–7 | Tight coupling, fixed-size assumptions, fragile JSON handling, or unclear endpoint behaviour. |
| 8–14 | Clear Spring implementation with reasonable types and separation; some design or error-handling gaps. |
| 15–18 | Idiomatic Java, explicit API DTOs, efficient join/sort logic, concurrency-safe in-memory creation, and proportionate error handling. |
| 19–20 | Excellent boundary design and production-aware reasoning while keeping the exercise simple. |

Senior signal: can explain complexity, concurrent-write guarantees, data-integrity choices, API
evolution, and what would change with a database or large dataset.

### 3. React, TypeScript, and accessibility — 20 points

| Score | Evidence |
| --- | --- |
| 0–7 | Data is hard-coded or imported from fixtures; typing is weak; layout or core states are missing. |
| 8–14 | Real API integration, useful types, and responsive rendering with some semantic or accessibility gaps. |
| 15–18 | Clear async state model, faithful responsive design, semantic structure, and sensible image/status treatment. |
| 19–20 | Excellent component boundaries and accessibility details without overengineering. |

Senior signal: can discuss race conditions, cancellation, schema validation boundaries, rendering
cost, and accessible error recovery.

### 4. Testing — 15 points

| Score | Evidence |
| --- | --- |
| 0–4 | No meaningful tests, or tests are non-deterministic and do not protect behaviour. |
| 5–10 | Useful happy-path coverage with limited edge or UI-state coverage. |
| 11–13 | Focused backend and frontend tests cover the main risks and asynchronous states. |
| 14–15 | Strong risk-based strategy, clear test boundaries, and concise explanation of deliberate omissions. |

Senior signal: distinguishes unit, slice/integration, and component-test value and avoids brittle
mocks and unnecessary end-to-end setup.

A candidate who passes every private check but adds no meaningful tests should not receive a high
testing score. Conversely, review any private failure against the published contract before it
affects the score.

### 5. Engineering judgement and communication — 10 points

| Score | Evidence |
| --- | --- |
| 0–3 | Important assumptions are hidden; complexity is unexplained; submission is difficult to run. |
| 4–7 | Useful notes and mostly proportionate decisions with some weakly explained trade-offs. |
| 8–9 | Clear prioritisation, assumptions, verification, and unfinished-work notes. |
| 10 | Particularly strong scope control and evidence-based trade-offs appropriate to the timebox. |

Senior signal: identifies organisational and operational trade-offs, not only code-level
alternatives.

### 6. Critical and verifiable AI usage — 10 points

If no AI was used, assess the candidate's explicit statement and verification discipline; do not
invent a penalty for choosing not to use AI.

| Score | Evidence |
| --- | --- |
| 0–3 | Claimed AI-assisted work is not understood, material usage is concealed, or output appears accepted without verification. |
| 4–7 | Tools and uses are disclosed; candidate can explain most generated or influenced work and names verification performed. |
| 8–9 | Clear examples of challenging, correcting, or rejecting output plus targeted verification. |
| 10 | AI was used or declined with exceptional judgement; evidence shows ownership of decisions and reliable verification. |

Do not require a raw transcript. Never ask candidates to disclose secrets or unrelated/private
conversation history.

## Overall guidance

| Total | Interpretation |
| --- | --- |
| 0–49 | Does not yet demonstrate the role's baseline. |
| 50–64 | Mixed evidence; interview only if gaps are plausibly timebox- or setup-related. |
| 65–79 | Solid mid-level evidence. Use the interview to validate ownership and depth. |
| 80–89 | Strong submission with senior indicators. |
| 90–100 | Exceptional evidence; verify that the candidate owns and understands the work. |

The total is decision support, not an automatic hiring decision. Document material concerns about
authorship, respectful conduct, security, or inability to explain the submission separately and
validate them in the interview.

## Review workflow

1. Follow the candidate's documented commands from a clean environment.
2. Run the private contract suite and record its evidence separately.
3. Review candidate-authored tests and notes; do not infer testing practice from the private suite.
4. Score every category with one or two evidence statements.
5. Mark uncertain areas as interview questions rather than guessing.
6. Choose one small live change appropriate to the candidate's implementation.
7. Aim to complete the review in 30–45 minutes.
