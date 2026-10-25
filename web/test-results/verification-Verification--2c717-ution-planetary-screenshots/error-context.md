# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: verification.spec.ts >> Verification: Console errors, Font-family check, Measured FPS, and Multi-resolution planetary screenshots
- Location: e2e/verification.spec.ts:5:1

# Error details

```
Error: expect(received).toEqual(expected) // deep equality

- Expected  -  1
+ Received  + 22

- Array []
+ Array [
+   Object {
+     "text": "THREE.WebGLShadowMap: PCFSoftShadowMap has been removed. Using PCFShadowMap instead.",
+     "type": "warning",
+   },
+   Object {
+     "text": "THREE.WebGLShadowMap: PCFSoftShadowMap has been removed. Using PCFShadowMap instead.",
+     "type": "warning",
+   },
+   Object {
+     "text": "THREE.WebGLShadowMap: PCFSoftShadowMap has been removed. Using PCFShadowMap instead.",
+     "type": "warning",
+   },
+   Object {
+     "text": "THREE.WebGLShadowMap: PCFSoftShadowMap has been removed. Using PCFShadowMap instead.",
+     "type": "warning",
+   },
+   Object {
+     "text": "THREE.WebGLShadowMap: PCFSoftShadowMap has been removed. Using PCFShadowMap instead.",
+     "type": "warning",
+   },
+ ]
```

# Page snapshot

