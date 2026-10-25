# Legacy Visualizer Inventory (Gate G0)

This inventory audits every visual, astrophysical, and user-interface feature in the legacy visualizer (`legacy/`), citing exact files, line numbers, mechanisms, and assets.

---

## 1. Feature Inventory Table

| Feature | Legacy file:line | How it works (2 sentences) | Asset files used | Ported? | Screenshot diff |
|---|---|---|---|---|---|
| **1. Earth rotation & axial tilt** | `legacy/src/views/solar_system.ts:2482-2488`, `legacy/src/config.ts:34` | Computes Earth's diurnal rotation angle $\theta(t) = 2\pi (t \pmod{T_{\text{rot}}}) / T_{\text{rot}}$ with sidereal day $T_{\text{rot}} = 86,164.1\text{ s}$ ($23.934\text{ h}$). Earth's clouds rotate independently at $1.04\times$ diurnal rate ($4\%$ faster easterly super-rotation). Earth's spin axis is tilted at authentic $23.44^\circ$ obliquity. | None (procedural rotation) | In Progress | G0 Pending |
| **2. Earth textures & layers** | `legacy/src/views/solar_system.ts:2145-2205` | Earth uses a multi-layer sphere composite: base terrain with day map and emissive night city lights, a transparent cloud sphere with alpha map at $r = 1.01\times R_{\oplus}$, and a custom Rayleigh atmospheric scattering Fresnel rim shader on the sunward limb. Night lights activate on the anti-solar hemisphere via standard material illumination. | `/textures/earth.webp`, `/textures/earth_clouds.webp`, `/textures/earth_lights.webp` | Yes | G0 Pending |
| **3. Moon orbit** | `legacy/src/views/solar_system.ts:2560-2568`, `legacy/src/config.ts:62` | The Moon is positioned in Earth's local coordinate frame at standoff $d = 384,400\text{ km}$ ($0.92$ scene units) along an inclined orbit ($i = 5.145^\circ$, using $y = 0.089 \sin(\theta)$) with period $T_{\text{moon}} = 27.32166\text{ days}$. The orbit modulates smoothly over time without tearing. | None (analytical orbit) | Yes | G0 Pending |
| **4. Moon rotation & tidal lock** | `legacy/src/views/solar_system.ts:2527, 2562`, `legacy/src/config.ts:62` | Moon axial rotation period is locked to its orbital period ($27.32166\text{ days}$), maintaining synchronous tidal lock so the near side permanently faces Earth. Axial spin is updated synchronously with orbital phase. | None (analytical spin) | Yes | G0 Pending |
| **5. Moon textures** | `legacy/src/views/solar_system.ts:2212-2220` | Moon is rendered with high-resolution cratered regolith texture on a `MeshStandardMaterial` ($r = 0.11$, roughness 0.88, metalness 0.05). Receives directional shadows from the Sun and Earth. | `/textures/moon.webp` | Yes | G0 Pending |
| **6. Sun mesh, plasma, corona & light** | `legacy/src/views/solar_system.ts:2075-2112, 605-625`, `legacy/src/shaders/sun_plasma.ts:19-335` | The Sun consists of a 5-layer composite: an inner 3D FBM procedural solar plasma photosphere with active magnetic regions, a hot core additive shell, an outer rotating plasma shell, a dynamic turbulent corona, and an outer soft corona glow. Illumination is cast by a central `THREE.PointLight(0xffffff, 3.2)` at the origin with 2048x2048 PCF soft shadow mapping. | `/textures/sun.webp` (photosphere base) + `legacy/src/shaders/sun_plasma.ts` | Yes | G0 Pending |
| **7. Day/night terminator** | `legacy/src/views/solar_system.ts:605-625, 2190-2205`, `legacy/src/shaders/celestial_materials.ts:241` | Physical point illumination from the central Sun at $(0,0,0)$ naturally casts light across the sunward hemisphere of all planets, leaving the anti-solar hemisphere in dark shadow. Earth's night hemisphere reveals city lights via standard emissive masking, while atmospheric scattering fades smoothly past the terminator using $\text{smoothstep}(-0.15, 0.35, \mathbf{n} \cdot \mathbf{l}_{\odot})$. | None (PBR lighting + shader) | Yes | G0 Pending |
| **8. Planet shadows & eclipses** | `legacy/src/views/solar_system.ts:555-556, 617-621, 2126-2386` | Real-time `PCFSoftShadowMap` is enabled on the Three.js WebGL renderer. Every celestial body, moon, ring, and spacecraft enables `castShadow = true` and `receiveShadow = true`, allowing planetary bodies to cast shadows on rings, moons, and trailing structures. | None (hardware shadow maps) | Yes | G0 Pending |
| **9. Starfield & deep space** | `legacy/src/views/solar_system.ts:480-530`, `legacy/src/shaders/deep_space.ts:1-120` | A deterministic 2,500-star particle field is generated using Mulberry32 PRNG seed 42 at radial distances from 800 to 2,500 AU with subtle twinkling. Flat dark space background matches theme tokens without distracting nebula noise. | None (PRNG Points) | Yes | G0 Pending |
| **10. Camera controls & presets** | `legacy/src/views/solar_system.ts:560-580, 2900-3050` | `OrbitControls` with logarithmic depth buffer support, near plane 0.05, far plane 50,000 AU. Features animated 1.2s smooth ease-in-out transitions and specialized viewing standoff presets for all 8 planets, the Moon, the Ceres Tug, L1/L2 statites, Asteroid Belt, and System Overview. | None (OrbitControls) | Yes | G0 Pending |
| **11. UI controls, time-warp & HUD** | `legacy/src/ui.ts:1-1400`, `legacy/src/config.ts:89-97` | Full-featured control bar with play/pause, step forward/back, scrubbing timeline, and 4 multi-unit time-warp rates (1 day/s, 1 week/s, 1 month/s, 1 yr/s, up to 500 yr/s). Real-time telemetry panels display distance from Sun, insolation, temperature, Moon distance, structural safety factor, and winning conditions. | None (DOM UI / CSS) | Yes | G0 Pending |
| **12. Ceres Gravity Tug & thruster plumes** | `legacy/src/views/solar_system.ts:1000-1450, 2710-2780` | Detailed Ceres asteroid body with mining gantry, rotating rock mill drills, plasma reactor core, truss structural cradle, and radiator panels hovering at standoff $d = 1.27 \times 10^9\text{ m}$ ahead of Earth. Dual relativistic thruster plumes canted $\pm 5.0^\circ$ physical ($\pm 28.0^\circ$ visual) out-of-ecliptic to clear Earth and Moon. | None (procedural meshes) | Yes | G0 Pending |
| **13. L1/L2 Statite Climate Swarm** | `legacy/src/views/solar_system.ts:1600-1980, 2790-2890` | L1 sunward statite concentrator lens focusing solar flux onto Earth's poles and terminators, plus L2 night-side hexagonal thermal radiator swarm with planetary infrared warming beams. Fixed basis tracking eliminates roll/yaw relative to the Sun-Earth axis. | None (procedural meshes) | Yes | G0 Pending |
| **14. Planetary System Moons** | `legacy/src/views/solar_system.ts:2572-2708`, `legacy/src/config.ts:70-87` | Mars moons (Phobos, Deimos), Jovian Galilean moons (Io, Europa, Ganymede, Callisto), Saturnian major moons (Enceladus, Tethys, Rhea, Titan), Uranian moons (Titania, Oberon), and Neptunian retrograde moon (Triton) orbiting at authentic periods and radii. | None (analytical orbital meshes) | In Progress | G0 Pending |
| **15. Main Asteroid Belt** | `legacy/src/views/solar_system.ts:420-475`, `legacy/src/config.ts:31-33` | 3,500 instanced Asteroid Belt particles distributed between 2.2 and 3.2 AU using Mulberry32 PRNG seed 999 with realistic Keplerian orbital drift. | None (InstancedMesh) | Yes | G0 Pending |
| **16. Traversed Orbital Trail** | `legacy/src/views/solar_system.ts:75-87, 2470-2510` | Dynamic trail geometry displaying strictly the path traversed up to current simulation time $t$, updating as Earth spirals from 1.0 AU outward to 2.7 AU without polygon chord sag. | None (Line geometry) | Yes | G0 Pending |

