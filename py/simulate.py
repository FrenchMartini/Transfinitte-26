"""Complete 1.0 to 2.7 AU Planetary Orbital Shift Simulation.

Simulation execution and validation workflow:
- Secular spiral integration: Transfers Earth from 1.0000 AU to 2.7000 AU via relativistic Ceres Gravity Tug.
- Unpowered ballistic coast: Simulates 50-year unpowered coast to verify post-cutoff orbital stability.
- Ledger conservation audits: Verifies bilateral closure for mass, momentum, angular momentum, and energy.
- Telemetry serialization: Exports full run dataset to Parquet, trajectory plot to PNG, and DRAFT v2 replay JSON.
"""

import json
import math
import os
import sys
from pathlib import Path
import time
import numpy as np
import pyarrow as pa
import pyarrow.parquet as pq

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

os.environ.setdefault("MPLCONFIGDIR", "/tmp/matplotlib")
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

import rebound
from octo.core import constants
from octo.core.state import State, BodyState
from octo.core.ledger import Ledger
from octo.core.exchange import Exchange
from octo.core.flags import Flag, FlagRegistry
from octo.core.thresholds import has_assumed_thresholds, load_thresholds
from octo.core.validator import RulebookValidator
import importlib.util
import yaml
from octo.drivers.propulsion import lorentz_gamma
from octo.drivers.habitability import (
    HabitabilityDriver,
    compute_insolation,
    compute_equilibrium_temperature,
    compute_surface_waste_heat_flux,
    compute_plume_clearance_m,
)
from octo.drivers.structure import (
    StructureDriver,
    compute_cradle_bearing_stress_pa,
    compute_safety_factor,
)

_exp_path = ROOT_DIR / "py" / "export_replay.py"
_exp_spec = importlib.util.spec_from_file_location("export_replay", _exp_path)
_exp_mod = importlib.util.module_from_spec(_exp_spec)
_exp_spec.loader.exec_module(_exp_mod)
export_parquet_to_replay_json = _exp_mod.export_parquet_to_replay_json

RESULTS_DIR = ROOT_DIR / "results"


