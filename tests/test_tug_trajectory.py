"""Tests for Ceres Tug trajectory, closed-form slow spiral, mass depletion, and Moon Hill stability (Step 4.1)."""

import json
import math
from pathlib import Path
import numpy as np
import pytest
import yaml

from octo.core import constants
from octo.core.state import BodyState, State
from octo.core.ledger import Ledger
from octo.core.thresholds import load_thresholds, AssumedThresholdWarning
from octo.drivers.propulsion import (
    CeresTugDriver,
    two_cone_canting_loss,
    standoff_distance_for_acceleration,
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


def test_closed_form_spiral_trajectory_100_500_1000_years(base_config: dict, ref_data: dict):
    """Verify independent closed-form trajectory computed from config/base.yaml against reference.json.

    Governing slow-spiral equations:
      F_nom = mdot * gamma * v_e
      F_eff = F_nom * cos(cant) * cos(yaw)
      v(t) = v0 - (F_eff / M_earth) * t
      r(t) = GM_sun / v(t)^2
    """
    from tools.closed_form_spiral import compute_benchmark_from_config

    bench = ref_data["spiral_trajectory_benchmark"]
    rel_tol = bench["rel_tol"]

    computed = compute_benchmark_from_config(CONFIG_PATH)

    assert pytest.approx(computed["f_nominal_n"], rel=rel_tol) == bench["f_nominal_n"]
    assert pytest.approx(computed["f_effective_n"], rel=rel_tol) == bench["f_effective_n"]

    for yr, key in [(100, "earth_a_100yr_au"), (500, "earth_a_500yr_au"), (1000, "earth_a_1000yr_au")]:
        assert pytest.approx(computed[key], rel=rel_tol) == bench[key]


def test_delivered_pull_stays_equal_as_tug_mass_depletes(base_config: dict):
    """Delivered pull on Earth stays equal to required thrust as Tug mass changes when standoff is recomputed."""
    from tools.closed_form_spiral import compute_benchmark_from_config

    tug_cfg = base_config.get("ceres_tug", {})
    m_tug_0 = float(tug_cfg["mass_kg"])
    computed = compute_benchmark_from_config(CONFIG_PATH)
    f_target = computed["f_effective_n"]
    a_target = f_target / constants.M_EARTH
    tol_rel = 1.0e-5

    # Simulate mass depletion across 10 steps (e.g. losing 10% mass per step down to 50%)
    for frac in np.linspace(1.0, 0.5, 10):
        m_tug_current = m_tug_0 * frac
        # Recompute standoff distance: d = sqrt(G * M_tug / a_target)
        d = standoff_distance_for_acceleration(m_tug_current, a_target, constants.G)
        # Delivered gravitational pull: F_delivered = G * M_earth * M_tug / d^2
        f_delivered = constants.G * constants.M_EARTH * m_tug_current / (d**2)
        assert pytest.approx(f_delivered, rel=tol_rel) == f_target


def test_moon_stays_bound_in_one_year_run():
    """1-year N-body test with Sun, Earth, Moon, and Tug verifies Moon remains bound within Earth's Hill sphere."""
    import rebound

    sim = rebound.Simulation()
    sim.integrator = "ias15"
    sim.G = constants.G

    m_sun = constants.GM_SUN / constants.G
    m_earth = constants.M_EARTH
    m_moon = 7.342e22
    m_tug = 9.4e20

    r_earth_0 = constants.AU
    v_earth_0 = math.sqrt(constants.GM_SUN / r_earth_0)
    r_moon_orbit = 3.844e8
    v_moon_orbit = math.sqrt(constants.G * m_earth / r_moon_orbit)
    d_tug = 6.84e8

    sim.add(m=m_sun, name="Sun")
    sim.add(m=m_earth, x=r_earth_0, vy=v_earth_0, name="Earth")
    sim.add(m=m_moon, x=r_earth_0 + r_moon_orbit, vy=v_earth_0 + v_moon_orbit, name="Moon")
    sim.add(m=m_tug, x=r_earth_0, y=d_tug, vy=v_earth_0, name="Tug")
    sim.move_to_com()

    r_hill_0 = r_earth_0 * (m_earth / (3.0 * m_sun)) ** (1.0 / 3.0)
    tug_hill_fraction = d_tug / r_hill_0
    assert 0.40 < tug_hill_fraction < 0.50  # ~45.7% of Hill radius

    # Run for 1 orbital period (1 year)
    sim.integrate(constants.YEAR)

    p_e = sim.particles["Earth"]
    p_m = sim.particles["Moon"]
    d_moon_final = math.sqrt((p_m.x - p_e.x) ** 2 + (p_m.y - p_e.y) ** 2 + (p_m.z - p_e.z) ** 2)

    # Moon must stay safely bound inside Hill radius
    assert d_moon_final < 0.5 * r_hill_0
    assert 3.5e8 < d_moon_final < 4.2e8  # lunar orbital distance stable