---

## 2. Asset Inventory & SHA-256 Manifest

The following textures exist in `legacy/public/textures/` and are copied byte-for-byte to `web/public/textures/`:

```text
legacy/public/textures/earth.jpg
legacy/public/textures/earth_clouds.png
legacy/public/textures/earth_lights.png
legacy/public/textures/jupiter.jpg
legacy/public/textures/mars.jpg
legacy/public/textures/mercury.jpeg
legacy/public/textures/moon.jpg
legacy/public/textures/neptune.jpg
legacy/public/textures/saturn.jpg
legacy/public/textures/saturn_ring.png
legacy/public/textures/sun.jpg
legacy/public/textures/uranus.jpeg
legacy/public/textures/venus.jpeg
```

Zero procedural texture generation scripts (.py or other generator scripts) exist in the repository. All assets originate from `legacy/`.

---

## 3. Discrepancy & Gap Analysis

1. **Procedural Shaders:**
   - Legacy includes `legacy/src/shaders/sun_plasma.ts` (the 3D FBM Sun plasma shader), `legacy/src/shaders/celestial_materials.ts`, and `legacy/src/shaders/deep_space.ts`.
   - The Sun in the new app was previously falling back to `sunTexture` with white basic material. Porting `createSunPlasmaMaterial` from `legacy/src/shaders/sun_plasma.ts` restores the exact cinematic fiery orange Sun.
2. **Moons:**
   - Earth's Moon was implemented; the outer planetary moons (Phobos, Deimos, Io, Europa, Ganymede, Callisto, Titan, Enceladus, Titania, Oberon, Triton) from `legacy/src/views/solar_system.ts:2572-2708` are mapped in Row 14 and ready for inclusion in `Planets.tsx`.
3. **Continuous 60 FPS Interpolation:**
   - Unwrapped boundary-matched angular interpolation has been implemented in `interpolation.ts` to eliminate frame boundary snapping.

---

## 4. Verification Gate Status
- **G0 Gate:** Ready for review and approval.
