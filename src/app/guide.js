// Everything the page says to the reader: the Learn chapters, the glossary,
// what each number means, the narrator line and the picture's legend.
//
// In chapter text, [word] links to the glossary entry `word` and
// [shown text|key] to entry `key`.

import * as fmt from './format.js';
import { forcingCH4, forcingCO2 } from '../sim/climate.js';
import { sunLuminosity } from '../sim/forcing.js';

export const CHAPTERS = [
  {
    id: 'start',
    title: 'A planet without oxygen',
    body: [
      'Three billion years ago the Earth had oceans, continents and plenty of microbes, but almost no oxygen: less than a ten-trillionth of [today’s level|pal]. The air was mostly nitrogen and carbon dioxide, with some [methane].',
      'The sea was strange too. [Hot springs|vents] on the sea floor poured out [dissolved iron|ferrous]. With no oxygen to rust it, the iron stayed dissolved: the deep sea held tens of micromoles of it per litre, tens of thousands of times more than today.',
      'And the Sun shone a fifth weaker than it does now: the [faint young Sun|faintsun].',
    ],
    predict: {
      q: 'With the Sun this faint, what kept the oceans from freezing?',
      options: [
        { text: 'A stronger greenhouse: more CO₂ and methane in the air', right: true },
        { text: 'The Earth was closer to the Sun' },
        { text: 'Heat from the Earth’s hot interior' },
      ],
      explain:
        'The Earth’s orbit was about the same, and the heat leaking out of its interior is less than a thousandth of the sunlight the surface absorbs, even with a hotter mantle. The [greenhouse] made the difference. In the model the air starts with about 15 % CO₂ and 800 ppm of methane.',
    },
    show: { steps: [{ age: 2.95, speed: 2 }], layer: 'redox', highlight: 'ch4' },
    look: 'The green-brown water is dissolved iron, from the surface to the sea floor. Tap any number under the picture to see what it means.',
  },
  {
    id: 'cyano',
    title: 'The oxygen makers',
    body: [
      '[Cyanobacteria|cyano] learned to split water with sunlight and give off oxygen as waste. When this happened is debated; in the model they spread through the sunlit sea about 2.9 billion years ago. Every breath you take traces back to them: the chloroplasts in plant cells are their descendants.',
      'They grow best near the coast, where [upwelling] brings [phosphate] up from the deep.',
    ],
    predict: {
      q: 'Cyanobacteria start pouring out oxygen. What happens to the oxygen in the air?',
      options: [
        { text: 'It rises quickly towards today’s level' },
        { text: 'It barely changes: something uses it up as fast as it is made', right: true },
        { text: 'It rises, then falls straight back' },
      ],
      explain:
        'Oxygen in the air rises ten-thousandfold, from about 10⁻¹³ to 10⁻⁹ of today’s level, which is still almost nothing. Dissolved iron, gases from volcanoes and methane destroy oxygen within days to years. Only small [oxygen oases|oases] form in the surface water.',
    },
    show: { steps: [{ age: 2.84, speed: 3 }], layer: 'life', highlight: 'o2' },
    look: 'The bright teal in the top layer is cyanobacteria at work, thickest over the shelf. Switch the picture to “Oxygen & iron” to see the thin oxygen oases above the iron-rich water.',
  },
  {
    id: 'bif',
    title: 'Rust rain: banded iron',
    body: [
      'Where oxygen meets dissolved iron, the two react at once. The iron turns to [rust], which cannot dissolve, so it falls to the sea floor as tiny grains. Layer upon layer, this builds [banded iron formations|bif], rocks striped red and grey that hold most of the iron ore mined today.',
      '[Iron-eating microbes|ferrotrophs] can make rust with sunlight too, without any oxygen, and may have laid down banded iron before cyanobacteria existed.',
    ],
    predict: {
      q: 'Where in the sea does most of the rust form?',
      options: [
        { text: 'Deep down, next to the hot springs that release the iron' },
        { text: 'In the sunlit water, where rising iron meets oxygen', right: true },
        { text: 'On land, and rivers wash it in' },
      ],
      explain:
        'The vents supply the iron, but rust needs oxygen (or light, for iron-eating microbes), and both are found only near the surface. Upwelling carries the iron up to meet them.',
    },
    show: { steps: [{ age: 2.7, speed: 3 }], layer: 'life', highlight: 'sea' },
    look: 'Red specks are rust grains sinking from the surface. The red line on the sea floor and the red stretch of the rock strip under the charts are banded iron in the making.',
  },
  {
    id: 'sinks',
    title: 'Why oxygen had to wait',
    body: [
      'For hundreds of millions of years cyanobacteria made oxygen, yet the air stayed almost empty of it. It comes down to a balance.',
      'The lasting source: when dead plankton are buried in mud before they rot, the oxygen they made while growing is left over ([burial of organic matter|burial]).',
      'The sinks: volcanoes and hot rock breathe out hydrogen and other [reducing gases|reductants], vents release iron, and methane burns oxygen in the air. While the sinks are bigger than the source, oxygen cannot build up.',
      'Slowly the sinks weaken. The mantle cools, so volcanoes give off less gas. Hydrogen [escapes to space|hescape], leaving oxygen behind. And with less volcanic hydrogen for [methanogens] to feed on, methane falls and the planet cools.',
    ],
    predict: {
      q: 'What finally tipped the balance?',
      options: [
        { text: 'A sudden burst of new life' },
        { text: 'The sinks slowly weakened until the source won', right: true },
        { text: 'A comet brought oxygen' },
      ],
      explain:
        'Nothing dramatic is needed. In the model the oxygen source barely changes; the sinks shrink as the Earth’s interior cools, until one day they are smaller than the source.',
    },
    show: { steps: [{ age: 2.55, speed: 3 }], layer: 'redox', highlight: 'ch4', focus: 'charts' },
    look: 'In the greenhouse chart, methane slides from hundreds of ppm to a few. The temperature follows it down. Oxygen creeps up but is still tiny.',
  },
  {
    id: 'goe',
    title: 'The Great Oxygenation',
    body: [
      'When the source finally outruns the sinks, the air changes in a geological instant. In the model, oxygen leaps several thousandfold within half a million years, to more than a tenth of a percent of today’s level. The rocks put this moment at about 2.43 billion years ago; the model gets there a little early, at 2.47.',
      'Why a jump and not a slope? Oxygen high in the air makes an [ozone layer|ozone]. Ozone blocks the ultraviolet light that drives the reactions in which oxygen and methane destroy each other, so the more oxygen there is, the longer it lasts. Past a tipping point this feeds on itself.',
      'The rocks record the moment: sulfur loses its [mass-independent signal|mif], and [red beds|redbeds] start to form on land.',
    ],
    predict: {
      q: 'Once the balance tips, how fast does oxygen rise?',
      options: [
        { text: 'Slowly, over hundreds of millions of years' },
        { text: 'In a geological instant', right: true },
        { text: 'Not at all: the sinks catch up straight away' },
      ],
      explain:
        'The ozone feedback turns a slow drift into a jump: a little ozone lets oxygen last longer, which makes more ozone. In the model oxygen goes from about 3×10⁻⁷ to 1.5×10⁻³ of today’s level in a single half-million-year step.',
    },
    show: {
      steps: [
        { age: 2.48, speed: 3 },
        { age: 2.455, speed: 1 },
      ],
      layer: 'redox',
      highlight: 'o2',
      focus: 'charts',
    },
    look: 'The oxygen line shoots up by four powers of ten. The sulfur dots, scattered until now, close in towards zero: the mass-independent signal is gone.',
  },
  {
    id: 'snowball',
    title: 'Snowball Earth',
    body: [
      'Methane was a large part of the greenhouse, and by now most of it is gone. Then volcanoes go quiet (the [magmatic lull|lull]), so less CO₂ comes out, and the planet cools further. Ice spreads from the poles, and white ice reflects sunlight, which cools the planet more: the [ice–albedo feedback|albedo]. Past a point this runs away, and ice reaches the equator: a [Snowball Earth|snowball].',
      'In the model the last push comes from the Bangalore lava flood, 2.37 billion years ago: its fresh basalt weathers quickly and pulls CO₂ out of the air.',
      'Rocks from 2.43 to 2.22 billion years ago hold glacial deposits ([diamictites|diamictite]) in Canada ([the Huronian|huronian]) and South Africa, where some formed near the equator.',
    ],
    predict: {
      q: 'Once the whole planet is frozen, what melts it?',
      options: [
        { text: 'The Sun warms up' },
        { text: 'CO₂ from volcanoes builds up until the greenhouse wins', right: true },
        { text: 'Nothing: it stays frozen for good' },
      ],
      explain:
        'The Sun brightens far too slowly, under 1 % every 100 million years. Volcanoes keep breathing out CO₂, but frozen rock cannot [weather|weathering] it away, so it builds up over a few million years until the ice melts. Dust settling on the ice helps by darkening it. Right after, the hot, CO₂-rich world weathers rock furiously and lays down [cap carbonates|capcarb].',
    },
    show: {
      steps: [
        { age: 2.37, speed: 3 },
        { age: 2.354, speed: 1 },
      ],
      layer: 'redox',
      highlight: 'ice',
    },
    look: 'Ice closes over the sea, the globe turns white, and CO₂ climbs to over 10 % of the air before the ice breaks.',
  },
  {
    id: 'yoyo',
    title: 'Oxygen comes and goes',
    body: [
      'The first rise of oxygen does not last. In the model, ice and the quiet volcanoes of the [magmatic lull|lull] cool the planet; colder, icier land weathers less, so rivers carry less phosphate to the sea and fewer cyanobacteria grow. When the Ongeluk lava flood ([a large igneous province|lip]) adds a burst of reducing gas, oxygen collapses and methane returns.',
      'After the snowball melts, the hot world floods the sea with phosphate and oxygen surges to a few percent of today’s level, then fades again as the planet cools.',
      'Oxygen comes to stay only when the volcanoes wake again, about 2.23 billion years ago: more CO₂, a warmer planet, more phosphate. Sulfur isotopes in real rocks tell a similar story of comings and goings until about 2.22 billion years ago (Poulton and others, 2021).',
    ],
    predict: {
      q: 'Oxygen has risen once. Can it fall back?',
      options: [
        { text: 'No: once oxygen fills the air it stays' },
        { text: 'Yes: if the source weakens, the sinks win again', right: true },
      ],
      explain:
        'Oxygen in the air lasts only a few million years unless it is replaced. If burial of organic matter slows (less phosphate, less growth), the sinks pull oxygen back down.',
    },
    show: { steps: [{ age: 2.2, speed: 3 }], layer: 'redox', highlight: 'o2', focus: 'charts' },
    look: 'The oxygen line flickers: a rise at 2.47, a fall at 2.43, a spike after the snowball, then the last rise at 2.23.',
  },
  {
    id: 'rocks',
    title: 'Reading the rocks',
    body: [
      'Nobody measured the air 2.4 billion years ago. Everything we know comes from clues in rocks:',
      '• [Banded iron formations|bif]: iron dissolved in the sea, rusted by oxygen or by microbes.',
      '• [Mass-independent sulfur isotopes|mif]: present only while the air had almost no oxygen. They vanish between 2.33 and 2.22 billion years ago.',
      '• [Pyrite and uraninite pebbles|detrital] in old riverbeds: minerals that oxygen destroys, gone after 2.4 billion years ago. [Red beds|redbeds] take their place.',
      '• [Diamictites|diamictite] and [cap carbonates|capcarb]: ice ages and their hot aftermath.',
      '• Carbon isotopes ([δ¹³C|d13c]): a long rise, the [Lomagundi event|lomagundi], suggests a lot of organic carbon was buried, and with it a lot of oxygen released.',
    ],
    predict: {
      q: 'Which clue shows the air had almost no oxygen when the rock formed?',
      options: [
        { text: 'A mass-independent sulfur signal', right: true },
        { text: 'Red sandstone' },
        { text: 'Gypsum' },
      ],
      explain:
        'Red sandstone and gypsum both need oxygen to form. The mass-independent sulfur signal survives only in air with less than about 1/100,000 of today’s oxygen.',
    },
    show: { steps: [{ age: 1.8, speed: 3 }], focus: 'charts' },
    look: 'The rock strip under the charts is the core a geologist would drill through this history. The Validation tab compares the model with the real rocks, misses included.',
  },
  {
    id: 'lab',
    title: 'Your turn',
    body: [
      'The Lab tab lets you change the planet and run history again. A few questions to try:',
      '• Without cyanobacteria, does oxygen ever rise?',
      '• If volcanoes never go quiet, is there still a snowball?',
      '• Freeze the planet yourself at 2.8 billion years ago. How long until it melts?',
      'The same settings and the same seed always give the same history, so you can share a run by its seed.',
    ],
    show: { tab: 'lab' },
    showLabel: 'Open the Lab',
  },
];

