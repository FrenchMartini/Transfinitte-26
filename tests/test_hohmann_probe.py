"""Hohmann transfer from 1.0 to 2.7 AU for test probe with full ledger accounting."""

import json
from pathlib import Path
import numpy as np
import pytest
import yaml

from octo.core import constants
from octo.core.exchange import Exchange
from octo.core.ledger import Ledger
from octo.core.state import BodyState, State
from octo.core.thresholds import load_thresholds, AssumedThresholdWarning
from octo.drivers.orbit import (
    OrbitDriver,
    circular_velocity,
    eccentricity,
    hohmann_transfer,
)


ROOT_DIR = Path(__file__).resolve().parent.parent
CONFIG_PATH = ROOT_DIR / "config" / "base.yaml"
REF_PATH = ROOT_DIR / "results" / "reference.json"


@pytest.fixture
def base_config() -> dict:
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


@pytest.fixture
def ref_data() -> dict:
    with open(REF_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def test_hohmann_milestone_test_probe_transfer(base_config: dict, ref_data: dict):
    """Simulate complete Hohmann transfer from 1.0 AU to 2.7 AU for test probe with full Ledger conservation closure."""
    h_ref = ref_data["hohmann_1_to_2_7_au"]
    r1 = h_ref["r1_au"] * constants.AU
    r2 = h_ref["r2_au"] * constants.AU
    mu_sun = constants.GM_SUN

    # 1. Closed-form benchmarks
    h_calc = hohmann_transfer(r1, r2, mu_sun)
    dv1_expected = h_calc["dv1_m_s"]
    dv2_expected = h_calc["dv2_m_s"]
    total_dv_expected = h_calc["total_dv_m_s"]
    t_transfer_expected = h_calc["transfer_time_s"]

    assert pytest.approx(dv1_expected / 1000.0, rel=h_ref["dv_rel_tol"]) == h_ref["dv1_km_s"]
    assert pytest.approx(dv2_expected / 1000.0, rel=h_ref["dv_rel_tol"]) == h_ref["dv2_km_s"]
    assert pytest.approx(total_dv_expected / 1000.0, rel=h_ref["dv_rel_tol"]) == h_ref["total_dv_km_s"]
    assert pytest.approx(t_transfer_expected / constants.YEAR, rel=h_ref["time_rel_tol"]) == h_ref["transfer_time_yr"]

    # 2. Probe mass and engine params from config
    probe_cfg = base_config.get("test_probe", {})
    m0_probe = float(probe_cfg.get("mass_kg", 1000.0))
    v_exhaust = float(probe_cfg.get("exhaust_velocity_m_s", 50000.0))

    # 3. Setup State with Sun, Probe, and explicit non-simulated actors
    m_sun = constants.GM_SUN / constants.G
    v1_circ = circular_velocity(r1, mu_sun)
    r_probe_0 = np.array([r1, 0.0, 0.0], dtype=np.float64)
    v_probe_0 = np.array([0.0, v1_circ, 0.0], dtype=np.float64)

    # Initial stored energy pool sufficient to power the rocket burns
    init_stored_energy_j = 1.0e13
    state = State(t=0.0, stored_energy_j=init_stored_energy_j)
    state.add_body(BodyState(name="Sun", mass_kg=m_sun, position_m=[0.0, 0.0, 0.0], velocity_m_s=[0.0, 0.0, 0.0]))
    state.add_body(BodyState(name="Probe", mass_kg=m0_probe, position_m=r_probe_0, velocity_m_s=v_probe_0))

    # Declare explicit non-simulated counterparties in State
    state.add_body(BodyState(name="ExhaustSink", mass_kg=0.0, position_m=[0.0, 0.0, 0.0], velocity_m_s=[0.0, 0.0, 0.0]))
    state.add_body(BodyState(name="PowerPlant", mass_kg=0.0, position_m=[0.0, 0.0, 0.0], velocity_m_s=[0.0, 0.0, 0.0]))

    with pytest.warns(AssumedThresholdWarning):
        thresholds = load_thresholds()
    ledger = Ledger(initial_state=state, thresholds=thresholds)

    # Verify clean initial baseline
    assert ledger.audit(state, 0.0) == []

    # 4. Departure burn at perihelion (1.0 AU) to enter transfer orbit
    m1_probe = m0_probe * np.exp(-dv1_expected / v_exhaust)
    dm1 = m0_probe - m1_probe

    # Rocket equation momentum check: dm * ve approx m * dv
    v_unit_1 = v_probe_0 / np.linalg.norm(v_probe_0)
    v1_peri_vec = v_probe_0 + dv1_expected * v_unit_1

    p0_probe = m0_probe * v_probe_0
    p1_probe = m1_probe * v1_peri_vec
    dp_exhaust_1 = p0_probe - p1_probe
    v_ex_inertial_1 = dp_exhaust_1 / dm1
    exhaust_v_rel_1 = v_ex_inertial_1 - v_probe_0

    # Stored energy expenditure and kinetic energies
    ke0_probe = 0.5 * m0_probe * float(np.dot(v_probe_0, v_probe_0))
    ke1_probe = 0.5 * m1_probe * float(np.dot(v1_peri_vec, v1_peri_vec))
    ke_ex_1 = 0.5 * dm1 * float(np.dot(v_ex_inertial_1, v_ex_inertial_1))
    pe0 = -mu_sun * m0_probe / r1
    pe1 = -mu_sun * m1_probe / r1
    delta_energy_1 = (ke1_probe + pe1 + ke_ex_1) - (ke0_probe + pe0)

    burn_dt = 1.0  # 1-second burn epoch
    ex_burn1 = Exchange(
        t=0.0,
        a="ExhaustSink",
        b="Probe",
        force_on_b=np.zeros(3, dtype=np.float64),
        point=state.get_body("Probe").position_m,
        mass_out=dm1 / burn_dt,
        exhaust_v=exhaust_v_rel_1,
        power_in=delta_energy_1 / burn_dt,
        owner="propulsion",
    )
    ledger.book(ex_burn1, dt=burn_dt)

    # Update Probe and energy pool in State
    state.get_body("Probe").mass_kg = m1_probe
    state.get_body("Probe").velocity_m_s = v1_peri_vec
    state.stored_energy_j -= delta_energy_1
    state.t += burn_dt

    # Audit after Burn 1
    flags_after_burn1 = ledger.audit(state, state.t)
    assert flags_after_burn1 == [], f"Drift detected after Burn 1: {flags_after_burn1}"

    # Verify exhaust momentum and KE match the rocket equation
    assert pytest.approx(float(np.linalg.norm(dp_exhaust_1)), rel=1e-6) == dm1 * float(np.linalg.norm(v_ex_inertial_1))
    assert ledger.total_expelled_mass_kg == pytest.approx(dm1, rel=1e-12)

    # --------------------------------------------------------------------------
    # 5. COAST: Ballistic flight along transfer ellipse to 2.7 AU
    # --------------------------------------------------------------------------
    driver = OrbitDriver(state, ledger=ledger, config=base_config)
    state = driver.step(t_transfer_expected)

    r_apo = float(np.linalg.norm(state.get_body("Probe").position_m))
    assert pytest.approx(r_apo / constants.AU, rel=h_ref["dv_rel_tol"]) == h_ref["r2_au"]

    # Audit after coast
    flags_after_coast = ledger.audit(state, state.t)
    assert flags_after_coast == [], f"Drift detected after coast: {flags_after_coast}"

    # 6. Arrival burn at aphelion (2.7 AU) to circularize orbit
    m2_probe = m1_probe * np.exp(-dv2_expected / v_exhaust)
    dm2 = m1_probe - m2_probe

    v_apo_vec = state.get_body("Probe").velocity_m_s
    v_unit_2 = v_apo_vec / np.linalg.norm(v_apo_vec)
    v2_circ_vec = v_apo_vec + dv2_expected * v_unit_2

    p1_apo = m1_probe * v_apo_vec
    p2_circ = m2_probe * v2_circ_vec
    dp_exhaust_2 = p1_apo - p2_circ
    v_ex_inertial_2 = dp_exhaust_2 / dm2
    exhaust_v_rel_2 = v_ex_inertial_2 - v_apo_vec

    ke1_apo = 0.5 * m1_probe * float(np.dot(v_apo_vec, v_apo_vec))
    ke2_circ = 0.5 * m2_probe * float(np.dot(v2_circ_vec, v2_circ_vec))
    ke_ex_2 = 0.5 * dm2 * float(np.dot(v_ex_inertial_2, v_ex_inertial_2))
    pe_apo = -mu_sun * m1_probe / r2
    pe_circ = -mu_sun * m2_probe / r2
    delta_energy_2 = (ke2_circ + pe_circ + ke_ex_2) - (ke1_apo + pe_apo)

    ex_burn2 = Exchange(
        t=state.t,
        a="ExhaustSink",
        b="Probe",
        force_on_b=np.zeros(3, dtype=np.float64),
        point=state.get_body("Probe").position_m,
        mass_out=dm2 / burn_dt,
        exhaust_v=exhaust_v_rel_2,
        power_in=delta_energy_2 / burn_dt,
        owner="propulsion",
    )
    ledger.book(ex_burn2, dt=burn_dt)

    state.get_body("Probe").mass_kg = m2_probe
    state.get_body("Probe").velocity_m_s = v2_circ_vec
    state.stored_energy_j -= delta_energy_2
    state.t += burn_dt

    # Final audit after circularization
    flags_final = ledger.audit(state, state.t)
    assert flags_final == [], f"Drift detected after Burn 2: {flags_final}"

    # Verify final circular orbit at 2.7 AU
    final_r = float(np.linalg.norm(state.get_body("Probe").position_m))
    final_v = float(np.linalg.norm(state.get_body("Probe").velocity_m_s))
    final_ecc = eccentricity(state.get_body("Probe").position_m, state.get_body("Probe").velocity_m_s, mu_sun)

    assert pytest.approx(final_r / constants.AU, rel=h_ref["dv_rel_tol"]) == 2.7
    assert pytest.approx(final_v / 1000.0, rel=h_ref["dv_rel_tol"]) == ref_data["circular_velocity_target_km_s"]["value"]
    assert final_ecc < 0.01

    # Total reaction mass matches analytic sum
    total_dm_expected = (m0_probe - m1_probe) + (m1_probe - m2_probe)
    assert pytest.approx(ledger.total_expelled_mass_kg, rel=1e-12) == total_dm_expected
