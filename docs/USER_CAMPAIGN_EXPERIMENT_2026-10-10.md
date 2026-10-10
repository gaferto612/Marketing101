# Experiential campaign audit — 10 October 2026

## Scope and method

An isolated Chrome session exercised the published GitHub Pages app through visible controls, without API-seeding data. This was an evaluator walkthrough, not a study with recruited users. No real publication, expenditure, audience exposure, or sales occurred. Product details below are fictional inputs, not verified claims about a real course.

Scenario: promote a sales-conversation course to Arabic-speaking small-business owners in Denmark. Three live online one-hour sessions, exercises and a worksheet; practice using examples from the participant's business. Seven-day organic campaign, zero DKK, user-selected target of five qualified enquiries. The target is not a forecast.

## Observed journey

1. Saved the brand and product, including audience problem, differentiator, approved facts and CTA.
2. Saved a seven-day enquiries strategy and created a campaign. The campaign retained its five-lead planning target and hypothesis.
3. Generated and saved all six content formats. Reviewed their actual output, rather than only testing whether generation succeeded.
4. Reused the saved social draft in a second campaign. It became the first piece; the other two remained generic campaign templates.
5. Edited the first piece, saved, reviewed and approved. Approval was disabled until the review checkbox was selected.
6. Used the explicitly labeled quick-demo schedule. Three simulated delivery receipts and an activity history appeared; campaign completed. Actual result reports remained empty.
7. Checked the campaign creator at 390 × 844: no horizontal overflow. No JavaScript page errors were observed during this journey.

## Findings and priority

| Priority | Evidence | User/marketing impact | Recommended change |
|---|---|---|---|
| P1 | Reusing studio content changed the request from seven days to two weeks and replaced the enquiries strategy with a generic introduction objective. | The user loses campaign intent while moving between features. | Allow content selection within a saved strategy; preserve goal, duration, budget and hypothesis. Confirm any deliberate replacement. |
| P1 | CTA was “اطلب برنامج الدورة ومواعيدها برسالة” with no contact destination. Approval still worked in the demo. | A reader has no concrete next step if this copy is exported without context. | Add a campaign readiness check for where/how a customer responds. Demo may continue, but flag missing response path before a real launch. |
| P1 | A zero-budget campaign suggested two “Paid social” pieces. | Channel plan contradicts the user's resources. | Select organic/manual channels for zero budgets and explain distribution tasks. |
| P2 | Generic campaign pieces used the product name and first fact, omitting the supplied audience problem and differentiator. | Three similar introductions do little to address different buying questions. | Plan distinct pieces: problem and relevance, demonstration/evidence, then offer and next step. |
| P2 | Studio produced “هل تتساءل عن كيف أشرح قيمة خدمتي عندما يسأل العميل عن السعر؟؟” and “لـأصحاب … الناطقون”. | Awkward grammar and doubled punctuation reduce polish and readability. | Handle existing question sentences and punctuation; avoid prefixes requiring uncertain grammatical transformations. |
| P2 | Ad copy repeated its headline in the body; social and email reused long shared blocks. | Formats look mechanically adapted, with unnecessary reading effort. | Give each format its own length, opening, structure and preview; shorten ads, expand email context deliberately. |
| P2 | Studio defaulted to Awareness after an enquiries strategy. | The user must remember and re-enter strategic choices. | Carry the active brief into studio and display the active objective clearly. |
| P2 | Six drafts occupy a very long page; navigation and review controls are English while the content is Arabic. | New Arabic users must learn several disconnected areas and scroll to compare pieces. | Add a guided Arabic/RTL journey, compact draft list and side-by-side comparison; retain advanced tools separately. |

## Psychological assessment

The supplied product information supports relevance: a specific audience, a recognizable question about explaining value, practical exercises and a concrete course format. The studio captures more of this than the generic campaign planner. Neither output establishes that the instructor is credible or that the reader will achieve a result. This must come from real evidence such as an instructor introduction, an actual sample lesson or a permitted example—not invented testimonials or guarantees.

Current openings mostly introduce the product before establishing why the reader should care. The following manual revision makes the problem and the nature of the training more explicit. It is a candidate to test, not a proven winner:

> بتشرح خدمتك، لكن السؤال بيرجع دائماً للسعر؟
> في دورة محادثات البيع، نتدرّب على أسئلة لفهم احتياجات العميل وشرح العرض بوضوح.
> ثلاث جلسات مباشرة عبر الإنترنت، مع تمارين وورقة عمل. نطبّق الأسئلة على أمثلة من مشروعك.
> لأصحاب المشاريع الصغيرة الناطقين بالعربية في الدنمارك.
> اطلب برنامج الدورة ومواعيدها برسالة.

The last line still requires an actual response destination. Schedule, price if applicable, instructor evidence and registration details must be supplied before a real launch. Psychological effectiveness cannot be inferred from successful software execution.

## Practical launch plan

Before external connections, the app can prepare and export reviewed assets. A zero-budget campaign still needs manual distribution through an owned page or a community that permits promotion; it has no guaranteed reach. Use one opening addressing the price question and another showing a real sample exercise, keeping the offer and CTA comparable. Measure actual qualified enquiries, record where they came from, and note exposure where available. Define “qualified” before launch, for example an audience-fit person who asks about attendance or registration. Five enquiries remains an aspiration. Small or uneven exposure does not establish a winning variant.

The current three-piece demo is insufficient evidence of a seven-day marketing strategy. Build a schedule with a purpose for every piece, a real response path, a human follow-up process and supplied answers to likely questions. Do not enable autonomous spending based on this walkthrough.

## Verdict and evidence

Operational demo: passed the observed save → generate → edit → approve → simulate → inspect journey. Marketing readiness: requires the strategy-preservation fix, response destination and stronger differentiated copy. Business effectiveness: unknown until real audience testing.

Reproduction script: `test-results/user-experiment.mjs` (ignored local artifact). Full observed outputs: `test-results/user-experiment.json`. Screenshots: `user-strategy-campaign.png`, `user-content-kit.png`, `user-completed-demo.png`, `user-mobile.png` under `test-results/`. The temporary profile did not change the user's existing browser data. This audit did not change production code or GitHub settings.