export const GLOSSARY = {
  ga: ['Ga', 'Giga-annum: a billion years ago. 2.4 Ga means 2.4 billion years before today.'],
  pal: ['Today’s level (PAL)', 'Oxygen given as a share of today’s amount (present atmospheric level). Today’s air is 21 % oxygen; 0.01 of today’s level is a hundredth of that.'],
  goe: ['Great Oxygenation Event', 'The first lasting rise of oxygen in the air, between about 2.43 and 2.22 billion years ago.'],
  archean: ['Archean', 'The eon from 4.0 to 2.5 billion years ago, before the air had oxygen.'],
  cyano: ['Cyanobacteria', 'Bacteria that photosynthesise by splitting water, giving off oxygen. Their descendants live on as the chloroplasts in every plant cell.'],
  ferrotrophs: ['Iron-eating microbes (photoferrotrophs)', 'Microbes that use sunlight to turn dissolved iron into rust instead of splitting water. They make no oxygen.'],
  methanogens: ['Methanogens', 'Microbes that make methane, from hydrogen and CO₂ or from rotting organic matter. They live only where there is no oxygen.'],
  methane: ['Methane (CH₄)', 'A greenhouse gas many times stronger than CO₂ per molecule. Today’s air holds 1.9 ppm; the Archean air may have held hundreds.'],
  greenhouse: ['Greenhouse effect', 'Gases such as CO₂ and methane let sunlight in but hold back the heat the surface gives off, warming it.'],
  faintsun: ['Faint young Sun', 'Stars like the Sun brighten as they age. Three billion years ago the Sun gave about 80 % of today’s light.'],
  ferrous: ['Dissolved iron (Fe²⁺)', 'Ferrous iron stays dissolved in water that has no oxygen. Hot springs and rivers supplied it. Water rich in it is called ferruginous.'],
  rust: ['Rust (Fe³⁺)', 'Ferric iron: iron that has met oxygen. It does not dissolve, so it falls out of the water as tiny grains.'],
  bif: ['Banded iron formation', 'Rock in thin stripes of iron oxide and silica, laid down on the sea floor from 3.8 billion years ago, most of all between 2.8 and 2.4, with a late burst around 1.88. Most iron ore comes from them.'],
  vents: ['Hydrothermal vents', 'Hot springs on the sea floor, mostly on mid-ocean ridges, where seawater runs through hot rock and picks up iron and gases.'],
  upwelling: ['Upwelling', 'Deep water rising to the surface near coasts, pushed by the wind. It brings up nutrients and, in the Archean, iron.'],
  oases: ['Oxygen oases', 'Patches of sunlit water where cyanobacteria made oxygen faster than it was destroyed, while the air and the deep sea had none.'],
  phosphate: ['Phosphate', 'The nutrient that limits how much the sea can grow over long times. Rivers bring it from weathering rock; rust grains and sediments remove it.'],
  burial: ['Burial of organic matter', 'Dead plankton buried in mud before they rot. The oxygen they made while growing stays in the air and sea: the lasting source of oxygen.'],
  reductants: ['Reducing gases', 'Gases that react with oxygen: hydrogen, carbon monoxide, hydrogen sulfide, methane. Volcanoes and hot rock give them off.'],
  hescape: ['Hydrogen escape', 'High in the air, sunlight breaks methane apart and light hydrogen atoms escape to space. Each one lost leaves oxygen behind, slowly oxidising the planet.'],
  ozone: ['Ozone layer', 'O₃ made from oxygen by ultraviolet light high in the air. It absorbs ultraviolet light, shielding the air and the surface below.'],
  mif: ['Mass-independent sulfur signal (Δ³³S)', 'Ultraviolet light splitting volcanic SO₂ sorts sulfur isotopes in an unusual way. In air without oxygen the sulfur falls out in different forms that keep the signal apart, and rocks store it. Above about 1/100,000 of today’s oxygen all sulfur falls out as sulfate and the signal blends away.'],
  d13c: ['Carbon isotopes (δ¹³C)', 'The share of heavy carbon-13 in carbonate rock. Life prefers light carbon, so when much organic matter is buried, the carbon left in the sea, and the carbonate made from it, gets heavier.'],
  lomagundi: ['Lomagundi event', 'The largest and longest rise in carbon isotopes in Earth’s history, about 2.22 to 2.06 billion years ago: a sign of huge organic carbon burial.'],
  huronian: ['Huronian glaciations', 'Three ice ages recorded in rocks around Lake Huron, Canada, between about 2.45 and 2.22 billion years ago.'],
  snowball: ['Snowball Earth', 'A planet frozen over to the equator. The ice reflects so much sunlight that only a large build-up of greenhouse gas can melt it.'],
  albedo: ['Ice–albedo feedback', 'Ice reflects sunlight, and reflected light does not warm the planet. More ice means colder, and colder means more ice.'],
  weathering: ['Weathering', 'Rain, made slightly acid by CO₂, slowly dissolves rock; the carbon ends up as limestone on the sea floor. Warm, wet climates weather faster, so it works as a slow thermostat. It also frees phosphate.'],
  lip: ['Large igneous province', 'A vast outpouring of lava within about a million years. It breathes out CO₂ and reducing gases; then its fresh basalt weathers fast, drawing CO₂ down.'],
  lull: ['Magmatic lull', 'A spell from about 2.45 to 2.2 billion years ago with remarkably few igneous rocks, as if volcanoes had gone quiet (Condie and others, 2009).'],
  diamictite: ['Diamictite', 'Rock made of pebbles and boulders scattered in fine mud: what glaciers leave behind.'],
  capcarb: ['Cap carbonate', 'Limestone laid directly on glacial deposits, from the burst of weathering in the hot, CO₂-rich world after an ice age.'],
  redbeds: ['Red beds', 'Sandstone coloured red by rust coating its grains. It needs oxygen in the air and appears after about 2.3 billion years ago.'],
  detrital: ['Pyrite and uraninite pebbles', 'Grains of pyrite (FeS₂) and uraninite (UO₂) rounded by rivers. Oxygen destroys both, so their survival in old riverbeds means the air had almost none.'],
  sulfate: ['Sulfate', 'Sulfur combined with oxygen (SO₄²⁻), dissolved in seawater. Today’s sea holds 28,000 µM; with no oxygen there was very little.'],
  micromolar: ['µM (micromolar)', 'Millionths of a mole per litre: a way of counting molecules dissolved in water.'],
  haze: ['Organic haze', 'When there is more than about a tenth as much methane as CO₂, sunlight turns methane into an orange smog that shades and cools the planet, as on Saturn’s moon Titan.'],
};

