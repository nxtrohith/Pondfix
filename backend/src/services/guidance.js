// Plain-language explanation and next step for an alert. Generic by design: these are not validated for any species or farm, so they
// only say what to verify and never claim a pond is safe. Presentation of stored alert fields; no threshold logic lives here.
const WHY = {
  'dissolved_oxygen.low': 'Low dissolved oxygen can stress aquatic stock, and it often drops overnight and in warm weather.',
  'dissolved_oxygen.high': 'Unusually high dissolved oxygen is uncommon and may point to a sensor fault.',
  'ph.low': 'Low pH (acidic water) can stress stock and change how toxic other substances in the water are.',
  'ph.high': 'High pH can stress stock, and it makes ammonia more toxic.',
  'temperature.low': 'Cold water slows feeding and growth and can stress stock.',
  'temperature.high': 'Warm water holds less oxygen and raises stock oxygen demand.',
  'water_level.low': 'A very low water level concentrates waste, swings temperature and oxygen quickly, and can strand stock. A reading of zero can also mean the level sensor is out of the water or has failed.',
};
const ACTION = {
  'dissolved_oxygen.low': 'Verify the sensor reading, inspect stock behaviour, check aeration, and follow your farm’s operating procedure.',
  'dissolved_oxygen.high': 'Verify the sensor reading and compare it with a hand-held meter.',
  'ph.low': 'Re-test the water with a second meter or test kit, and review recent treatments and rainfall run-off.',
  'ph.high': 'Re-test the water with a second meter or test kit, and review recent liming, fertiliser and algae growth.',
  'temperature.low': 'Verify the sensor reading, check for cold inflow or weather, and adjust feeding to your farm’s procedure.',
  'temperature.high': 'Verify the sensor reading, check shade and water flow, and adjust feeding to your farm’s procedure.',
  'water_level.low': 'Check the level on site (and that the sensor is submerged and wired), then check inflow, leaks and outlets, and refill per your farm’s procedure.',
};

export function describeAlert(a) {
  const key = `${a.parameter}.${a.direction ?? 'low'}`;
  const forecast = a.origin === 'predicted';
  const scope = a.ruleScope === 'species' ? `species-specific limits${a.profileVersion ? ` (${a.profileVersion})` : ''}` : 'the general safety rules';
  return {
    explanation: `${forecast ? 'Forecast, not a measurement. ' : ''}${WHY[key] ?? 'This reading is outside the configured range.'} Classified with ${scope}.`,
    recommendedAction: ACTION[key] ?? 'Verify the reading and follow your farm’s operating procedure.',
  };
}