```yaml
- generic [ref=f4e3]:
  - banner [ref=f4e4]:
    - generic [ref=f4e5]:
      - img "Delta" [ref=f4e6]
      - generic [ref=f4e7]: Far Orbit
      - generic [ref=f4e8]:
        - generic [ref=f4e9]: Mission
        - generic [ref=f4e10]: Year 0.00
        - generic [ref=f4e11]: (0.0 Gs)
    - generic [ref=f4e12]:
      - button "Orbits" [ref=f4e13] [cursor=pointer]
      - button "Music" [ref=f4e14] [cursor=pointer]
      - button "Narration" [ref=f4e15] [cursor=pointer]
      - button "Plumes" [ref=f4e16] [cursor=pointer]
      - button "Verification" [ref=f4e17] [cursor=pointer]
      - button "Options" [ref=f4e18] [cursor=pointer]
  - complementary [ref=f4e19]:
    - generic [ref=f4e20]: Celestial Bodies
    - combobox "Target Focus Dropdown" [ref=f4e22] [cursor=pointer]:
      - generic: Earth
      - generic [aria-hidden] [ref=f4e23]: ▼
    - generic [ref=f4e24]:
      - button "Solar System" [ref=f4e25] [cursor=pointer]
      - button "Sun" [ref=f4e28] [cursor=pointer]
      - button "Mercury" [ref=f4e31] [cursor=pointer]
      - button "Venus" [ref=f4e34] [cursor=pointer]
      - button "Earth" [ref=f4e37] [cursor=pointer]
      - button "Moon" [ref=f4e40] [cursor=pointer]
      - button "Ceres Tug" [ref=f4e43] [cursor=pointer]
      - button "Mars" [ref=f4e46] [cursor=pointer]
      - button "Asteroid Belt" [ref=f4e49] [cursor=pointer]
      - button "Jupiter" [ref=f4e52] [cursor=pointer]
      - button "Saturn" [ref=f4e55] [cursor=pointer]
      - button "Uranus" [ref=f4e58] [cursor=pointer]
      - button "Neptune" [ref=f4e61] [cursor=pointer]
    - button "Scale Matrix ▼" [ref=f4e66] [cursor=pointer]:
      - generic [ref=f4e67]: Scale Matrix
      - generic [ref=f4e68]: ▼
  - main [ref=f4e70]:
    - generic [ref=f4e71]:
      - generic: Mercury
      - generic: Venus
      - generic: Earth
      - generic: Moon
      - generic: Tug
      - generic: Mars
      - generic: Jupiter
      - generic: Saturn
      - generic: Uranus
      - generic: Neptune
    - generic [ref=f4e94]:
      - button "Zoom In" [ref=f4e95] [cursor=pointer]: +
      - button "Zoom Out" [ref=f4e96] [cursor=pointer]: −
      - button "Reset View" [ref=f4e97] [cursor=pointer]: Reset
  - complementary [ref=f4e98]:
    - generic [ref=f4e99]:
      - generic [ref=f4e100]: Earth
      - generic [ref=f4e101]: Target Planet
    - generic [ref=f4e102]:
      - generic [ref=f4e103]:
        - generic [ref=f4e104]: Radius
        - generic [ref=f4e105]: 6,371 km
      - generic [ref=f4e106]:
        - generic [ref=f4e107]: Mass
        - generic [ref=f4e108]: 5.972 × 10²⁴ kg
      - generic [ref=f4e109]:
        - generic [ref=f4e110]: Orbit Radius
        - generic [ref=f4e111]: 1.0000 AU
      - generic [ref=f4e112]:
        - generic [ref=f4e113]: Orbital Speed
        - generic [ref=f4e114]: 29.78 km/s
      - generic [ref=f4e115]:
        - generic [ref=f4e116]: Orbital Period
        - generic [ref=f4e117]: 1.00 yr
      - generic [ref=f4e118]:
        - generic [ref=f4e119]: Migration Target
        - generic [ref=f4e120]: 2.7000 AU
      - generic [ref=f4e121]:
        - generic [ref=f4e122]: Migration Progress
        - generic [ref=f4e123]: 0.0%
      - generic [ref=f4e124]:
        - generic [ref=f4e125]: Ledger Audit
        - generic [ref=f4e126]: PASS
      - generic [ref=f4e127]:
        - generic [ref=f4e128]: Waste Heat
        - generic [ref=f4e129]: 0.05 W/m²
      - generic [ref=f4e130]:
        - generic [ref=f4e131]: Moon Distance
        - generic [ref=f4e132]: 384,400 km
      - generic "Click to view plume canting details" [ref=f4e133] [cursor=pointer]:
        - generic [ref=f4e134]: Plume Canting
        - generic [ref=f4e135]: ±5.0° Out-Ecliptic
      - generic [ref=f4e136]:
        - generic [ref=f4e137]: Yaw Trim
        - generic [ref=f4e138]: 8.08° In-Ecliptic
      - generic "Click to view 10/10 verification benchmarks" [ref=f4e139] [cursor=pointer]:
        - generic [ref=f4e140]: Verification
        - generic [ref=f4e141]: 10/10 PASS
  - contentinfo [ref=f4e142]:
    - generic [ref=f4e143]:
      - generic [ref=f4e144]:
        - button "Rewind" [ref=f4e145] [cursor=pointer]: ⏮
        - button "Step Back 10 Yrs" [ref=f4e146] [cursor=pointer]: ◀
        - button "Play" [ref=f4e147] [cursor=pointer]: ▶
        - button "Step Forward 10 Yrs" [ref=f4e148] [cursor=pointer]: ▶
        - generic [ref=f4e149]:
          - generic [ref=f4e150]: Year 0.00 / 9553.44
          - generic [ref=f4e151]: Frame 0 / 1199 | 0.0 s
      - generic [ref=f4e152]:
        - generic [ref=f4e153]:
          - button "1 Day/s" [ref=f4e154] [cursor=pointer]
          - button "1 Week/s" [ref=f4e155] [cursor=pointer]
          - button "1 Month/s" [ref=f4e156] [cursor=pointer]
          - button "1 Year/s" [ref=f4e157] [cursor=pointer]
          - button "10 Yr/s" [ref=f4e158] [cursor=pointer]
          - button "100 Yr/s" [ref=f4e159] [cursor=pointer]
        - generic [ref=f4e160]:
          - generic [ref=f4e161]: "Rate:"
          - slider "Playback speed" [ref=f4e162] [cursor=pointer]: "0.677"
          - generic [ref=f4e163]:
            - spinbutton "Speed magnitude" [ref=f4e164]: "10"
            - combobox "Speed unit" [ref=f4e165] [cursor=pointer]:
              - option "d/s"
              - option "wk/s"
              - option "mo/s"
              - option "yr/s" [selected]
    - generic [ref=f4e166]:
      - slider "Timeline Scrubber" [ref=f4e167] [cursor=pointer]: "0"
      - generic:
        - generic: 1.0 AU Departure
        - generic: 1.52 AU Mars Crossing
        - generic: 2.20 AU Belt Entry
        - generic: 2.70 AU Target Orbit
```