// Turns [term] and [text|term] into glossary buttons.
export function markup(text) {
  return fmt.esc(text).replace(/\[([^\]|]+)(?:\|([^\]]+))?\]/g, (m, label, key) => {
    const k = key ?? label.toLowerCase();
    return `<button type="button" class="term" data-term="${k}">${label}</button>`;
  });
}

export function termKeys(text) {
  const keys = [];
  text.replace(/\[([^\]|]+)(?:\|([^\]]+))?\]/g, (m, label, key) => keys.push(key ?? label.toLowerCase()));
  return keys;
}

// ---- The readouts under the picture and what each one means. Values are
// HTML (powers of ten use <sup>).

export const READOUTS = [
  { key: 'o2', label: 'Oxygen', unit: 'of today’s level', value: (h) => fmt.pal(h.pal, true) },
  { key: 'ch4', label: 'Methane', unit: 'today 1.9 ppm', value: (h) => fmt.ppm(h.ch4, true) },
  { key: 'co2', label: 'CO₂', unit: 'today 420 ppm', value: (h) => fmt.ppm(h.co2 * 1e6, true) },
  { key: 'temp', label: 'Average temperature', short: 'Temperature', unit: 'today 15 °C', value: (h) => fmt.temp(h.T) },
  {
    key: 'ice',
    label: 'Ice',
    unit: (h) => (h.iceLat < 2 ? 'a snowball' : h.iceLat >= 89.5 ? 'ice-free' : 'to the poles'),
    value: (h) => (h.iceLat < 2 ? 'everywhere' : h.iceLat >= 89.5 ? 'none' : `from ${Math.round(h.iceLat)}°`),
  },
  { key: 'sea', label: 'Deep sea', unit: 'below 500 m', value: (h) => (h.deepO2 > 1 ? `${fmt.num(h.deepO2)} µM O₂` : `${fmt.num(h.deepFe)} µM iron`) },
];