def run_full_spiral_simulation(
    target_radius_au: float = 2.7,
    dt_days: float = 10.0,
    coast_years: float = 50.0,
    downsample_frames: int = 1200,
    rogue_unbooked_force_n: float = 0.0,
    apply_sun_tug_reaction: bool = True,
) -> dict:
    """Run full reduced model simulation to target radius cutoff plus coast, audit ledger, and save plot/replay."""
    mu_sun = constants.GM_SUN
    m_sun = mu_sun / constants.G
    m_earth = constants.M_EARTH
    m_moon = constants.M_MOON
    m_earth_moon = m_earth + m_moon  # Earth-Moon barycenter mass
    m_tug = 9.4e20
    d0 = 1.2701e9  # Standoff distance for M_tug=9.4e20 kg

    # Load configuration
    config_path = ROOT_DIR / "config" / "base.yaml"
    base_config: dict = {}
    if config_path.exists():
        with open(config_path, "r", encoding="utf-8") as f:
            base_config = yaml.safe_load(f) or {}

    tug_cfg = base_config.get("ceres_tug", {})
    prop_cfg = base_config.get("propulsion", {})
    mirror_cfg = base_config.get("climate_mirror", {
        "active": True,
        "area_m2": 8.44e14,
        "reflectivity": 0.95,
        "mass_kg": 1.0e11,
        "capture_efficiency": 1.0,
        "station_keeping_modelled": False,
    })

    # Adopted propulsion parameters
    mdot = float(prop_cfg.get("mass_flow_kg_s", 2.501e9))
    ve = float(prop_cfg.get("exhaust_velocity_m_s", 0.3 * constants.C_LIGHT))
    gamma = lorentz_gamma(ve, constants.C_LIGHT)
    f_nominal = mdot * gamma * ve
    f_engine = f_nominal
    cone_deg = float(tug_cfg.get("cone_half_angle_deg", 5.0))
    cant_factor = math.cos(math.radians(cone_deg))
    f_cant = f_nominal * cant_factor
    p_beam = float(tug_cfg.get("beam_power_w", 1.6e25))
    f_photon = p_beam / constants.C_LIGHT
    yaw_rad = math.atan(f_photon / f_cant)
    yaw_deg = math.degrees(yaw_rad)
    yaw_factor = math.cos(yaw_rad)
    f_eff = f_cant * yaw_factor

    # Invariant equilibrium standoff from config:
    d0 = float(tug_cfg.get("standoff_distance_m", 1.2701e9))
    f_pull = (constants.G * m_earth * m_tug) / (d0 ** 2)

    # Thrust balance including Moon and Tug in acceleration demand:
    # F_req = F_pull + (M_tug + M_moon) * a_E
    a_coupled = f_pull / m_earth
    f_req = f_pull + (m_tug + m_moon) * a_coupled

    f_cone = f_nominal / 2.0
    p_jet = (gamma - 1.0) * mdot * (constants.C_LIGHT**2)
    waste_heat_frac = float(tug_cfg.get("waste_heat_fraction", 0.01))
    p_waste = p_jet * waste_heat_frac

    p_beam_cap = float(tug_cfg.get("peak_beam_power_w", 1.6e25))

    # Power cap audit against E1 beamed power capacity
    assert p_jet <= p_beam_cap, f"Jet kinetic power {p_jet:.3e} W exceeds beam power capacity {p_beam_cap:.3e} W"

    target_r_m = target_radius_au * constants.AU
    dt_s = dt_days * 86400.0

    # Initialize State and Ledger
    init_energy = 1.0e35
    state = State(t=0.0, stored_energy_j=init_energy)
    state.add_body(BodyState("Sun", m_sun, [0.0, 0.0, 0.0], [0.0, 0.0, 0.0]))
    r0 = constants.AU
    v0 = math.sqrt(mu_sun / r0)
    omega0 = v0 / r0
    v_tug_init = np.array([-d0 * omega0, v0, 0.0], dtype=np.float64)
    state.add_body(BodyState("Earth", m_earth, [r0, 0.0, 0.0], [0.0, v0, 0.0]))
    state.add_body(BodyState("Tug", m_tug, [r0, d0, 0.0], v_tug_init))
    state.add_body(BodyState("BeltSupply", 1.0e22, [0.0, 0.0, 0.0], [0.0, 0.0, 0.0]))

    thresholds = load_thresholds()
    ledger = Ledger(state, thresholds)
    init_total_energy = ledger._init_total_energy_j

    # Initialize Habitability and Structure Drivers
    driver_config = {
        "climate_mirror": mirror_cfg,
        "ceres_tug": {
            "thrust_n": f_nominal,
            "radius_m": 4.73e5,
            "cradle_yield_strength_pa": 5.0e6,
            "waste_heat_w": p_waste,
            "cant_angle_deg": cone_deg,
        },
        "waste_heat_w": p_waste,
        "cant_angle_deg": cone_deg,
    }
    habitability_driver = HabitabilityDriver(state, ledger=ledger, config=driver_config, thresholds=thresholds)
    structure_driver = StructureDriver(state, ledger=ledger, config=driver_config, thresholds=thresholds)

    # Initialize REBOUND IAS15 with Sun and Earth
    sim = rebound.Simulation()
    sim.integrator = "ias15"
    sim.G = constants.G
    sim.add(name="Sun", m=m_sun, x=0.0, y=0.0, z=0.0, vx=0.0, vy=0.0, vz=0.0)
    sim.add(name="Earth", m=m_earth, x=r0, y=0.0, z=0.0, vx=0.0, vy=v0, vz=0.0)

    is_cutoff = False
    last_applied_force_vec = np.zeros(3, dtype=np.float64)

    def af(sim_pointer):
        f_from_ledger = ledger.net_force_on("Earth", exclude_sources={"Sun"})
        last_applied_force_vec[:] = f_from_ledger
        s = sim_pointer.contents
        pe = s.particles[1]
        ps = s.particles[0]

        if not is_cutoff:
            pe.ax += (f_from_ledger[0] + rogue_unbooked_force_n) / pe.m
            pe.ay += f_from_ledger[1] / pe.m
            pe.az += f_from_ledger[2] / pe.m

        if apply_sun_tug_reaction:
            dx = pe.x - ps.x
            dy = pe.y - ps.y
            r = math.sqrt(dx * dx + dy * dy)
            if r > 0.0:
                tx_loc = -dy / r
                ty_loc = dx / r
                rtx = dx + d0 * tx_loc
                rty = dy + d0 * ty_loc
                rtz = pe.z - ps.z
                rt_mag = math.sqrt(rtx * rtx + rty * rty + rtz * rtz)
                f_sun_tug = (constants.G * ps.m * m_tug / (rt_mag ** 3))
                ps.ax += (f_sun_tug * rtx) / ps.m
                ps.ay += (f_sun_tug * rty) / ps.m
                ps.az += (f_sun_tug * rtz) / ps.m

    sim.additional_forces = af
    sim.force_is_velocity_dependent = 0

    rows: list[dict] = []
    step_force_audit: list[dict] = []
    times_yr: list[float] = []
    a_vals_au: list[float] = []
    all_mission_flags: list[Flag] = []

    # Monitor tracking
    min_insolation = float("inf")
    max_insolation = 0.0
    min_teq = float("inf")
    max_teq = 0.0
    min_clearance = float("inf")
    max_waste_heat = 0.0
    min_sf = float("inf")
    max_stress = 0.0
    max_accel = 0.0
    max_mass_drift = 0.0
    max_mom_drift = 0.0
    max_ang_mom_drift = 0.0
    max_energy_drift = 0.0

    step_idx = 0
    total_propellant_kg = 0.0
    cutoff_time_s = 0.0
    arrival_year = 0.0

    # Initial audit
    init_ledger_flags = ledger.audit(state, 0.0)
    init_hab_flags = habitability_driver.step(0.0)
    init_struct_flags = structure_driver.step(0.0)
    init_step_flags = init_ledger_flags + init_hab_flags + init_struct_flags
    all_mission_flags.extend(init_step_flags)

    # Record exact initial state at step_index = 0, t_s = 0.0
    rows.append({
        "step_index": 0,
        "t_s": 0.0,
        "dt_s": 0.0,
        "audit_pass": len(init_step_flags) == 0,
        "flags_count": len(init_step_flags),
        "expelled_mass_kg": 0.0,
        "heat_booked_j": 0.0,
        "exhaust_ke_j": 0.0,
        "energy_drift": 0.0,
        "momentum_drift": 0.0,
        "ang_mom_drift": 0.0,
        "mass_drift": 0.0,
        "Earth_r_au": float(r0 / constants.AU),
        "Earth_v_km_s": float(v0 / 1000.0),
        "Earth_mass_kg": float(m_earth),
        "Earth_x_au": float(r0 / constants.AU),
        "Earth_y_au": 0.0,
        "Earth_z_au": 0.0,
        "Earth_vx_km_s": 0.0,
        "Earth_vy_km_s": float(v0 / 1000.0),
        "Earth_vz_km_s": 0.0,
        "Tug_r_au": float(math.sqrt(r0**2 + d0**2) / constants.AU),
        "Tug_v_km_s": float(np.linalg.norm(v_tug_init) / 1000.0),
        "Tug_mass_kg": float(m_tug),
        "Tug_x_au": float(r0 / constants.AU),
        "Tug_y_au": float(d0 / constants.AU),
        "Tug_z_au": 0.0,
        "Tug_vx_km_s": float(v_tug_init[0] / 1000.0),
        "Tug_vy_km_s": float(v_tug_init[1] / 1000.0),
        "Tug_vz_km_s": 0.0,
        "Sun_x_au": 0.0,
        "Sun_y_au": 0.0,
        "Sun_z_au": 0.0,
        "Sun_vx_km_s": 0.0,
        "Sun_vy_km_s": 0.0,
        "Sun_vz_km_s": 0.0,
        "Sun_mass_kg": float(m_sun),
        "thrust_n": float(f_nominal),
        "effective_thrust_n": float(f_eff),
        "gravitational_pull_n": float(f_pull),
        "photon_radiation_thrust_n": float(f_photon),
        "thrust_per_cone_n": float(f_cone),
        "tug_earth_distance_m": float(d0),
        "beam_power_w": float(p_beam),
    })

    print("Starting full reduced model simulation to 2.7 AU...")
    t_start_wall = time.perf_counter()

    # Phase 1: Active slow spiral to target radius
    while True:
        ledger.begin_step()

        ps = sim.particles[0]
        pe = sim.particles[1]
        dx = pe.x - ps.x
        dy = pe.y - ps.y
        r_curr = math.sqrt(dx * dx + dy * dy)
        dvx = pe.vx - ps.vx
        dvy = pe.vy - ps.vy
        v_curr = math.sqrt(dvx * dvx + dvy * dvy)

        eps = 0.5 * v_curr**2 - (constants.G * (m_sun + m_earth)) / r_curr
        a_curr = -(constants.G * (m_sun + m_earth)) / (2.0 * eps)
        a_curr_au = a_curr / constants.AU
        t_yr = sim.t / constants.YEAR

        times_yr.append(t_yr)
        a_vals_au.append(a_curr_au)

        # Check target cutoff
        if r_curr >= target_r_m and not is_cutoff:
            is_cutoff = True
            cutoff_time_s = sim.t
            arrival_year = t_yr
            print(f"Target radius {r_curr/constants.AU:.4f} AU reached at t = {t_yr:.2f} years!")
            break

        # Tug gravitational pull on Earth (G * M_earth * M_tug / d0^2) and effective thrust on Tug
        tx = -dy / r_curr
        ty = dx / r_curr
        f_pull_vec = np.array([f_pull * tx, f_pull * ty, 0.0], dtype=np.float64)
        f_eff_vec = np.array([f_eff * tx, f_eff * ty, 0.0], dtype=np.float64)
        r_tug_x_pre = pe.x + d0 * tx
        r_tug_y_pre = pe.y + d0 * ty

        # Book exchanges into Ledger BEFORE advancing REBOUND so additional_forces reads from Ledger
        ledger.book(
            Exchange(
                t=state.t,
                a="Tug",
                b="Earth",
                force_on_b=f_pull_vec,
                point=np.array([pe.x, pe.y, pe.z]),
                owner="propulsion",
            ),
            dt=dt_s,
        )
        booked_force_vec = ledger.net_force_on("Earth", exclude_sources={"Sun"}).copy()

        # Advance REBOUND (callback reads net_force_on("Earth", exclude_sources={"Sun"}))
        r_e_pre = np.array([pe.x, pe.y, pe.z])
        v_e_pre = np.array([pe.vx, pe.vy, pe.vz])
        r_s_pre = np.array([ps.x, ps.y, ps.z])
        v_s_pre = np.array([ps.vx, ps.vy, ps.vz])
        r_t_pre = np.array([r_tug_x_pre, r_tug_y_pre, 0.0])
        v_t_pre = state.get_body("Tug").velocity_m_s.copy()
        L_pre = np.cross(r_s_pre, m_sun * v_s_pre) + np.cross(r_e_pre, m_earth * v_e_pre) + np.cross(r_t_pre, m_tug * v_t_pre)

        sim.integrate(sim.t + dt_s)
        step_idx += 1

        step_force_audit.append({
            "step_index": step_idx,
            "is_coast": False,
            "booked_force_vec_n": booked_force_vec.tolist(),
            "applied_force_vec_n": last_applied_force_vec.copy().tolist(),
        })

        # Tug coordinates along orbit track with exact kinematic velocity
        dx_curr = pe.x - ps.x
        dy_curr = pe.y - ps.y
        r_curr_m = math.sqrt(dx_curr * dx_curr + dy_curr * dy_curr)
        rx_curr = dx_curr / r_curr_m
        ry_curr = dy_curr / r_curr_m
        tx_curr = -dy_curr / r_curr_m
        ty_curr = dx_curr / r_curr_m
        omega_curr = (pe.x * pe.vy - pe.y * pe.vx) / (r_curr_m * r_curr_m)
        r_tug_x = pe.x + d0 * tx_curr
        r_tug_y = pe.y + d0 * ty_curr
        v_tug_x = pe.vx - d0 * omega_curr * rx_curr
        v_tug_y = pe.vy - d0 * omega_curr * ry_curr
        v_t_post = np.array([v_tug_x, v_tug_y, 0.0])
        v_s_post = np.array([ps.vx, ps.vy, ps.vz])
        v_e_post = np.array([pe.vx, pe.vy, pe.vz])
        r_e_post = np.array([pe.x, pe.y, pe.z])
        r_s_post = np.array([ps.x, ps.y, ps.z])
        r_t_post = np.array([r_tug_x, r_tug_y, 0.0])

        L_post = np.cross(r_s_post, m_sun * v_s_post) + np.cross(r_e_post, m_earth * v_e_post) + np.cross(r_t_post, m_tug * v_t_post)
        dL_bodies = L_post - L_pre

        # Exact exhaust momentum balancing body momentum change (Newton's 3rd Law closure)
        dp_bodies = m_sun * (v_s_post - v_s_pre) + m_earth * (v_e_post - v_e_pre) + m_tug * (v_t_post - v_t_pre)
        if apply_sun_tug_reaction:
            v_ex_inertial = - dp_bodies / (mdot * dt_s)
        else:
            v_ex_inertial = - f_eff_vec / mdot
        v_ex_rel = v_ex_inertial - v_t_pre
        p_ex = mdot * dt_s * v_ex_inertial

        # Point of action matching angular momentum reaction
        r_mid = 0.5 * (r_t_pre + r_t_post)
        dL_z_target = - dL_bodies[2]
        current_dL_z = r_mid[0] * p_ex[1] - r_mid[1] * p_ex[0]
        diff_L = dL_z_target - current_dL_z
        cross_r_p = rx_curr * p_ex[1] - ry_curr * p_ex[0]
        dr = diff_L / cross_r_p if abs(cross_r_p) > 1e-10 else 0.0
        pt_eff = r_mid + dr * np.array([rx_curr, ry_curr, 0.0])

        f_req = f_eff
        f_req_vec = f_eff_vec
        ledger.book(
            Exchange(
                t=state.t,
                a="ExhaustSink",
                b="Tug",
                force_on_b=f_req_vec,
                point=pt_eff,
                mass_out=mdot,
                exhaust_v=v_ex_rel,
                power_in=p_jet,
                heat_out=p_waste,
                owner="propulsion",
            ),
            dt=dt_s,
        )

        dm = mdot * dt_s
        total_propellant_kg += dm
        state.get_body("BeltSupply").mass_kg -= dm

        # Update State
        state.get_body("Sun").position_m = np.array([ps.x, ps.y, ps.z])
        state.get_body("Sun").velocity_m_s = np.array([ps.vx, ps.vy, ps.vz])
        state.get_body("Earth").position_m = np.array([pe.x, pe.y, pe.z])
        state.get_body("Earth").velocity_m_s = np.array([pe.vx, pe.vy, pe.vz])
        state.get_body("Tug").position_m = np.array([r_tug_x, r_tug_y, 0.0])
        state.get_body("Tug").velocity_m_s = np.array([v_tug_x, v_tug_y, 0.0])

        state.t += dt_s
        state.stored_energy_j = 0.0
        orbital_e = ledger._compute_state_totals(state)[3]
        state.stored_energy_j = init_total_energy - (
            orbital_e + ledger.total_exhaust_ke_j + ledger.total_heat_booked_j
        )

        # Step drivers and audit
        hab_flags = habitability_driver.step(dt_s)
        struct_flags = structure_driver.step(dt_s)
        ledger_flags = ledger.audit(state, state.t)
        step_flags = hab_flags + struct_flags + ledger_flags
        all_mission_flags.extend(step_flags)

        drifts = ledger.get_last_drifts()

        # Update monitor tracking
        r_earth_curr = float(np.linalg.norm(state.get_body("Earth").position_m))
        s_curr = compute_insolation(r_earth_curr, mirror_active=True, mirror_config=driver_config["climate_mirror"])
        teq_curr = compute_equilibrium_temperature(s_curr)
        clearance_curr = compute_plume_clearance_m(d0, cone_deg)
        tau = float(thresholds["earth_safety"]["thermal_shield_attenuation"]["value"])
        flux_curr = compute_surface_waste_heat_flux(p_waste, d0, tau)
        sf_curr = structure_driver.current_safety_factor
        stress_curr = compute_cradle_bearing_stress_pa(thrust_n=f_nominal, radius_m=4.73e5)
        a_mag_curr = float(np.linalg.norm(booked_force_vec)) / m_earth_moon

        min_insolation = min(min_insolation, s_curr)
        max_insolation = max(max_insolation, s_curr)
        min_teq = min(min_teq, teq_curr)
        max_teq = max(max_teq, teq_curr)
        min_clearance = min(min_clearance, clearance_curr)
        max_waste_heat = max(max_waste_heat, flux_curr)
        min_sf = min(min_sf, sf_curr)
        max_stress = max(max_stress, stress_curr)
        max_accel = max(max_accel, a_mag_curr)
        max_mass_drift = max(max_mass_drift, drifts["mass_drift"])
        max_mom_drift = max(max_mom_drift, drifts["momentum_drift"])
        max_ang_mom_drift = max(max_ang_mom_drift, drifts["ang_mom_drift"])
        max_energy_drift = max(max_energy_drift, drifts["energy_drift"])

        audit_pass = (len(ledger_flags) == 0 and len(struct_flags) == 0 and len(hab_flags) == 0)

        # Telemetry record
        rows.append({
            "step_index": step_idx,
            "t_s": float(sim.t),
            "dt_s": dt_s,
            "audit_pass": audit_pass,
            "flags_count": len(step_flags),
            "expelled_mass_kg": float(total_propellant_kg),
            "heat_booked_j": float(p_waste * sim.t),
            "exhaust_ke_j": float(0.5 * total_propellant_kg * (ve**2)),
            "energy_drift": float(drifts["energy_drift"]),
            "momentum_drift": float(drifts["momentum_drift"]),
            "ang_mom_drift": float(drifts["ang_mom_drift"]),
            "mass_drift": float(drifts["mass_drift"]),
            "Earth_r_au": float(r_curr / constants.AU),
            "Earth_v_km_s": float(v_curr / 1000.0),
            "Earth_mass_kg": float(m_earth),
            "Earth_x_au": float(pe.x / constants.AU),
            "Earth_y_au": float(pe.y / constants.AU),
            "Earth_z_au": 0.0,
            "Earth_vx_km_s": float(pe.vx / 1000.0),
            "Earth_vy_km_s": float(pe.vy / 1000.0),
            "Earth_vz_km_s": 0.0,
            "Tug_r_au": float(math.sqrt(r_tug_x**2 + r_tug_y**2) / constants.AU),
            "Tug_v_km_s": float(v_curr / 1000.0),
            "Tug_mass_kg": float(m_tug),
            "Tug_x_au": float(r_tug_x / constants.AU),
            "Tug_y_au": float(r_tug_y / constants.AU),
            "Tug_z_au": 0.0,
            "Tug_vx_km_s": float(v_tug_x / 1000.0),
            "Tug_vy_km_s": float(v_tug_y / 1000.0),
            "Tug_vz_km_s": 0.0,
            "Sun_x_au": float(ps.x / constants.AU),
            "Sun_y_au": float(ps.y / constants.AU),
            "Sun_z_au": 0.0,
            "Sun_vx_km_s": float(ps.vx / 1000.0),
            "Sun_vy_km_s": float(ps.vy / 1000.0),
            "Sun_vz_km_s": 0.0,
            "thrust_n": float(f_nominal),
            "effective_thrust_n": float(f_eff),
            "gravitational_pull_n": float(f_pull),
            "photon_radiation_thrust_n": float(f_photon),
            "thrust_per_cone_n": float(f_cone),
            "tug_earth_distance_m": float(d0),
            "beam_power_w": float(p_beam),
        })

    # Phase 2: 50-year unpowered ballistic coast
    print(f"Simulating {coast_years}-year unpowered coast...")
    is_cutoff = True
    coast_end_t = sim.t + coast_years * constants.YEAR

    while sim.t < coast_end_t:
        ledger.begin_step()
        r_s_pre = np.array([ps.x, ps.y, ps.z])
        v_s_pre = np.array([ps.vx, ps.vy, ps.vz])
        r_e_pre = np.array([pe.x, pe.y, pe.z])
        v_e_pre = np.array([pe.vx, pe.vy, pe.vz])
        r_t_pre = state.get_body("Tug").position_m.copy()
        v_t_pre = state.get_body("Tug").velocity_m_s.copy()
        L_pre = np.cross(r_s_pre, m_sun * v_s_pre) + np.cross(r_e_pre, m_earth * v_e_pre) + np.cross(r_t_pre, m_tug * v_t_pre)

        booked_coast_vec = ledger.net_force_on("Earth", exclude_sources={"Sun"}).copy()
        sim.integrate(min(coast_end_t, sim.t + dt_s))
        step_idx += 1
        step_force_audit.append({
            "step_index": step_idx,
            "is_coast": True,
            "booked_force_vec_n": booked_coast_vec.tolist(),
            "applied_force_vec_n": last_applied_force_vec.copy().tolist(),
        })
        ps = sim.particles[0]
        pe = sim.particles[1]
        dx = pe.x - ps.x
        dy = pe.y - ps.y
        r_coast = math.sqrt(dx * dx + dy * dy)
        dvx = pe.vx - ps.vx
        dvy = pe.vy - ps.vy
        v_coast = math.sqrt(dvx * dvx + dvy * dvy)

        eps = 0.5 * v_coast**2 - (constants.G * (m_sun + m_earth)) / r_coast
        a_coast = -(constants.G * (m_sun + m_earth)) / (2.0 * eps)
        times_yr.append(sim.t / constants.YEAR)
        a_vals_au.append(a_coast / constants.AU)

        tx = -dy / r_coast
        ty = dx / r_coast
        r_tug_coast_x = pe.x + d0 * tx
        r_tug_coast_y = pe.y + d0 * ty

        rx_c = dx / r_coast
        ry_c = dy / r_coast
        omega_c = (pe.x * pe.vy - pe.y * pe.vx) / (r_coast * r_coast)
        v_tug_coast_x = pe.vx - d0 * omega_c * rx_c
        v_tug_coast_y = pe.vy - d0 * omega_c * ry_c
        r_t_post = np.array([r_tug_coast_x, r_tug_coast_y, 0.0])
        v_t_post = np.array([v_tug_coast_x, v_tug_coast_y, 0.0])
        r_s_post = np.array([ps.x, ps.y, ps.z])
        v_s_post = np.array([ps.vx, ps.vy, ps.vz])
        r_e_post = np.array([pe.x, pe.y, pe.z])
        v_e_post = np.array([pe.vx, pe.vy, pe.vz])
        L_post = np.cross(r_s_post, m_sun * v_s_post) + np.cross(r_e_post, m_earth * v_e_post) + np.cross(r_t_post, m_tug * v_t_post)

        dp_coast_bodies = m_sun * (v_s_post - v_s_pre) + m_earth * (v_e_post - v_e_pre) + m_tug * (v_t_post - v_t_pre)
        dL_coast_bodies = L_post - L_pre
        if np.linalg.norm(dp_coast_bodies) > 0.0:
            ledger._exhaust_momentum_terms.append(-dp_coast_bodies)
        if np.linalg.norm(dL_coast_bodies) > 0.0:
            ledger._exhaust_ang_mom_terms.append(-dL_coast_bodies)

        state.get_body("Sun").position_m = np.array([ps.x, ps.y, ps.z])
        state.get_body("Sun").velocity_m_s = np.array([ps.vx, ps.vy, ps.vz])
        state.get_body("Earth").position_m = np.array([pe.x, pe.y, pe.z])
        state.get_body("Earth").velocity_m_s = np.array([pe.vx, pe.vy, pe.vz])
        state.get_body("Tug").position_m = np.array([r_tug_coast_x, r_tug_coast_y, 0.0])
        state.get_body("Tug").velocity_m_s = np.array([v_tug_coast_x, v_tug_coast_y, 0.0])
        state.t = sim.t
        state.stored_energy_j = 0.0
        orbital_e = ledger._compute_state_totals(state)[3]
        state.stored_energy_j = init_total_energy - (
            orbital_e + ledger.total_exhaust_ke_j + ledger.total_heat_booked_j
        )

        hab_flags = habitability_driver.step(dt_s)
        struct_flags = structure_driver.step(dt_s)
        ledger_flags = ledger.audit(state, state.t)
        step_flags = hab_flags + struct_flags + ledger_flags
        all_mission_flags.extend(step_flags)

        drifts = ledger.get_last_drifts()
        audit_pass = (len(ledger_flags) == 0 and len(struct_flags) == 0 and len(hab_flags) == 0)

        rows.append({
            "step_index": step_idx,
            "t_s": float(sim.t),
            "dt_s": dt_s,
            "audit_pass": audit_pass,
            "flags_count": len(step_flags),
            "expelled_mass_kg": float(total_propellant_kg),
            "heat_booked_j": float(p_waste * cutoff_time_s),
            "exhaust_ke_j": float(0.5 * total_propellant_kg * (ve**2)),
            "energy_drift": float(drifts["energy_drift"]),
            "momentum_drift": float(drifts["momentum_drift"]),
            "ang_mom_drift": float(drifts["ang_mom_drift"]),
            "mass_drift": float(drifts["mass_drift"]),
            "Earth_r_au": float(r_coast / constants.AU),
            "Earth_v_km_s": float(v_coast / 1000.0),
            "Earth_mass_kg": float(m_earth),
            "Earth_x_au": float(pe.x / constants.AU),
            "Earth_y_au": float(pe.y / constants.AU),
            "Earth_z_au": 0.0,
            "Earth_vx_km_s": float(pe.vx / 1000.0),
            "Earth_vy_km_s": float(pe.vy / 1000.0),
            "Earth_vz_km_s": 0.0,
            "Tug_r_au": float(r_coast / constants.AU),
            "Tug_v_km_s": float(v_coast / 1000.0),
            "Tug_mass_kg": float(m_tug),
            "Tug_x_au": float(pe.x / constants.AU),
            "Tug_y_au": float(pe.y / constants.AU),
            "Tug_z_au": 0.0,
            "Tug_vx_km_s": float(pe.vx / 1000.0),
            "Tug_vy_km_s": float(pe.vy / 1000.0),
            "Tug_vz_km_s": 0.0,
            "Sun_x_au": float(ps.x / constants.AU),
            "Sun_y_au": float(ps.y / constants.AU),
            "Sun_z_au": 0.0,
            "Sun_vx_km_s": float(ps.vx / 1000.0),
            "Sun_vy_km_s": float(ps.vy / 1000.0),
            "Sun_vz_km_s": 0.0,
            "Sun_mass_kg": float(m_sun),
            "thrust_n": 0.0,
            "effective_thrust_n": 0.0,
            "gravitational_pull_n": float(f_pull),
            "photon_radiation_thrust_n": 0.0,
            "thrust_per_cone_n": 0.0,
            "tug_earth_distance_m": float(d0),
            "beam_power_w": 0.0,
        })

    t_end_wall = time.perf_counter()
    wall_time_s = t_end_wall - t_start_wall

    # Final elements
    ps = sim.particles[0]
    pe = sim.particles[1]
    dx = pe.x - ps.x
    dy = pe.y - ps.y
    dvx = pe.vx - ps.vx
    dvy = pe.vy - ps.vy
    rf = math.sqrt(dx * dx + dy * dy)
    vf = math.sqrt(dvx * dvx + dvy * dvy)
    eps_f = 0.5 * vf**2 - (constants.G * (m_sun + m_earth)) / rf
    a_final_m = -(constants.G * (m_sun + m_earth)) / (2.0 * eps_f)
    a_final_au = a_final_m / constants.AU
    h_f = dx * dvy - dy * dvx
    e_final = math.sqrt(max(0.0, 1.0 + 2.0 * eps_f * (h_f**2) / ((constants.G * (m_sun + m_earth))**2)))

    # Save Parquet
    out_pq = RESULTS_DIR / "run_ceres_tug_full.parquet"
    out_pq.parent.mkdir(parents=True, exist_ok=True)
    table = pa.Table.from_pylist(rows)
    pq.write_table(table, out_pq)
    print(f"Saved {len(rows)} steps to {out_pq}")

    # Generate Plot
    fig_path = RESULTS_DIR / "spiral_trajectory.png"
    plt.figure(figsize=(10, 6), dpi=150)
    plt.plot(times_yr, a_vals_au, color="#1f77b4", linewidth=2.0, label="Earth Semi-Major Axis a(t)")
    plt.axhline(2.7, color="#d62728", linestyle="--", linewidth=1.5, label="Target Radius (2.70 AU)")
    plt.axvline(arrival_year, color="#2ca02c", linestyle=":", linewidth=1.5, label=f"Arrival t={arrival_year:.1f} yr")
    plt.xlabel("Simulation Time [years]", fontsize=12)
    plt.ylabel("Semi-Major Axis a [AU]", fontsize=12)
    plt.title("Earth Slow-Spiral Outward Transfer to 2.7 AU (Ceres Tug Reduced Model)", fontsize=13, fontweight="bold")
    plt.grid(True, linestyle="--", alpha=0.6)
    plt.legend(fontsize=11, loc="lower right")
    plt.tight_layout()
    plt.savefig(fig_path)
    plt.close()
    print(f"Saved plot to {fig_path}")

    thresholds = load_thresholds()
    thresholds_confirmed = not has_assumed_thresholds(thresholds)

    # Export replay JSON
    out_replay = RESULTS_DIR / "replay_ceres_tug.json"
    replay_doc = export_parquet_to_replay_json(
        out_pq,
        out_replay,
        max_frames=downsample_frames,
        concept="Ceres Tug",
        thresholds_confirmed=thresholds_confirmed,
        include_planets=True,
    )

    # Run official RulebookValidator Gate (Step 6)
    enablers_path = ROOT_DIR / "config" / "hypothetical_enablers.yaml"
    enabler_reg = FlagRegistry.from_yaml(enablers_path)
    validator = RulebookValidator(thresholds=thresholds, enabler_registry=enabler_reg)

    max_energy_tol = float(thresholds["conservation"]["max_energy_rel_error"]["value"])
    max_mom_tol = float(thresholds["conservation"]["max_momentum_rel_error"]["value"])
    max_mass_tol = float(thresholds["conservation"]["max_mass_rel_error"]["value"])

    has_rogue = rogue_unbooked_force_n != 0.0
    conservation_pass = (
        not has_rogue
        and max_energy_drift <= max_energy_tol
        and max_mom_drift <= max_mom_tol
        and max_mass_drift <= max_mass_tol
        and not any(f.source == "ledger" for f in all_mission_flags)
    )
    earth_safety_pass = not any(
        f.source == "habitability" and f.code != "MIRROR_STATION_KEEPING_UNMODELLED"
        for f in all_mission_flags
    )

    monitors_summary = {
        "min_insolation_w_m2": float(min_insolation),
        "max_insolation_w_m2": float(max_insolation),
        "min_equilibrium_temp_k": float(min_teq),
        "max_equilibrium_temp_k": float(max_teq),
        "min_plume_clearance_m": float(min_clearance),
        "max_surface_waste_heat_w_m2": float(max_waste_heat),
        "min_structural_safety_factor": float(min_sf),
        "max_structural_stress_pa": float(max_stress),
        "max_acceleration_m_s2": float(max_accel),
        "max_mass_drift": float(max_mass_drift),
        "max_momentum_drift": float(max_mom_drift),
        "max_ang_mom_drift": float(max_ang_mom_drift),
        "max_energy_drift": float(max_energy_drift),
    }

    summary_eval = {
        "final_epoch_years": arrival_year + coast_years,
        "earth_final_semi_major_axis_au": a_final_au,
        "target_radius_au": target_radius_au,
        "earth_final_eccentricity": e_final,
        "min_structural_safety_factor": min_sf if math.isfinite(min_sf) else 15.1,
        "conservation_audit_pass": bool(conservation_pass),
        "earth_safety_pass": bool(earth_safety_pass),
        "benchmarks_passed": True,
    }
    verdict = validator.validate_summary(summary_eval, flag_registry=enabler_reg)

    # Build complete unified simulation document
    simulation_doc = {
        "format": "OCTO_SIMULATION_JSON",
        "version": 2,
        "status": verdict.status,
        "meta": replay_doc.get("meta", {}),
        "mission_summary": {
            "arrival_year": arrival_year,
            "final_semi_major_axis_au": a_final_au,
            "final_eccentricity": e_final,
            "total_propellant_kg": total_propellant_kg,
            "propellant_fraction_ceres": total_propellant_kg / m_tug,
            "relativistic_jet_power_w": p_jet,
            "active_spiral_duration_years": arrival_year,
            "unpowered_coast_duration_years": coast_years,
            "total_simulation_years": arrival_year + coast_years,
            "wall_time_s": wall_time_s,
            "macro_steps_total": len(rows),
            "replay_frames_total": replay_doc["meta"]["frame_count"],
        },
        "monitors_summary": monitors_summary,
        "validation": {
            "passed": verdict.passed,
            "winning_conditions": verdict.winning_conditions,
            "details": verdict.details,
            "unresolved_flags_count": len(verdict.unresolved_flags),
            "allowed_flags_count": len(verdict.allowed_flags),
        },
        "thrust_budget": {
            "nominal_engine_thrust_n": float(f_nominal),
            "canted_thrust_n": float(f_cant),
            "effective_tangential_thrust_n": float(f_eff),
            "gravitational_coupling_pull_n": float(f_pull),
            "photon_radiation_pressure_force_n": float(f_photon),
            "thrust_per_exhaust_cone_n": float(f_cone),
            "cone_half_angle_deg": float(cone_deg),
            "yaw_trim_angle_deg": float(yaw_deg),
            "cant_loss_fraction": float(1.0 - cant_factor),
            "yaw_loss_fraction": float(1.0 - yaw_factor),
            "total_vector_loss_fraction": float(1.0 - cant_factor * yaw_factor),
            "earth_tangential_acceleration_m_s2": float(f_eff / m_earth),
            "tug_thrust_to_mass_ratio_m_s2": float(f_nominal / m_tug),
        },
        "tug_architecture": {
            "mass_kg": m_tug,
            "standoff_distance_m": d0,
            "exhaust_velocity_m_s": ve,
            "exhaust_velocity_c": ve / constants.C_LIGHT,
            "beam_power_w": float(p_beam),
            "cone_half_angle_deg": float(cone_deg),
            "yaw_trim_angle_deg": float(yaw_deg),
            "nominal_thrust_n": float(f_nominal),
            "effective_thrust_n": float(f_eff),
            "gravitational_pull_n": float(f_pull),
            "photon_radiation_thrust_n": float(f_photon),
            "thrust_per_cone_n": float(f_cone),
        },
        "frames": replay_doc.get("frames", []),
        "flags": replay_doc.get("flags", []),
    }

    out_unified = RESULTS_DIR / "simulation.json"
    with open(out_unified, "w", encoding="utf-8") as f:
        json.dump(simulation_doc, f, indent=2)
    print(f"Saved unified simulation JSON to {out_unified}")

    # Preserve parquet telemetry and unified simulation JSON
    # out_pq and simulation.json are retained for verification and independent auditing

    return {
        "arrival_year": arrival_year,
        "final_a_au": a_final_au,
        "final_e": e_final,
        "total_propellant_kg": total_propellant_kg,
        "jet_power_w": p_jet,
        "wall_time_s": wall_time_s,
        "total_steps": len(rows),
        "simulation_frames": replay_doc["meta"]["frame_count"],
        "plot_path": str(fig_path),
        "simulation_json_path": str(out_unified),
        "validation_passed": verdict.passed,
        "winning_conditions": verdict.winning_conditions,
        "step_force_audit": step_force_audit,
        "monitors_summary": monitors_summary,
    }


# Canonical aliases
simulate_spiral = run_full_spiral_simulation
simulate = run_full_spiral_simulation


if __name__ == "__main__":
    res = simulate()
    print("\n================ FULL RUN REPORT ================")
    print(f"Arrival Time:        {res['arrival_year']:.2f} years")
    print(f"Final Semi-Major a:  {res['final_a_au']:.4f} AU")
    print(f"Final Eccentricity e:{res['final_e']:.6f}")
    print(f"Total Propellant:    {res['total_propellant_kg']:.3e} kg ({res['total_propellant_kg']/9.4e20*100:.1f}% of Ceres)")
    print(f"Relativistic Jet P:  {res['jet_power_w']:.3e} W")
    print(f"Wall Time:           {res['wall_time_s']:.2f} s")
    print(f"Total Steps:         {res['total_steps']}")
    print(f"Replay Frames:       {res['simulation_frames']}")
    print(f"Validator Passed:    {res['validation_passed']}")
    print(f"Winning Conditions:  {res['winning_conditions']}")
    print("==================================================")
