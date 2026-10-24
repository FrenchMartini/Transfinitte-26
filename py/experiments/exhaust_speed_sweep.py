"""Exhaust speed parameter sweep from 0.05c to 0.50c.

Audits:
- Trade 1: Constant effective thrust (F_eff = 2.3256e17 N, calibrated for ~9,500 yr arrival).
  Evaluates mass flow mdot, total propellant mass, percentage of Ceres mass (9.4e20 kg),
  relativistic jet power, percentage of solar luminosity, and peak controller effort.
- Trade 2: Constant mass flow rate (mdot = 2.501e9 kg/s).
  Evaluates delivered thrust, relativistic jet power, arrival time to 2.7 AU, and total propellant.
"""

import math
from pathlib import Path
from typing import Any
import rebound
from octo.core import constants
from octo.drivers.propulsion import lorentz_gamma

OUTPUT_DIR = Path(__file__).resolve().parent.parent.parent / "reports"


def run_exhaust_speed_sweep() -> dict[str, Any]:
    speeds = [0.05, 0.10, 0.15, 0.20, 0.25, 0.30, 0.35, 0.40, 0.45, 0.50]
    c = constants.C_LIGHT
    m_earth = constants.M_EARTH
    m_sun = constants.GM_SUN / constants.G
    r1 = 1.0 * constants.AU
    r2 = 2.7 * constants.AU
    v1 = math.sqrt(constants.GM_SUN / r1)
    v2 = math.sqrt(constants.GM_SUN / r2)
    dv_spiral = v1 - v2  # 11,658.3 m/s

    cant_deg = 5.0
    cos_cant = math.cos(math.radians(cant_deg))
    m_tug = 9.4e20
    f_eff_target = 2.325648e17

    results_constant_thrust = []
    results_constant_mdot = []

    for beta in speeds:
        ve = beta * c
        gamma = lorentz_gamma(ve, c)

        # ---------------------------------------------------------------------
        # Trade 1: Constant effective thrust (calibrated 9,487-year arrival)
        # ---------------------------------------------------------------------
        f_cant = f_eff_target
        for _ in range(5):
            f_engine = f_cant / cos_cant
            mdot = f_engine / (gamma * ve)
            p_jet = (gamma - 1.0) * mdot * (c**2)
            f_photon = p_jet / c
            yaw = math.atan(f_photon / f_cant)
            f_cant = f_eff_target / math.cos(yaw)

        f_engine = f_cant / cos_cant
        mdot = f_engine / (gamma * ve)
        p_jet = (gamma - 1.0) * mdot * (c**2)
        t_arr_yr = (dv_spiral / (f_eff_target / m_earth)) / constants.YEAR
        m_prop = mdot * (t_arr_yr * constants.YEAR)
        pct_ceres = (m_prop / m_tug) * 100.0
        pct_lsun = (p_jet / constants.L_SUN) * 100.0

        # Measure 1-year peak station-keeping controller effort in REBOUND
        d0 = math.sqrt(constants.G * m_tug / (f_eff_target / m_earth))
        omega0_sq = 2.0 * constants.G * m_earth / (d0**3)
        kp = 3.0 * m_tug * omega0_sq
        kd = 2.0 * math.sqrt(m_tug * kp)
        f_nom = f_eff_target * (1.0 + m_tug / m_earth)

        sim = rebound.Simulation()
        sim.integrator = "ias15"
        sim.G = constants.G
        sim.add(m=m_sun, x=0, y=0, z=0, vx=0, vy=0, vz=0)
        sim.add(m=m_earth, x=r1, y=0, z=0, vx=0, vy=v1, vz=0)
        sim.add(m=m_tug, x=r1, y=d0, z=0, vx=0, vy=v1, vz=0)

        peak_delta_f = [0.0]

        def af(sim_ptr, peak_f=peak_delta_f, kp_v=kp, kd_v=kd, f_nom_v=f_nom, d0_v=d0):
            s = sim_ptr.contents
            pe, pt = s.particles[1], s.particles[2]
            dx, dy = pt.x - pe.x, pt.y - pe.y
            d = math.sqrt(dx * dx + dy * dy)
            dvx, dvy = pt.vx - pe.vx, pt.vy - pe.vy
            d_dot = (dx * dvx + dy * dvy) / d
            delta_f = abs(-kp_v * (d - d0_v) - kd_v * d_dot)
            if delta_f > peak_f[0]:
                peak_f[0] = delta_f
            f_tot = max(0.0, f_nom_v - kp_v * (d - d0_v) - kd_v * d_dot)
            rt = math.sqrt(pt.x**2 + pt.y**2)
            pt.ax += (f_tot * (-pt.y / rt)) / pt.m
            pt.ay += (f_tot * (pt.x / rt)) / pt.m

        sim.additional_forces = af
        sim.integrate(constants.YEAR)

        results_constant_thrust.append({
            "beta": beta,
            "ve_km_s": ve / 1000.0,
            "gamma": gamma,
            "mdot_kg_s": mdot,
            "propellant_kg": m_prop,
            "pct_ceres": pct_ceres,
            "power_w": p_jet,
            "pct_lsun": pct_lsun,
            "arrival_years": t_arr_yr,
            "peak_controller_force_n": peak_delta_f[0],
        })

        # ---------------------------------------------------------------------
        # Trade 2: Constant mass flow rate (mdot = 2.501e9 kg/s)
        # ---------------------------------------------------------------------
        mdot_fixed = 2.501e9
        f_eng_fixed = mdot_fixed * gamma * ve
        p_jet_fixed = (gamma - 1.0) * mdot_fixed * (c**2)
        f_phot_fixed = p_jet_fixed / c
        f_cant_fixed = f_eng_fixed * cos_cant
        yaw_fixed = math.atan(f_phot_fixed / f_cant_fixed)
        f_eff_fixed = f_cant_fixed * math.cos(yaw_fixed)
        a_eff_fixed = f_eff_fixed / m_earth
        t_arr_fixed_yr = (dv_spiral / a_eff_fixed) / constants.YEAR
        m_prop_fixed = mdot_fixed * (t_arr_fixed_yr * constants.YEAR)

        results_constant_mdot.append({
            "beta": beta,
            "ve_km_s": ve / 1000.0,
            "gamma": gamma,
            "thrust_n": f_eff_fixed,
            "power_w": p_jet_fixed,
            "pct_lsun": (p_jet_fixed / constants.L_SUN) * 100.0,
            "arrival_years": t_arr_fixed_yr,
            "propellant_kg": m_prop_fixed,
        })

    return {
        "constant_thrust": results_constant_thrust,
        "constant_mdot": results_constant_mdot,
    }


if __name__ == "__main__":
    sweep_data = run_exhaust_speed_sweep()
    print("Sweep complete.")