const term = (key, text) => `<button type="button" class="term" data-term="${key}">${text}</button>`;

export function explain(key, h) {
  const lum = sunLuminosity(h.age);
  switch (key) {
    case 'o2': {
      const low = h.pal < 1e-5;
      const o2 = fmt.pal(h.pal, true);
      return {
        title: 'Oxygen in the air',
        value: `${o2} of today’s level`,
        html: [
          `Today’s air is 21 % oxygen. Here there is ${o2} of that${h.pal >= 1e-4 ? `, about ${fmt.num(h.pal * 21e4)} ppm` : ''}.`,
          low
            ? `That is below 1/100,000 of today’s level. Sulfur keeps its ${term('mif', 'mass-independent signal')}, and minerals such as pyrite survive in riverbeds. Iron, gases from volcanoes and methane destroy oxygen about as fast as it arrives.`
            : `That is above 1/100,000 of today’s level: enough to start an ${term('ozone', 'ozone layer')} and to wipe out the ${term('mif', 'mass-independent sulfur signal')}. Rocks on land now rust as they weather.`,
          `In the model oxygen builds up when ${term('burial', 'burial of organic matter')} outpaces the ${term('reductants', 'reducing gases')} from volcanoes, the iron from vents and the weathering of old rock.`,
        ],
        chart: 'o2',
      };
    }
    case 'ch4': {
      const f = forcingCH4(h.ch4);
      const v = fmt.ppm(h.ch4, true);
      return {
        title: 'Methane in the air',
        value: v,
        html: [
          `Today’s air holds 1.9 ppm (parts per million) of methane; here there is ${v}.`,
          f > 0.5
            ? `At this level it adds about ${fmt.num(f)} W/m² of warming compared with the air of 1850. For scale, doubling today’s CO₂ adds about 3.7 W/m².`
            : 'At this level it adds almost nothing to the greenhouse.',
          `${term('methanogens', 'Methanogens')} make it from volcanic hydrogen and from rotting organic matter. Methane and oxygen destroy each other in sunlight, so when one rises the other falls.`,
          h.haze > 0.05 ? `There is so much methane that an orange ${term('haze', 'organic haze')} shades the planet.` : '',
        ],
        chart: 'gh',
      };
    }
    case 'co2': {
      const f = forcingCO2(h.co2);
      const frozen = h.iceLat < 2;
      const v = fmt.ppm(h.co2 * 1e6, true);
      return {
        title: 'Carbon dioxide in the air',
        value: v,
        html: [
          `Today’s air holds about 420 ppm of CO₂. Here there is ${v}, which is ${fmt.num(h.co2 * 100)} % of the air, warming the surface by about ${fmt.num(f)} W/m² more than the air of 1850.`,
          `Volcanoes breathe CO₂ out; ${term('weathering', 'weathering')} of rock and burial of organic carbon take it back. Weathering runs faster when it is warm, so over millions of years CO₂ works like a thermostat.`,
          frozen ? 'Right now the land is frozen and cannot weather, so volcanic CO₂ is building up in the air.' : '',
        ],
        chart: 'gh',
      };
    }
    case 'temp':
      return {
        title: 'Average temperature',
        value: fmt.temp(h.T),
        html: [
          `The average over the whole surface, poles included. Today it is about 15 °C; here it is ${fmt.temp(h.T)}.`,
          `The Sun gives ${Math.round(lum * 100)} % of today’s light (the ${term('faintsun', 'faint young Sun')}), so the planet needs a stronger ${term('greenhouse', 'greenhouse')} than today’s to stay this warm.`,
          'In the model temperature comes from an energy balance: sunlight in, heat out, heat carried from the equator to the poles, and ice wherever the yearly average falls below −10 °C.',
        ],
        chart: 'temp',
      };
    case 'ice': {
      const lat = h.iceLat;
      return {
        title: 'Ice',
        value: lat < 2 ? 'Ice to the equator' : lat >= 89.5 ? 'No ice' : `Ice from ${Math.round(lat)}° to the poles`,
        html: [
          'How close to the equator the ice reaches. In today’s climate the ice edge sits at about 66° latitude on average.',
          lat < 2
            ? `A ${term('snowball', 'Snowball Earth')}: ice covers the whole planet.`
            : lat < 35
              ? `The ice has reached the danger zone. Below about 30° the ${term('albedo', 'ice–albedo feedback')} can run away and freeze the whole planet.`
              : lat < 45
                ? `An ice age: ice reaches the middle latitudes, where glaciers leave ${term('diamictite', 'diamictites')} behind.`
                : 'Ice stays near the poles.',
        ],
        chart: 'temp',
      };
    }
    case 'sea':
      return {
        title: 'The deep sea',
        value: `${fmt.num(h.deepFe)} µM iron, ${fmt.num(h.deepO2, 2, true)} µM oxygen`,
        html: [
          `The average of the water below 500 m: ${fmt.num(h.deepFe)} µM of ${term('ferrous', 'dissolved iron')} and ${fmt.num(h.deepO2, 2, true)} µM of oxygen. Today’s deep sea has 150 to 250 µM of oxygen and almost no iron (under 0.001 µM).`,
          `${term('vents', 'Hot springs')} on the ridge pump iron in. It stays dissolved as long as no oxygen reaches it, and the deep sea did not get lasting oxygen until hundreds of millions of years after the air.`,
          `${term('micromolar', 'µM')} means millionths of a mole per litre.`,
        ],
        chart: 'bif',
      };
    default:
      return null;
  }
}

