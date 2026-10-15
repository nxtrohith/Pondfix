---
category: aquaguard_docs
topic: sensors
species: general
region: India
review_status: pending_expert_review
source_status: project_documentation
version: 0.1.0
---
# AquaGuard sensor reference

What each sensor measures, what it cannot tell you, and what affects its accuracy.

| Sensor | Measures | Cannot tell you |
| --- | --- | --- |
| Dissolved oxygen probe | oxygen in water, usually mg/L; supports low-oxygen detection and trends | disease, or ammonia. Calibration, probe condition, placement and temperature compensation affect quality. |
| pH sensor | acidity or alkalinity on the pH scale | alkalinity, ammonia, or the cause of a pH change. Calibration and fouling matter. |
| Water temperature probe | temperature of the pond water | anything else. It must be in the water. |
| DHT22 temperature/humidity | **air** temperature and humidity | **water temperature.** If a DHT22 sits near the pond, never present its value as pond-water temperature. Use a waterproof water probe for that. |
| Water-level sensor | distance to the water surface or a level reading | oxygen, water quality, leakage or usable pond volume. Mounting height, reference level and calibration decide what it means. |
| Camera / computer vision | fish movement, low activity, motionlessness | lesions or parasites unless the model is trained and validated for that; fish out of view; water chemistry |

## Not measured
Ammonia, nitrite, alkalinity and turbidity are not measured by this hardware. Show them as "Not measured" and never assume the pond is safe on them. For a prototype they can be entered by hand after a water test.

## Quality checks
A sensor can be wrong. Several sensors changing at once can be a real event or a shared fault such as power, wiring or a network problem. Verify with a calibrated handheld instrument before acting on non-emergency changes.
