/**
 * Astronomical and Aerospace Celestial Body Data.
 * Inspired by 3D Solar System Visualizer with D-Orbit mission-specific additions.
 */

export interface CelestialBodyInfo {
  name: string;
  displayName: string;
  type: string;
  radiusKm: number;
  massKg: string;
  gravityMps2: number;
  temperature: string;
  dayLength: string;
  yearLength: string;
  orbitalSpeedKmh: number;
  moons: number;
  fact: string;
  gravityNote: string;
  audioUrl?: string;
  accentColor: string;
  isMissionAsset?: boolean;
}

export const CELESTIAL_BODIES: Record<string, CelestialBodyInfo> = {
  Sun: {
    name: 'Sun',
    displayName: 'The Sun',
    type: 'G-type Main Sequence Star',
    radiusKm: 696340,
    massKg: '1.989 × 10³⁰',
    gravityMps2: 274.0,
    temperature: '5,500°C (surface) / 15,000,000°C (core)',
    dayLength: '25–35 Earth days (differential)',
    yearLength: '225–250 million Earth years (Galactic orbit)',
    orbitalSpeedKmh: 0,
    moons: 0,
    fact: 'The Sun contains 99.86% of all mass in the Solar System and powers Earth life via nuclear fusion.',
    gravityNote: 'Its gravitational well binds all planets, dwarf planets, and asteroids out to the Oort Cloud.',
    audioUrl: '/audio/sun.mp3',
    accentColor: '#ff9d24'
  },
  Mercury: {
    name: 'Mercury',
    displayName: 'Mercury',
    type: 'Terrestrial Planet',
    radiusKm: 2439.7,
    massKg: '3.301 × 10²³',
    gravityMps2: 3.7,
    temperature: '-180°C (night) to +430°C (day)',
    dayLength: '58.6 Earth days (3:2 spin-orbit resonance)',
    yearLength: '87.97 Earth days',
    orbitalSpeedKmh: 170500,
    moons: 0,
    fact: 'Mercury is the closest planet to the Sun and possesses a massive metallic iron core taking up 85% of its radius.',
    gravityNote: 'About 38% of Earth’s surface gravity. It has virtually no atmosphere to trap heat.',
    audioUrl: '/audio/mercury.mp3',
    accentColor: '#94a3b8'
  },
  Venus: {
    name: 'Venus',
    displayName: 'Venus',
    type: 'Terrestrial Planet',
    radiusKm: 6051.8,
    massKg: '4.867 × 10²⁴',
    gravityMps2: 8.87,
    temperature: '≈ 465°C (runaway greenhouse)',
    dayLength: '243 Earth days (retrograde spin)',
    yearLength: '224.7 Earth days',
    orbitalSpeedKmh: 126070,
    moons: 0,
    fact: 'Venus is the hottest planet in the Solar System with surface atmospheric pressures equivalent to 900 meters underwater.',
    gravityNote: 'Surface gravity is 90% of Earth’s. Super-rotating sulfuric acid clouds whip around the planet every 4 days.',
    audioUrl: '/audio/venus.mp3',
    accentColor: '#f59e0b'
  },
  Earth: {
    name: 'Earth',
    displayName: 'Earth (Migration Target)',
    type: 'Living Terrestrial Planet',
    radiusKm: 6371.0,
    massKg: '5.972 × 10²⁴',
    gravityMps2: 9.807,
    temperature: '15°C mean (-89°C to +58°C)',
    dayLength: '23.934 hours (prograde)',
    yearLength: '365.256 days (initial: 1.0 AU → target: 2.7 AU, 4.43 yr)',
    orbitalSpeedKmh: 107226,
    moons: 1,
    fact: 'Humanity’s home world. The D-Orbit mission expands Earth’s orbit from 1.0000 AU out to 2.7000 AU over 9,516 years.',
    gravityNote: 'Earth maintains surface gravity and keeps the Moon securely bound inside its expanding Hill sphere throughout migration.',
    audioUrl: '/audio/earth.mp3',
    accentColor: '#38bdf8',
    isMissionAsset: true
  },
  Moon: {
    name: 'Moon',
    displayName: 'The Moon (Luna)',
    type: 'Natural Satellite',
    radiusKm: 1737.4,
    massKg: '7.342 × 10²²',
    gravityMps2: 1.62,
    temperature: '-130°C to +120°C',
    dayLength: '27.32 Earth days (tidally locked)',
    yearLength: '27.32 Earth days (synodic: 29.53 d)',
    orbitalSpeedKmh: 3683,
    moons: 0,
    fact: 'The Moon stabilizes Earth’s axial obliquity (23.4°). The Ceres Tug keeps the Moon safely bound within Earth’s Hill sphere.',
    gravityNote: 'About 16.6% of Earth’s gravity. Lunar reflex modulates Earth’s osculating semi-major axis by ±0.00095 AU.',
    audioUrl: '/audio/earth.mp3',
    accentColor: '#cbd5e1',
    isMissionAsset: true
  },
  Tug: {
    name: 'Tug',
    displayName: 'Ceres Gravity Tug',
    type: 'Relativistic Gravity Tractor & Propulsion Hub',
    radiusKm: 473.0,
    massKg: '9.400 × 10²⁰',
    gravityMps2: 0.28,
    temperature: '40 K (-233°C radiator baseline)',
    dayLength: '9.074 hours (axial)',
    yearLength: 'Synchronous with Earth spiral',
    orbitalSpeedKmh: 107226,
    moons: 0,
    fact: 'Relocated asteroid Ceres pulling Earth tangentially via gravity (F = 2.33 × 10¹⁷ N) using dual 0.3c relativistic ion plumes.',
    gravityNote: 'Standoff d = 1.27 × 10⁹ m ahead of Earth. Exhaust plumes canted ±5° out-of-ecliptic to clear Earth and the Moon.',
    audioUrl: '/audio/solar-system.mp3',
    accentColor: '#a855f7',
    isMissionAsset: true
  },
  Mars: {
    name: 'Mars',
    displayName: 'Mars',
    type: 'Terrestrial Planet',
    radiusKm: 3389.5,
    massKg: '6.417 × 10²³',
    gravityMps2: 3.72,
    temperature: '-65°C mean (-125°C to +20°C)',
    dayLength: '24 hours 37 minutes (1 sol)',
    yearLength: '686.98 Earth days (1.88 Earth years)',
    orbitalSpeedKmh: 86677,
    moons: 2,
    fact: 'Home to Olympus Mons (21.9 km high) and Valles Marineris. Earth safely crosses Mars’ orbital radius (1.52 AU) at Year ~3,100.',
    gravityNote: 'Mars has 38% Earth gravity. D-Orbit coordinates phase timing to avoid gravitational resonance during crossing.',
    audioUrl: '/audio/mars.mp3',
    accentColor: '#ef4444'
  },
  AsteroidBelt: {
    name: 'AsteroidBelt',
    displayName: 'Main Asteroid Belt',
    type: 'Circumsolar Planetesimal Ring (2.2 – 3.2 AU)',
    radiusKm: 150000000,
    massKg: '≈ 2.4 × 10²¹',
    gravityMps2: 0.05,
    temperature: '-73°C to -108°C',
    dayLength: 'Variable per asteroid',
    yearLength: '3.3 to 6.0 Earth years',
    orbitalSpeedKmh: 64500,
    moons: 0,
    fact: 'Contains millions of rocky and metallic bodies. Earth enters the Belt at Year ~7,000 and settles at 2.70 AU inside the Belt.',
    gravityNote: 'Total belt mass is only 4% of Earth’s Moon, with Ceres alone accounting for approximately 39% of the total mass.',
    audioUrl: '/audio/solar-system.mp3',
    accentColor: '#d97706'
  },
  Jupiter: {
    name: 'Jupiter',
    displayName: 'Jupiter',
    type: 'Gas Giant',
    radiusKm: 69911,
    massKg: '1.898 × 10²⁷',
    gravityMps2: 24.79,
    temperature: '-110°C (cloud tops)',
    dayLength: '9 hours 56 minutes (fastest spin)',
    yearLength: '11.86 Earth years',
    orbitalSpeedKmh: 47000,
    moons: 95,
    fact: 'The king of planets, with a mass 2.5 times that of all other planets combined and the iconic Great Red Spot storm.',
    gravityNote: '2.5 times Earth’s surface gravity. Its vast gravitational influence shapes the outer edge of the Main Asteroid Belt.',
    audioUrl: '/audio/jupiter.mp3',
    accentColor: '#f97316'
  },
  Saturn: {
    name: 'Saturn',
    displayName: 'Saturn',
    type: 'Gas Giant & Ring System',
    radiusKm: 58232,
    massKg: '5.683 × 10²⁶',
    gravityMps2: 10.44,
    temperature: '-140°C (cloud tops)',
    dayLength: '10 hours 33 minutes',
    yearLength: '29.46 Earth years',
    orbitalSpeedKmh: 34884,
    moons: 146,
    fact: 'Famous for its dazzling 282,000 km wide ring system made of billions of chunks of pure water ice and rocky debris.',
    gravityNote: 'Saturn is the only planet in the Solar System less dense than liquid water (0.687 g/cm³).',
    audioUrl: '/audio/saturn.mp3',
    accentColor: '#eab308'
  },
  Uranus: {
    name: 'Uranus',
    displayName: 'Uranus',
    type: 'Ice Giant',
    radiusKm: 25362,
    massKg: '8.681 × 10²⁵',
    gravityMps2: 8.69,
    temperature: '-224°C (coldest planetary atmosphere)',
    dayLength: '17 hours 14 minutes (retrograde)',
    yearLength: '84.01 Earth years',
    orbitalSpeedKmh: 24607,
    moons: 28,
    fact: 'Uranus rolls on its side with an axial tilt of 97.8°, giving it extreme 42-year seasons in complete sunlight or darkness.',
    gravityNote: '89% of Earth’s surface gravity. Its aquamarine color comes from atmospheric methane absorbing red light.',
    audioUrl: '/audio/uranus.mp3',
    accentColor: '#06b6d4'
  },
  Neptune: {
    name: 'Neptune',
    displayName: 'Neptune',
    type: 'Ice Giant',
    radiusKm: 24622,
    massKg: '1.024 × 10²⁶',
    gravityMps2: 11.15,
    temperature: '-218°C',
    dayLength: '16 hours 6 minutes',
    yearLength: '164.8 Earth years',
    orbitalSpeedKmh: 19566,
    moons: 16,
    fact: 'The windiest world in the Solar System, with supersonic storms reaching 2,100 km/h and deep blue methane clouds.',
    gravityNote: 'Surface gravity is 1.14 times Earth’s. Its largest moon, Triton, orbits in a retrograde direction and has cryovolcanoes.',
    audioUrl: '/audio/neptune.mp3',
    accentColor: '#3b82f6'
  }
};

export const CELESTIAL_LIST: string[] = [
  'Sun',
  'Mercury',
  'Venus',
  'Earth',
  'Moon',
  'Tug',
  'Mars',
  'AsteroidBelt',
  'Jupiter',
  'Saturn',
  'Uranus',
  'Neptune'
];
