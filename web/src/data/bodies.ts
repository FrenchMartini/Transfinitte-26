export interface CelestialBodyData {
  name: string;
  displayName: string;
  type: string;
  radiusKm: number;
  massKg: string;
  gravityMps2: number;
  orbitAu: number;
  periodYr: number;
  orbitalSpeedKmS: number;
  moons: number;
  dayLength: string;
  isMissionAsset?: boolean;
}

export const BODIES: Record<string, CelestialBodyData> = {
  Sun: {
    name: 'Sun',
    displayName: 'Sun',
    type: 'G-Type Star',
    radiusKm: 696340,
    massKg: '1.989 × 10³⁰ kg',
    gravityMps2: 274.0,
    orbitAu: 0,
    periodYr: 0,
    orbitalSpeedKmS: 0,
    moons: 0,
    dayLength: '25.38 days'
  },
  Mercury: {
    name: 'Mercury',
    displayName: 'Mercury',
    type: 'Terrestrial Planet',
    radiusKm: 2439.7,
    massKg: '3.301 × 10²³ kg',
    gravityMps2: 3.70,
    orbitAu: 0.387,
    periodYr: 0.241,
    orbitalSpeedKmS: 47.36,
    moons: 0,
    dayLength: '58.65 days'
  },
  Venus: {
    name: 'Venus',
    displayName: 'Venus',
    type: 'Terrestrial Planet',
    radiusKm: 6051.8,
    massKg: '4.867 × 10²⁴ kg',
    gravityMps2: 8.87,
    orbitAu: 0.723,
    periodYr: 0.615,
    orbitalSpeedKmS: 35.02,
    moons: 0,
    dayLength: '243.02 days'
  },
  Earth: {
    name: 'Earth',
    displayName: 'Earth',
    type: 'Target Planet',
    radiusKm: 6371.0,
    massKg: '5.972 × 10²⁴ kg',
    gravityMps2: 9.807,
    orbitAu: 1.000,
    periodYr: 1.000,
    orbitalSpeedKmS: 29.78,
    moons: 1,
    dayLength: '24.00 hours',
    isMissionAsset: true
  },
  Moon: {
    name: 'Moon',
    displayName: 'Moon',
    type: 'Natural Satellite',
    radiusKm: 1737.4,
    massKg: '7.342 × 10²² kg',
    gravityMps2: 1.62,
    orbitAu: 1.0026,
    periodYr: 0.0748,
    orbitalSpeedKmS: 1.022,
    moons: 0,
    dayLength: '27.32 days',
    isMissionAsset: true
  },
  Tug: {
    name: 'Tug',
    displayName: 'Ceres Tug',
    type: 'Relativistic Tug',
    radiusKm: 473.0,
    massKg: '9.400 × 10²⁰ kg',
    gravityMps2: 0.28,
    orbitAu: 1.0085,
    periodYr: 1.000,
    orbitalSpeedKmS: 29.78,
    moons: 0,
    dayLength: '9.07 hours',
    isMissionAsset: true
  },
  Mars: {
    name: 'Mars',
    displayName: 'Mars',
    type: 'Terrestrial Planet',
    radiusKm: 3389.5,
    massKg: '6.417 × 10²³ kg',
    gravityMps2: 3.72,
    orbitAu: 1.524,
    periodYr: 1.881,
    orbitalSpeedKmS: 24.08,
    moons: 2,
    dayLength: '24.62 hours'
  },
  AsteroidBelt: {
    name: 'AsteroidBelt',
    displayName: 'Asteroid Belt',
    type: 'Planetesimal Ring',
    radiusKm: 150000000,
    massKg: '2.4 × 10²¹ kg',
    gravityMps2: 0.05,
    orbitAu: 2.700,
    periodYr: 4.433,
    orbitalSpeedKmS: 18.12,
    moons: 0,
    dayLength: 'Variable'
  },
  Jupiter: {
    name: 'Jupiter',
    displayName: 'Jupiter',
    type: 'Gas Giant',
    radiusKm: 69911,
    massKg: '1.898 × 10²⁷ kg',
    gravityMps2: 24.79,
    orbitAu: 5.204,
    periodYr: 11.862,
    orbitalSpeedKmS: 13.07,
    moons: 95,
    dayLength: '9.93 hours'
  },
  Saturn: {
    name: 'Saturn',
    displayName: 'Saturn',
    type: 'Gas Giant',
    radiusKm: 58232,
    massKg: '5.683 × 10²⁶ kg',
    gravityMps2: 10.44,
    orbitAu: 9.582,
    periodYr: 29.457,
    orbitalSpeedKmS: 9.69,
    moons: 146,
    dayLength: '10.55 hours'
  },
  Uranus: {
    name: 'Uranus',
    displayName: 'Uranus',
    type: 'Ice Giant',
    radiusKm: 25362,
    massKg: '8.681 × 10²⁵ kg',
    gravityMps2: 8.69,
    orbitAu: 19.201,
    periodYr: 84.011,
    orbitalSpeedKmS: 6.81,
    moons: 28,
    dayLength: '17.24 hours'
  },
  Neptune: {
    name: 'Neptune',
    displayName: 'Neptune',
    type: 'Ice Giant',
    radiusKm: 24622,
    massKg: '1.024 × 10²⁶ kg',
    gravityMps2: 11.15,
    orbitAu: 30.047,
    periodYr: 164.79,
    orbitalSpeedKmS: 5.43,
    moons: 16,
    dayLength: '16.11 hours'
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
