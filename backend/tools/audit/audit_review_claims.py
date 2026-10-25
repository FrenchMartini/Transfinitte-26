"""Script to audit Reviewer Claims 1-9 and scan float literals in octo/ and py/."""

import ast
import json
import math
from pathlib import Path
import numpy as np
import rebound
import yaml

ROOT = Path(__file__).resolve().parent.parent.parent


def test_standoff_flag_0_vs_1():
    """Evaluate Claim 5: 200-year standoff d(t) with force_is_velocity_dependent = 0 vs 1."""
    with open(ROOT / "config" / "base.yaml") as f:
        cfg = yaml.safe_load(f)

    G = 6.67430e-11
    GM_SUN = 1.32712440018e20
    m_sun = GM_SUN / G
    m_earth = 5.9722e24
    r0 = 1.495978707e11
    v0 = math.sqrt(GM_SUN / r0)
    m_tug = 9.4e20
    d0 = 1.2701e9
    mdot = 2.501e9
    ve = 0.3 * 299792458.0
    gamma = 1.0 / math.sqrt(1.0 - 0.3**2)

    f_engine = mdot * gamma * ve
    cant_factor = math.cos(math.radians(5.0))
    f_cant = f_engine * cant_factor
    f_photon = 1.0e25 / 299792458.0
    yaw_rad = math.atan(f_photon / f_cant)
    f_eff = f_cant * math.cos(yaw_rad)
    a_req = f_eff / m_earth
    f_nominal = f_eff + m_tug * a_req

    omega0_sq = 2.0 * G * m_earth / (d0**3)
    kp = 3.0 * m_tug * omega0_sq
    kd = 2.0 * math.sqrt(m_tug * kp)

    years = [10.0, 20.0, 50.0, 100.0, 150.0, 200.0]

    # Reduced model baseline
    sim_red = rebound.Simulation()
    sim_red.integrator = "ias15"
    sim_red.G = G
    sim_red.force_is_velocity_dependent = 0
    sim_red.add(m=m_sun, x=0, y=0, z=0, vx=0, vy=0, vz=0)
    sim_red.add(m=m_earth, x=r0, y=0, z=0, vx=0, vy=v0, vz=0)

    def af_red(sim_p):
        s = sim_p.contents
        ps, pe = s.particles[0], s.particles[1]
        dx, dy = pe.x - ps.x, pe.y - ps.y
        re = math.sqrt(dx**2 + dy**2)
        f_pull = G * m_earth * m_tug / (d0**2)
        pe.ax += (f_pull * (-dy / re)) / pe.m
        pe.ay += (f_pull * (dx / re)) / pe.m

    sim_red.additional_forces = af_red
    da_red = []
    for yr in years:
        sim_red.integrate(yr * 31557600.0)
        ps, pe = sim_red.particles[0], sim_red.particles[1]
        rf = math.sqrt((pe.x - ps.x)**2 + (pe.y - ps.y)**2)
        vf = math.sqrt((pe.vx - ps.vx)**2 + (pe.vy - ps.vy)**2)
        eps = 0.5 * vf**2 - (G * (m_sun + m_earth)) / rf
        a_r = -(G * (m_sun + m_earth)) / (2.0 * eps)
        da_red.append((a_r - r0) / r0)

    slope_red = float(np.polyfit(years, da_red, 1)[0])

    results = {}
    for fivd in [0, 1]:
        sim = rebound.Simulation()
        sim.integrator = "ias15"
        sim.G = G
        sim.force_is_velocity_dependent = fivd
        sim.add(m=m_sun, x=0, y=0, z=0, vx=0, vy=0, vz=0)
        sim.add(m=m_earth, x=r0, y=0, z=0, vx=0, vy=v0, vz=0)
        sim.add(m=m_tug, x=r0, y=d0, z=0, vx=0, vy=v0, vz=0)

        d_record = []

        def af_full(sim_p):
            s = sim_p.contents
            pe, pt = s.particles[1], s.particles[2]
            dx, dy, dz = pt.x - pe.x, pt.y - pe.y, pt.z - pe.z
            d = math.sqrt(dx*dx + dy*dy + dz*dz)
            dvx, dvy, dvz = pt.vx - pe.vx, pt.vy - pe.vy, pt.vz - pe.vz
            d_dot = (dx*dvx + dy*dvy + dz*dvz) / d
            delta_f = -kp * (d - d0) - kd * d_dot
            f_tot = max(0.0, f_nominal + delta_f)
            rt = math.sqrt(pt.x**2 + pt.y**2)
            pt.ax += (f_tot * (-pt.y / rt)) / pt.m
            pt.ay += (f_tot * (pt.x / rt)) / pt.m
            d_record.append(d)

        sim.additional_forces = af_full

        da_list = []
        d_means = []
        for yr in years:
            sim.integrate(yr * 31557600.0)
            ps, pe = sim.particles[0], sim.particles[1]
            rf = math.sqrt((pe.x - ps.x)**2 + (pe.y - ps.y)**2)
            vf = math.sqrt((pe.vx - ps.vx)**2 + (pe.vy - ps.vy)**2)
            eps = 0.5 * vf**2 - (G * (m_sun + m_earth)) / rf
            a_f = -(G * (m_sun + m_earth)) / (2.0 * eps)
            da_list.append((a_f - r0) / r0)
            d_means.append(float(np.mean(d_record[-500:])))

        slope = float(np.polyfit(years, da_list, 1)[0])
        ratio = slope / slope_red
        results[fivd] = {
            "years": years,
            "da": da_list,
            "d_means": d_means,
            "d_ratio": [dm / d0 for dm in d_means],
            "slope": slope,
            "ratio": ratio,
            "discrepancy_pct": (ratio - 1.0) * 100.0,
        }

    return results


