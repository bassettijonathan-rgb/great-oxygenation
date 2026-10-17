// The slow changes the planet goes through on its own, as functions of age
// in billions of years before present (Ga). The player can scale most of
// them from the Lab tab; these are the defaults.

export const SUN_AGE = 4.57; // Gyr since the Sun reached the main sequence

// Gough (1981): the young Sun was fainter. Fraction of today's output.
export function sunLuminosity(age) {
  return 1 / (1 + 0.4 * (Math.max(0, age) / SUN_AGE));
}

// Heat coming out of the mantle relative to today. A hotter mantle melts
// more, so it vents more iron and more reducing gas.
export function heatFlow(age) {
  return 1 + 0.75 * Math.pow(Math.max(0, age) / 3, 1.5);
}

// Emerged continental area relative to today. Archean continents were
// smaller and largely flooded; most of today's area stood above the sea by
// about 2.3 Ga (Flament et al. 2008; Bindeman et al. 2018).
export function landArea(age) {
  return 0.2 + 0.8 / (1 + Math.exp((age - 2.55) / 0.12));
}

// Share of volcanism on land rather than under the sea. Gases from
// subaerial volcanoes are less reducing (Kump & Barley 2007).
export function subaerialShare(age) {
  return 0.25 + 0.6 / (1 + Math.exp((age - 2.5) / 0.15));
}

// Few new crust ages and little volcanism between about 2.45 and 2.2 Ga:
// a "magmatic lull" in which volcanoes and mid-ocean ridges were quieter
// (Condie, O'Neill & Aster 2009). 0 outside it, 1 inside.
export function magmaticLull(age) {
  const start = 1 / (1 + Math.exp((age - 2.44) / 0.01));
  const end = 1 / (1 + Math.exp((2.23 - age) / 0.01));
  return start * end;
}
