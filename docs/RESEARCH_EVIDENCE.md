# Evidence behind Pactra's product hypothesis

## Written terms are a concrete design concern
NYC's Department of Consumer and Worker Protection states that covered freelance contracts worth $800 or more must be written, including aggregated agreements of $800 within120days, and specify the work, pay, and payment date.[1]

This is a jurisdiction-specific example of institutional recognition of written scope and payment terms. It is not a universal legal rule and does not establish that Pactra satisfies NYC law. Pactra's design response—record the same scope before work—is an inference, not an externally validated outcome. No retrieved source establishes how frequently vague scope causes disputes among Pactra's intended users.

## Localization is more than matching strings
W3C Internationalization guidance explains that composite messages that work in one language may be difficult or impossible in another because sentence structure and agreement differ.[2]

This supports keeping technical checks separate from linguistic judgment. It does not endorse Pactra's placeholder grammar, certify translations, or prove that flat JSON is the best market entry point. JSON localization is a deliberately bounded engineering choice; its market fit still needs testing.

## Confident AI output can be wrong
NIST's Generative AI Profile describes confabulation as confidently presented erroneous or false output and discusses the risk of users acting on that output, especially for consequential decisions.[3]

Pactra therefore keeps semantic review advisory and requires human acceptance. That boundary is the team's risk-management choice, not a NIST certification. Evidence-excerpt validation can establish correspondence to text but cannot establish semantic correctness. Human reviewers can also make mistakes.

## What these sources do not demonstrate
There is no validated claim here that Pactra reduces disputes, accelerates payment, improves translation quality, prevents fraud, or is legally enforceable. Escrow/allocation and arbiter policy remain proposed product mechanisms, not research-proven remedies. Do not invent market-size figures or failure rates to strengthen a pitch.

Validation plan: interview buyers/workers about concrete scope disagreements; observe whether both can understand the same manifest; compare checker findings against independently reviewed localization fixtures; measure mistaken acceptance and revision decisions in a consented pilot. Define baselines before claiming improvement.

## Internal implementation evidence is separate
PRODUCT.md, CHECKER.md, PERSISTENT_BACKEND.md, AZURE_AI.md and FRONTEND.md describe our implementation and limitations. They are appropriate evidence for what the repository contains, but not independent evidence of market need or effectiveness. The journal labels external rationale separately from implementation notes.

## Sources

[1] https://www.nyc.gov/site/dca/workers/workersrights/freelancer-workers.page
    > "The written contract must spell out the work you will perform; the pay for the work; and the date you get paid."
[2] https://www.w3.org/International/articles/composite-messages
    > "Unfortunately, even if this works in one language, it can be either difficult or impossible to deal with such composite messages in other languages because of differing rules for sentence structure, agreement and so on."
[3] https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf
    > "“Confabulation” refers to a phenomenon in which GAI systems generate and conﬁdently present
erroneous or false content in response to prompts."