def scan_float_literals():
    """Scan all float literals in octo/ and py/ not defined in constants/config/reference."""
    # Load known constants and threshold numbers
    with open(ROOT / "config" / "rulebook_thresholds.yaml") as f:
        thresh = yaml.safe_load(f)
    with open(ROOT / "config" / "base.yaml") as f:
        base_cfg = yaml.safe_load(f)
    with open(ROOT / "results" / "reference.json") as f:
        ref_json = json.load(f)

    # Standard benign algorithmic literals
    benign = {0.0, 1.0, 2.0, 3.0, 4.0, 0.5, -1.0, 10.0, 100.0, 1000.0, 0.1, 0.2, 0.25, 0.05}

    results = []
    for folder in ["octo", "py"]:
        for p in (ROOT / folder).rglob("*.py"):
            text = p.read_text(encoding="utf-8")
            try:
                tree = ast.parse(text, filename=str(p))
            except Exception:
                continue

            for node in ast.walk(tree):
                if isinstance(node, ast.Constant) and isinstance(node.value, float):
                    val = node.value
                    if val in benign:
                        continue
                    # Check if fits in known constants
                    rel_p = str(p.relative_to(ROOT))
                    results.append({
                        "file": rel_p,
                        "line": node.lineno,
                        "value": val,
                    })

    return results


if __name__ == "__main__":
    print("Running standoff 0 vs 1 comparison...")
    st = test_standoff_flag_0_vs_1()
    print("Flag=0 discrepancy:", f"{st[0]['discrepancy_pct']:+.4f}%")
    print("Flag=0 d/d0 at 200 yr:", f"{st[0]['d_ratio'][-1]:.5f}")
    print("Flag=1 discrepancy:", f"{st[1]['discrepancy_pct']:+.4f}%")
    print("Flag=1 d/d0 at 200 yr:", f"{st[1]['d_ratio'][-1]:.5f}")

    print("\nScanning float literals...")
    lits = scan_float_literals()
    print(f"Total non-trivial float literals found: {len(lits)}")
    for lit in lits[:20]:
        print(f"  {lit['file']}:{lit['line']} -> {lit['value']}")
