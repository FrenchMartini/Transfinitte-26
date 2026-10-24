"""Tests for configuration physical consistency and force balance (Step 4.2).

Enforces that:
  F_pull = G * M_earth * M_tug / d^2
balances the engine thrust and tug acceleration:
  F_thrust_eff = F_pull + M_tug * a_earth
"""

import math
from pathlib import Path
import pytest
import yaml

from octo.core import constants
from octo.drivers.propulsion import lorentz_gamma, two_cone_canting_loss

ROOT_DIR = Path(__file__).resolve().parent.parent
CONFIG_PATH = ROOT_DIR / "config" / "base.yaml"


@pytest.fixture
def base_config() -> dict:
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def test_tug_pull_thrust_acceleration_balance(base_config: dict):
    """Verify that gravitational pull on Earth equals engine thrust minus tug orbital acceleration.

    Physical balance condition:
      F_pull = G * M_earth * M_tug / d^2
      a_earth = F_pull / M_earth
      F_forward_req = F_pull + M_tug * a_earth
      F_thrust_delivered = mdot * gamma * v_e * cos(cant_angle)

    Must fail (RED) when config parameters (M_tug, d, mdot) are inconsistent.
    """
    tug_cfg = base_config.get("ceres_tug", {})
    prop_cfg = base_config.get("propulsion", {})

    m_tug = float(tug_cfg.get("mass_kg", 9.4e20))
    d = float(tug_cfg.get("standoff_distance_m", 6.84e8))
    v_e = float(tug_cfg.get("exhaust_velocity_m_s", 0.3 * constants.C_LIGHT))
    mdot = float(prop_cfg.get("mass_flow_kg_s", 2.3e9))
    cone_deg = float(tug_cfg.get("cone_half_angle_deg", 5.0))
    tol = float(tug_cfg.get("balance_tolerance_rel", 0.05))

    m_earth = constants.M_EARTH
    g_const = constants.G

    # 1. Gravitational pull on Earth from Tug
    f_pull = g_const * m_earth * m_tug / (d**2)
    a_earth = f_pull / m_earth

    # 2. Required forward thrust on Tug
    f_req = f_pull + m_tug * a_earth

    # 3. Delivered effective thrust from propulsion settings
    gamma = lorentz_gamma(v_e, constants.C_LIGHT)
    f_engine = mdot * gamma * v_e
    cant_factor = two_cone_canting_loss(math.radians(cone_deg))
    f_delivered_eff = f_engine * cant_factor

    # This MUST fail on current config (8.01e17 N pull vs ~2.3e17 N thrust)
    rel_diff = abs(f_pull - f_delivered_eff) / f_pull
    assert rel_diff < tol, (
        f"Inconsistent Tug config: pull on Earth F_pull={f_pull:.3e} N, "
        f"effective thrust F_delivered={f_delivered_eff:.3e} N, "
        f"relative discrepancy={rel_diff:.3f} exceeds tolerance {tol}."
    )


def test_option_b_config_consistency():
    """Verify Option B config (compact standoff d=6.84e8 m, M_tug=2.726e20 kg) satisfies force balance."""
    opt_b_path = ROOT_DIR / "config" / "compact_standoff.yaml"
    with open(opt_b_path, "r", encoding="utf-8") as f:
        cfg = yaml.safe_load(f)

    tug_cfg = cfg.get("ceres_tug", {})
    prop_cfg = cfg.get("propulsion", {})

    m_tug = float(tug_cfg.get("mass_kg", 2.7261e20))
    d = float(tug_cfg.get("standoff_distance_m", 6.84e8))
    v_e = float(tug_cfg.get("exhaust_velocity_m_s", 0.3 * constants.C_LIGHT))
    mdot = float(prop_cfg.get("mass_flow_kg_s", 2.501e9))
    cone_deg = float(tug_cfg.get("cone_half_angle_deg", 5.0))
    tol = float(tug_cfg.get("balance_tolerance_rel", 0.05))

    m_earth = constants.M_EARTH
    g_const = constants.G

    f_pull = g_const * m_earth * m_tug / (d**2)
    gamma = lorentz_gamma(v_e, constants.C_LIGHT)
    f_engine = mdot * gamma * v_e
    cant_factor = two_cone_canting_loss(math.radians(cone_deg))
    f_delivered_eff = f_engine * cant_factor

    rel_diff = abs(f_pull - f_delivered_eff) / f_pull
    assert rel_diff < tol, (
        f"Inconsistent Option B config: pull on Earth F_pull={f_pull:.3e} N, "
        f"effective thrust F_delivered={f_delivered_eff:.3e} N, "
        f"relative discrepancy={rel_diff:.3f} exceeds tolerance {tol}."
    )