// ---- The narrator: one or two sentences about what is happening now.

export function narrate(h) {
  const n = (key, text) => `<button type="button" class="num" data-explain="${key}">${text}</button>`;
  const o2 = n('o2', fmt.pal(h.pal, true));
  const ch4 = n('ch4', fmt.ppm(h.ch4, true));
  const lat = n('ice', `${Math.round(h.iceLat)}°`);
  if (h.iceLat < 2) return `The whole planet is frozen. Frozen rock cannot take up CO₂, so volcanic CO₂ is building up in the air: ${n('co2', fmt.ppm(h.co2 * 1e6, true))} now.`;
  if (h.pal > 1e-5) {
    if (h.iceLat < 40) return `Oxygen is in the air (${o2} of today’s level), but without its methane greenhouse the planet is cold: ice reaches ${lat}.`;
    return `Oxygen is in the air: ${o2} of today’s level. Methane is down to ${ch4}.`;
  }
  if (h.cyano > 0.5) {
    if (h.iceLat < 40) return `Ice reaches ${lat}. Cyanobacteria still make oxygen, but iron, volcanic gases and methane destroy it: the air holds ${o2} of today’s level.`;
    return `Cyanobacteria make oxygen in the sunlit water, but iron, volcanic gases and methane destroy it as fast: the air holds only ${o2} of today’s level.`;
  }
  const sun = `${Math.round(sunLuminosity(h.age) * 100)} %`;
  return `No life makes oxygen yet. Iron fills the sea, and methane (${ch4}) and CO₂ keep the planet warm under a Sun giving ${n('temp', sun)} of today’s light.`;
}

