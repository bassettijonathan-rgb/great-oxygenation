# The Great Oxygenation

A browser simulation of the first time Earth's air filled with oxygen, about
2.4 billion years ago. Cyanobacteria start splitting water, the iron in the
sea rusts out as banded iron, the methane greenhouse collapses and the planet
freezes, all the way to the equator. A run goes from 3.0 to 1.8 billion years
ago in steps of half a million years.

**Play:** https://claude.ai/artifact/LcYQMynPpjRg72RDvMaWAe

It is plain JavaScript with Canvas and a Web Worker, no server, and runs as a
single page at phone width.

## What you see

- **The picture** is a slice through the ocean, from a coast with a shallow
  shelf on the left, down the slope to the deep basin and a mid-ocean ridge
  with hot springs on the right. Colours show what is dissolved in the water:
  oxygen or iron, life, phosphate or methane. Moving specks show the work
  being done: cyanobacteria making oxygen, rust sinking, gas bubbling out,
  iron rising from the vents. The sky turns orange under a methane haze, the
  land turns red once oxygen rusts it, and ice creeps over the sea as the
  planet cools. A small globe shows how far the ice reaches.
- **The numbers** under the picture (oxygen, methane, CO₂, temperature, ice,
  the deep sea) can all be tapped. Each one explains what it means, why it is
  where it is now, and what it was in the real record.
- **The narrator line** says what is happening as it happens.
- **Charts** follow oxygen, the greenhouse gases, temperature, sulfur and
  carbon isotopes and banded iron through time, with the dated lava floods,
  the ice ages and a strip of the rocks each step lays down. Shaded bands mark
  what the real rocks say. On a phone the charts have their own tab.

### Tabs

- **Learn**: nine short chapters, from a planet without oxygen to reading
  the rocks, ending in the Lab. Each asks you to predict what will happen
  first, then a **Show me** button runs the planet to the right moment and
  stops. Words in the text open a glossary of 37 terms.
- **Lab**: start from another scenario, change the planet (reducing gases,
  vent iron, phosphorus from weathering, volcanic CO₂, land area, when
  cyanobacteria appear), turn the iron-eating microbes, the lava floods or the
  magmatic lull off, or act now: a lava flood, a burst of oxygen, methane or
  CO₂, a freeze. Lava floods can follow the real record or be made up from a
  seed.
- **Validation**: the model measured against the rock record, with pass or
  fail for each check (below). It can be run again in the page, and a
  finished run of your own is scored the same way.

## How the default run goes

| Age (Ga) | What happens in the model |
|---|---|
| 2.87 | Cyanobacteria spread through the sunlit sea |
| 2.77 | Banded iron is laid down fastest |
| 2.55 | Methane falls below 10 ppm; the planet cools |
| 2.466 | Oxygen passes 1/100,000 of today's level (the Great Oxygenation); the sulfur MIF signal fades |
| 2.44 | Volcanoes go quiet (the magmatic lull); an ice age |
| 2.426 | The Ongeluk lava flood: its reducing gases use up the oxygen again |
| 2.365 | After the Bangalore lava flood, ice reaches the equator: a Snowball Earth |
| 2.359 | The snowball melts under volcanic CO₂; a pulse of oxygen, lost again by 2.347 |
| 2.229 | Volcanoes wake up; oxygen rises for good from 2.227 |
| 2.0 | Oxygen near 1 % of today; the deep sea still anoxic and iron-rich |

## The model

Five coupled parts, stepped every 0.5 million years from 3.0 to 1.8 Ga after
a spin-up.

