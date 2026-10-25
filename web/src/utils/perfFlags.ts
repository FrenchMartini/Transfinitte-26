export interface PerfFlags {
  perf: boolean;
  nobloom: boolean;
  nobelt: boolean;
  nolabels: boolean;
  notrails: boolean;
  noatmo: boolean;
  notwinkle: boolean;
  nohud: boolean;
  halftex: boolean;
}

export function getPerfFlags(): PerfFlags {
  if (typeof window === 'undefined') {
    return {
      perf: false,
      nobloom: false,
      nobelt: false,
      nolabels: false,
      notrails: false,
      noatmo: false,
      notwinkle: false,
      nohud: false,
      halftex: false
    };
  }

  const p = new URLSearchParams(window.location.search);
  return {
    perf: p.has('perf'),
    nobloom: p.has('nobloom'),
    nobelt: p.has('nobelt'),
    nolabels: p.has('nolabels'),
    notrails: p.has('notrails'),
    noatmo: p.has('noatmo'),
    notwinkle: p.has('notwinkle'),
    nohud: p.has('nohud'),
    halftex: p.has('halftex')
  };
}
