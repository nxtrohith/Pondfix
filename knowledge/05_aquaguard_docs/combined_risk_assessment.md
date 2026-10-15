---
category: aquaguard_docs
topic: combined_risk_assessment
species: general
region: India
review_status: pending_expert_review
source_status: design_intent
version: 0.1.0
---
# Combined environmental and behaviour risk assessment

AquaGuard's aim is to weigh environmental readings together with fish behaviour, instead of reporting separate unrelated alerts. These categories are proposed decision groups, not validated disease probabilities. The system does not assign a specific disease from a combination of signals.

## Three kinds of evidence
- **Environmental**: abnormal temperature, pH, DO, ammonia, water level.
- **Behavioural**: less swimming, lasting motionlessness, changed swimming pattern, surface-oriented behaviour, a sudden rise in affected fish.
- **Health**: visible lesions, odd posture, fin damage, colour change, only if the vision model can detect them reliably.

## Interpretation
| Environment | Behaviour | Interpretation |
| --- | --- | --- |
| normal | normal | no abnormality detected |
| one abnormal parameter | normal | environmental warning |
| several abnormal parameters | normal | elevated environmental risk |
| one abnormal parameter | reduced activity | possible environmental stress |
| several abnormal parameters | reduced activity | high-priority investigation |
| normal | persistent motionlessness | behaviour anomaly needing inspection |
| abnormal | persistent motionlessness and rising deaths | urgent fish-health emergency |

## What each abnormal reading can directly cause
| Abnormality | Direct effect | Secondary concern |
| --- | --- | --- |
| Low dissolved oxygen | oxygen deficiency, breathing stress | more vulnerable to other stressors |
| High un-ionized ammonia | toxicity and tissue injury | secondary infection |
| High nitrite | poor oxygen transport | signs like low oxygen |
| Very low pH | acid stress, possible gill damage | secondary problems |
| Very high pH | alkaline stress, tissue damage | more ammonia toxicity |
| High temperature | thermal stress, more oxygen demand | some pathogens thrive |
| Low temperature outside range | slower metabolism and feeding | stress from abrupt change |
| Falling water level | changing volume and habitat | temperature swings, more concentrated waste |

## Example
Temperature rising, pH abnormal and several fish moving less at once should be treated as one possible pond-health event, not three separate alerts. Present plausible explanations, the evidence for each, what is not measured, and what to verify. Do not say "disease".

## Reliability
Before trusting a low-activity signal, check that tracking is working: low confidence or lost tracking can mimic low activity. Compare with the species baseline, because normal behaviour differs (an air-breathing catfish surfaces normally).