**Slow forcings** (`src/sim/forcing.js`). The Sun brightens from 79 % to 86 %
of today's output (Gough 1981). A hotter mantle gives off more reducing gas
and vent iron. Continents rise out of the sea, most of them by about 2.3 Ga
(Flament et al. 2008; Bindeman et al. 2018), and more volcanism moves onto
land, where its gases are less reducing (Kump & Barley 2007). Volcanoes and ridges go
quiet from 2.45 to 2.2 Ga, the magmatic lull (Condie, O'Neill & Aster 2009).
Large igneous provinces are dated from the real record (Ernst & Youbi 2017;
Gumsley et al. 2017): each breathes out CO₂ and reducing gas for a million
years, then leaves fresh basalt that weathers fast.

**The air** (`src/sim/atmosphere.js`). One well-mixed box of oxygen and
methane. The two destroy each other in sunlight at a rate fitted by
Goldblatt, Lenton & Watson (2006) to a photochemical model (Claire et al.
2006), which includes the ozone shield: once there is a little oxygen, ozone
slows its destruction, so the air flips from anoxic to oxic. Hydrogen from
methane escapes to space at the diffusion limit, slowly oxidising the planet
(Catling, Zahnle & McKay 2001).

**Climate** (`src/sim/climate.js`). A diffusive energy balance model in 18
latitude bands (Budyko 1969; Sellers 1969; North 1975), with ice wherever the
yearly mean is below −10 °C and ice reflecting more sunlight, so a cold
planet can run away into a snowball. Greenhouse forcing from CO₂ and methane,
an organic haze once methane passes about a tenth of the CO₂ (Haqq-Misra et
al. 2008), and dust that slowly darkens the ice of a long snowball.

**The ocean** (`src/sim/ocean.js`). A 56 × 20 slice with a fixed overturning
circulation (coastal upwelling over the shelf, a slow deep cell) and eddy
mixing. It carries phosphate, methane, sulfide and the "oxidising power"
O₂ − Fe²⁺/4, so each cell holds either oxygen or dissolved iron. Two kinds of
plankton grow in the light: cyanobacteria, which make oxygen, and
photoferrotrophs, which oxidise iron directly. Sinking organic matter rots
with depth (Martin et al. 1987), more slowly without oxygen; rust scavenges
phosphate (Bjerrum & Canfield 2002); methanogens and sulfate reducers work
where oxygen is gone. Each step the slice is solved to its near-steady state
with one long implicit step and Newton's method for the oxygen and iron.

**Carbon and sulfur.** Volcanic CO₂ is balanced by silicate weathering that
speeds up when it is warm (Walker, Hays & Kasting 1981) and by seafloor
weathering, so the climate has a thermostat. Burial of organic matter is the
net source of oxygen. Once oxygen appears, a billion years' backlog of
sulfide rock weathers away, its acid releasing phosphate and its sulfur
feeding the sea (Bekker & Holland 2012). Carbonate δ¹³C follows from the
share of carbon buried as organic matter. The mass-independent sulfur signal
(Δ³³S) survives only while sunlight splits SO₂ in air with almost no oxygen
(Pavlov & Kasting 2002), with a faint memory from old sulfides eroded later.

**The rock record.** Each step lays down the rock a geologist would find:
carbonate, black shale, oxide or carbonate iron formation, pyritic shale,
gypsum, glacial diamictite or a cap carbonate after a thaw.

Each step solves the fast parts together: for a guess of the oxygen and
methane at the end of the step, the climate settles, rivers deliver
phosphorus and iron, the sea responds and the air runs through the step with
those fluxes. The guess is corrected by Newton's method until the two agree,
so tipping points (the ozone switch, a runaway freeze) are crossed without
skipping or oscillating.

## Simplifications

- One slice of ocean margin stands for all the world's ocean; its fluxes are
  scaled up by the length of margin it represents.
- The climate is a yearly average with no seasons and no geography; the ice
  edge is set by temperature alone.
- The circulation is fixed. It does not change with temperature, ice or
  salinity.
- The air is a single box, and its photochemistry is a published fit, not a
  photochemical model.
- Life is two kinds of photosynthesiser plus microbes that use whatever is
  left. Nothing evolves except that cyanobacteria appear at a set age.
- Many constants are tuned so the default run lands near the evidence. The
  model shows how the parts push on each other, not exactly what happened.
- Isotopes are bookkeeping on the fluxes, with a little noise for the rocks.

## Validation

`npm run build` runs the real-Earth history and writes the results to
`dist/validation.json`; the page shows them in the Validation tab. The long
test fails if any check outside the known misses stops passing.

| Check | Model | Real | Result | Source |
|---|---|---|---|---|
| Oxygen first rises above 1/100,000 of today's level | 2.47 Ga | about 2.43 Ga (accept 2.50 to 2.30) | pass | Gumsley et al. 2017; Warke et al. 2020 |
| Sulfur isotopes lose their mass-independent signal for good | 2.23 Ga | about 2.22 to 2.33 Ga (accept 2.35 to 2.20) | pass | Luo et al. 2016; Poulton et al. 2021 |
| Methane in the air at 2.7 Ga | 99 ppm | tens to hundreds of ppm (accept 20 to 3,000) | pass | Pavlov et al. 2000; Haqq-Misra et al. 2008 |
| Mean surface temperature at 2.7 Ga, under a fainter Sun | 8.7 °C | liquid oceans, no ice near the equator (accept 0 to 40 °C) | pass | Feulner 2012 |
| Oxide banded iron is laid down fastest before oxygen rises | peak at 2.77 Ga | big pulses near 2.7 and 2.5 Ga, before oxygen rose | pass | Bekker et al. 2010 |
| Ice reaches below 35° latitude between 2.45 and 2.22 Ga | Snowball at 2.36 Ga | Makganyene and Huronian glaciations, 2.43 to 2.29 Ga | pass | Evans et al. 1997; Gumsley et al. 2017 |
| No ice age from 2.15 to 1.8 Ga | ice line at least 42° | no glacial deposits for over a billion years after 2.2 Ga | pass | Hoffman 2013 |
| Oxygen in the air at 2.0 Ga | 0.95 % of today | about 0.1 to 10 % of today | pass | Kump 2008; Planavsky et al. 2014 |
| The deep sea still has no oxygen at 2.0 Ga | 0 µM O₂, 23 µM iron below 500 m | deep water stayed iron-rich or sulfidic | pass | Poulton & Canfield 2011 |
| Carbonate δ¹³C climbs 5 ‰ between 2.25 and 2.0 Ga | +2.8 ‰ at 2.25 Ga | +8 to +12 ‰ (the Lomagundi event) | miss | Karhu & Holland 1996; Bekker 2022 |
| Banded iron fades after oxygen rises | 79 % of the earlier rate | almost none from 2.4 until 1.9 Ga | miss | Bekker et al. 2010 |

### Known misses

- **No Lomagundi event.** The burst of phosphate from weathering the sulfide
  backlog comes right after the first rise of oxygen and is small, so organic
  burial, and with it δ¹³C, barely rises. What drove the real shift is still
  debated.
- **Banded iron does not stop.** Vents keep feeding iron into the deep sea,
  and rust keeps forming where it upwells into oxygenated water. In the real
  ocean, sulfate from oxidative weathering turned much of the deep iron into
  pyrite; this model makes too little sulfate for that (about 1 µM after the
  rise, against millimolar levels in the record).
- **A cool Proterozoic.** After 2.2 Ga the planet averages about 0 °C with
  ice from about 45° latitude: no ice age, but colder than the record
  suggests.

## Scenarios

| Lab scenario | What happens |
|---|---|
| Real Earth | As above |
| No cyanobacteria | Oxygen never rises; methane stays in the hundreds of ppm and there is no ice age |
| Earlier cyanobacteria (3.0 Ga) | Oxygen still rises only at 2.46 Ga: the sinks, not the source, set the timing |
| Gassier volcanoes | Oxygen rises late, at 2.36 Ga, between two snowballs |
| Volcanoes never go quiet | Oxygen rises at 2.50 Ga and there is no deep glaciation |
| No great eruptions | Oxygen rises at 2.50 Ga; an ice age but no snowball |

## Same seed, same run

The engine draws every random number from a seeded generator, so the same
seed, scenario and settings give the same history step for step, whether it
runs in the page's worker, on the page's main thread or in Node. The default
seed, `earth`, uses the dated lava floods of the real record; any other seed
draws its own. Chrome and Node share a JavaScript engine and agree exactly;
other browsers may round the last digit of a few math functions differently,
which can nudge a long run slightly.

## Development

Node 20 or later.

```sh
npm ci
npm test              # unit tests (engine, page logic)
npm run test:long     # the full history: validation checks and scenarios
npm run build         # dist/index.html, the page that is published
npm run test:browser  # the built page in Chromium at desktop and phone width
```

`npm run build` bundles `src/app` and the simulation with esbuild into one
self-contained page fragment, `dist/index.html`, with the worker inlined and
the validation results embedded. CI checks that the committed `dist/` matches
a fresh build.

```
src/sim/     the simulation: forcing, air, climate, ocean, engine, parameters
src/app/     the page: worker, picture, charts, lessons, Lab, Validation
test/unit/   fast tests
test/long/   full runs
test/browser/ the built page in a real browser
tools/       the build
```
