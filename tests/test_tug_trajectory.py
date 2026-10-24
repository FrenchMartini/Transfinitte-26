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
    """Verify independent closed-form trajectory against reference.json benchmarks.

    Governing slow-spiral equations:
      F_eff = F_thrust * cos(cant) * cos(yaw)
      v(t) = v0 - (F_eff / M_earth) * t
      r(t) = GM_sun / v(t)^2
    """
    bench = ref_data["spiral_trajectory_benchmark"]
    rel_tol = bench["rel_tol"]

    mu_sun = constants.GM_SUN
    m_earth = constants.M_EARTH
    r0 = constants.AU
    v0 = math.sqrt(mu_sun / r0)

    # 1. Theoretical benchmark with no losses
    F_nominal = 2.208e17
    a_noloss = F_nominal / m_earth

    # At 1000 years with no losses, expected ~ 1.083 AU
    t_1000yr = 1000.0 * constants.YEAR
    v_1000 = v0 - a_noloss * t_1000yr
    r_1000_noloss = (mu_sun / (v_1000**2)) / constants.AU
    assert pytest.approx(r_1000_noloss, rel=rel_tol) == bench["earth_a_1000yr_au"]

    # 2. Benchmarks at 100, 500, 1000 years
    for yr, key in [(100, "earth_a_100yr_au"), (500, "earth_a_500yr_au"), (1000, "earth_a_1000yr_au")]:
        t = yr * constants.YEAR
        v = v0 - a_noloss * t
        r_au = (mu_sun / (v**2)) / constants.AU
        assert pytest.approx(r_au, rel=rel_tol) == bench[key]


def test_delivered_pull_stays_equal_as_tug_mass_depletes(base_config: dict):
    """Delivered pull on Earth stays equal to required thrust as Tug mass changes when standoff is recomputed."""
    tug_cfg = base_config.get("ceres_tug", {})
    m_tug_0 = float(tug_cfg.get("mass_kg", 9.4e20))
    a_target = 3.697e-8  # nominal spiral acceleration
    tol_rel = 1.0e-5

    # Target pull on Earth: F_target = M_earth * a_target
    f_target = constants.M_EARTH * a_target

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
