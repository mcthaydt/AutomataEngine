import { parseNightDefinition } from './schema'

export { parseNightDefinition } from './schema'
export const NIGHT_DURATION_S = 780

export const nightDefinition = parseNightDefinition({
  version: 1,
  floors: [
    { id: 'lantern', name: 'Lantern Room', y: 216, xMin: -72, xMax: 72 },
    { id: 'navigation', name: 'Radio & Navigation', y: 168, xMin: -76, xMax: 76 },
    { id: 'quarters', name: 'Breaker & Quarters', y: 120, xMin: -80, xMax: 80 },
    { id: 'workshop', name: 'Workshop', y: 72, xMin: -84, xMax: 84 },
    { id: 'machinery', name: 'Generator & Bilge', y: 24, xMin: -88, xMax: 88 }
  ],
  ladders: [
    { id: 'ladder-5-4', from: 'machinery', to: 'workshop', x: 52 },
    { id: 'ladder-4-3', from: 'workshop', to: 'quarters', x: -52 },
    { id: 'ladder-3-2', from: 'quarters', to: 'navigation', x: 52 },
    { id: 'ladder-2-1', from: 'navigation', to: 'lantern', x: -40 }
  ],
  stations: [
    { id: 'beacon', label: 'Beacon Controls', floor: 'lantern', x: 20, circuit: 'beacon' },
    { id: 'radio', label: 'Radio', floor: 'navigation', x: -28, circuit: 'radio' },
    { id: 'chart', label: 'Bearing Chart', floor: 'navigation', x: 34, circuit: 'radio' },
    { id: 'breaker', label: 'Breaker Panel', floor: 'quarters', x: -8 },
    { id: 'workbench', label: 'Workbench', floor: 'workshop', x: 8, circuit: 'workshop' },
    { id: 'generator', label: 'Generator', floor: 'machinery', x: -38 },
    { id: 'pump', label: 'Bilge Pump', floor: 'machinery', x: 38, circuit: 'bilge' }
  ],
  circuits: ['beacon', 'radio', 'bilge', 'workshop'],
  items: [
    { id: 'wrench', label: 'Wrench', floor: 'workshop', x: -48, reusable: true },
    { id: 'fuse', label: 'Spare Fuse', floor: 'workshop', x: -24, reusable: false },
    { id: 'pump-handle', label: 'Pump Handle', floor: 'workshop', x: 0, reusable: true },
    { id: 'boards', label: 'Window Boards', floor: 'workshop', x: 28, reusable: false },
    { id: 'coolant', label: 'Coolant', floor: 'workshop', x: 52, reusable: false }
  ],
  failures: [
    { id: 'blown-fuse', label: 'Blown Fuse', station: 'breaker', requiredItem: 'fuse', durationS: 3, eligiblePhases: ['first-signal', 'rising-storm', 'severe-weather', 'blackout-crisis'], consequence: 'trip-workshop' },
    { id: 'jammed-pump', label: 'Jammed Pump', station: 'pump', requiredItem: 'pump-handle', durationS: 4, eligiblePhases: ['first-signal', 'rising-storm', 'severe-weather', 'blackout-crisis', 'dawn'], consequence: 'jam-pump' },
    { id: 'broken-window', label: 'Broken Window', station: 'beacon', requiredItem: 'boards', durationS: 5, eligiblePhases: ['severe-weather', 'blackout-crisis', 'dawn'], consequence: 'window-ingress' },
    { id: 'beacon-misalignment', label: 'Beacon Misalignment', station: 'beacon', requiredItem: 'wrench', durationS: 4, eligiblePhases: ['severe-weather', 'blackout-crisis'], consequence: 'disable-beacon' },
    { id: 'generator-damage', label: 'Generator Damage', station: 'generator', requiredItem: 'wrench', durationS: 6, eligiblePhases: ['severe-weather', 'blackout-crisis'], consequence: 'damage-generator' },
    { id: 'overheating', label: 'Generator Overheating', station: 'generator', requiredItem: 'coolant', durationS: 3, eligiblePhases: ['rising-storm', 'severe-weather', 'blackout-crisis'], consequence: 'overheat' },
    { id: 'lightning-damage', label: 'Lightning Damage', station: 'beacon', requiredItem: 'wrench', durationS: 7, eligiblePhases: ['blackout-crisis'], consequence: 'lightning' },
    { id: 'radio-interference', label: 'Radio Interference', station: 'radio', requiredItem: 'wrench', durationS: 4, eligiblePhases: ['rising-storm', 'severe-weather', 'blackout-crisis'], consequence: 'disable-radio' }
  ],
  storm: { cooldownS: 15, maxActiveFailures: 3, finalBlackoutS: 600 },
  calls: [
    {
      id: 'mercy-bell', shipName: 'Mercy Bell', shipVisual: 'cutter', arrivalS: 45,
      bearingDeg: -28, identifyS: 4, windowStartS: 85, windowEndS: 145, holdS: 5,
      danger: 'reef shelf east of the lantern'
    },
    {
      id: 'north-star', shipName: 'North Star', shipVisual: 'trawler', arrivalS: 210,
      bearingDeg: 42, identifyS: 6, windowStartS: 260, windowEndS: 335, holdS: 7,
      danger: 'drifting across the black shoals'
    },
    {
      id: 'elise', shipName: 'Elise', shipVisual: 'steamer', arrivalS: 405,
      bearingDeg: -58, identifyS: 8, windowStartS: 455, windowEndS: 545, holdS: 9,
      danger: 'taking waves off the western rocks'
    },
    {
      id: 'grey-petrel', shipName: 'Grey Petrel', shipVisual: 'cutter', arrivalS: 585,
      bearingDeg: 64, identifyS: 10, windowStartS: 635, windowEndS: 720, holdS: 11,
      danger: 'blind inside the blackout squall'
    }
  ],
  phases: [
    { id: 'first-signal', startS: 0, endS: 150, eventBudget: 1, severity: 0.15 },
    { id: 'rising-storm', startS: 150, endS: 330, eventBudget: 3, severity: 0.35 },
    { id: 'severe-weather', startS: 330, endS: 540, eventBudget: 5, severity: 0.65 },
    { id: 'blackout-crisis', startS: 540, endS: 690, eventBudget: 7, severity: 1 },
    { id: 'dawn', startS: 690, endS: 780, eventBudget: 1, severity: 0.1 }
  ],
  rules: {
    durationS: NIGHT_DURATION_S,
    defaultCapacity: 3,
    maxDarkS: 45,
    rescueTarget: 3,
    machinery: {
      heatPerPoweredCircuitS: 0.02,
      coolingPerS: 0.04,
      overheatThreshold: 0.9,
      overheatDamagePerS: 0.04,
      pumpDrainPerS: 2,
      floodIngressPerS: 0.4,
      brokenWindowIngressPerS: 0.6,
      highWaterThreshold: 75,
      highWaterDamagePerS: 0.5,
      darknessWarningS: 30
    }
  },
  score: { rescue: 1000, integrity: 10, outagePenalty: 4, efficiency: 250 }
})