// ---- The picture: what each colour layer shows.

export const LAYERS = [
  {
    key: 'redox',
    label: 'Oxygen & iron',
    legend: [
      ['oxy', 'oxygen'],
      ['iron', 'dissolved iron'],
      ['sulfide', 'sulfide'],
    ],
  },
  {
    key: 'life',
    label: 'Life',
    legend: [
      ['cyano', 'cyanobacteria'],
      ['ferro', 'iron-eating microbes'],
      ['rust', 'rust forming'],
    ],
  },
  { key: 'phosphate', label: 'Phosphate', legend: [['phos', 'phosphate, 0 to 1 µM']] },
  { key: 'methane', label: 'Methane', legend: [['meth', 'dissolved methane']] },
];

export const PICTURE_HELP = [
  'The picture is a slice through the ocean, from the coast on the left, over the shallow shelf and down to the deep sea, with a mid-ocean ridge and its hot springs on the right. Depth is stretched so the sunlit top is easier to see: the sea floor of the deep basin is about 4 km down.',
  'Colours show what is dissolved in the water; pick what to show with the buttons under the picture. Moving specks show what is happening: teal for cyanobacteria at work, red for rust sinking, white bubbles for oxygen and amber ones for methane leaving the sea, olive for iron rising from the vents.',
  'The sky turns orange when methane makes a haze. The land on the left turns red once oxygen rusts the rocks, and the volcano smokes harder during lava floods. Ice spreads over the sea from the right as the planet freezes. The small globe shows how far the ice reaches.',
];

export const ABOUT_MODEL = [
  'The model couples five parts: the air (oxygen and methane, with the photochemistry and ozone shield of Goldblatt and others, 2006), a climate model with ice in 18 latitude bands, an ocean slice of 56 × 20 boxes with currents, plankton, iron, sulfur and methane, a carbon cycle with weathering, and a record of the rocks each step lays down.',
  'Each step is half a million years. Slow forcings set the stage: a Sun brightening from 79 % to 86 % of today, a cooling mantle giving off less gas and iron, continents rising out of the sea, the magmatic lull and the large igneous provinces dated in real rocks.',
  'It is a toy model: one slice stands for all the world’s ocean margins, the climate is a single yearly average, and many numbers are tuned to land near the evidence. It shows how the pieces push on each other, not exactly what happened.',
];
