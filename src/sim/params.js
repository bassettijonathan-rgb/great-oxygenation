// Lab-tab parameters, the scenarios built from them, and the fixed
// constants of the coupled model.

export const DEFAULTS = {
  cyanoAge: 2.9, // Ga, when oxygen-making cyanobacteria appear (0 = never)
  ferrotrophs: true, // iron-oxidising photosynthesisers in the Archean sea
  reductants: 1, // reducing volcanic and metamorphic gases, × default
  ventIron: 1, // dissolved iron from hydrothermal vents, × default
  weatheringP: 1, // phosphorus washed into the sea per unit of weathering, × default
  volcanicCO2: 1, // CO₂ from volcanoes, × default
  continents: 1, // emerged land area, × default
  ozoneShield: true, // ozone forms once there is oxygen and shields it
  hydrogenEscape: true, // hydrogen from methane escapes to space
  events: true, // seeded large volcanic outbursts (large igneous provinces)
};

export const RANGES = {
  cyanoAge: { min: 0, max: 3, step: 0.05 },
  reductants: { min: 0.3, max: 2, step: 0.05 },
  ventIron: { min: 0, max: 3, step: 0.05 },
  weatheringP: { min: 0.2, max: 3, step: 0.05 },
  volcanicCO2: { min: 0.3, max: 3, step: 0.05 },
  continents: { min: 0.3, max: 1.5, step: 0.05 },
};

export const SCENARIOS = {
  real: {
    label: 'Real Earth',
    blurb: 'Best guesses for the young Earth. Cyanobacteria appear at 2.9 Ga; watch when the air turns.',
    params: {},
  },
  noCyano: {
    label: 'No cyanobacteria',
    blurb: 'Nothing on Earth makes oxygen. Iron-eating microbes are the only photosynthesisers.',
    params: { cyanoAge: 0 },
  },
  noOzone: {
    label: 'No ozone shield',
    blurb: 'Oxygen never makes an ozone layer, so sunlight keeps destroying it as fast as it builds.',
    params: { ozoneShield: false },
  },
  noEscape: {
    label: 'No hydrogen escape',
    blurb: 'Hydrogen never leaks to space, so the planet does not slowly lose its reducing power.',
    params: { hydrogenEscape: false },
  },
  volcanoes: {
    label: 'Stronger volcanoes',
    blurb: 'Half again as much reducing gas from volcanoes and the hot crust.',
    params: { reductants: 1.5 },
  },
  earlyCyano: {
    label: 'Earlier cyanobacteria',
    blurb: 'Cyanobacteria from the very start at 3.0 Ga. Does the air turn sooner?',
    params: { cyanoAge: 3 },
  },
};

export const K = {
  startAge: 3.0, // Ga
  endAge: 1.8,
  stepMyr: 0.5, // Myr per step
  spinUp: 60, // steps run at the start age before the record begins
  cyanoSpread: 0.06, // Gyr over which cyanobacteria spread through the sunlit sea
  // carbon cycle (mol/yr at 3.0 Ga unless noted)
  volcCO2: 2e13, // CO₂ from volcanoes and metamorphism
  weathK: 1.0e13, // silicate weathering of today's land area at pCO₂ = pRef, T = T0
  weathT0: 12, // °C
  weathTe: 13.7, // K per e-fold of weathering rate (Walker et al. 1981)
  weathCO2: 0.3, // power of pCO₂
  pRef: 0.01, // bar
  seafloorK: 4e12, // seafloor weathering at pCO₂ = pRef
  seafloorCO2: 0.23,
  carbWeathK: 8e12, // carbonate weathering of today's land area (only for δ¹³C)
  carbonCap: 1.8e20, // mol C per bar of CO₂ held by the air …
  oceanCarbon: 9, // … and, unless ice seals it, this many times more by the sea
  // phosphorus
  riverP: 5e10, // mol P/yr at the reference weathering rate
  riverPRef: 1e13, // mol CO₂/yr of silicate weathering that delivers riverP
  oxidativeP: 1.0, // extra P from acid made by pyrite weathering once O₂ is high
  // reductants (mol O₂ equivalents per year at 3.0 Ga)
  reductant: 1.6e13,
  subaerialOxidised: 0.5, // gases from volcanoes on land carry this much less reducing power
  crustHalf: 1.5e22, // mol O₂-eq of crust oxidation that halves the metamorphic gases
  metaShare: 0.5, // share of the reductant flux that comes from metamorphism of the crust
  // iron
  ventFe: 1.0e13, // mol Fe²⁺/yr from vents at 3.0 Ga
  ventCH4: 1e11, // mol CH₄/yr from serpentinising vents
  riverFe: 5e11, // mol Fe²⁺/yr from weathering of today's land area in anoxic air
  // oxidative weathering of old crust: O₂ consumed per year at PAL by today's land
  oxWeath: 1.5e13,
  kerogenShare: 0.7, // of that O₂, the share that burns organic carbon (returns CO₂)
  pyriteShare: 0.25, // … and pyrite (returns sulfate)
  // sulfur
  volcS: 6e11, // mol S/yr from volcanoes at 3.0 Ga
  evapK: 1.5e12, // mol S/yr of gypsum laid down at 28 mM with today's land
  oceanVolume: 1.34e18, // m³
  // events
  lipRate: 1 / 50, // large igneous provinces per Myr
};
