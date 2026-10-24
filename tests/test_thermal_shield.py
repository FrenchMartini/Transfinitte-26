"""Tests for Step 3.0 Design Corrections: toy radiative-equilibrium multilayer model."""

import pytest
from octo.core.thresholds import load_thresholds, get_threshold_value, AssumedThresholdWarning


def multilayer_shield_attenuation_analytical(n_layers: int, r_ir: float) -> float:
    """True radiative-equilibrium attenuation factor for N identical non-vacuum-isolated shields.

    For N identical thin planar shields of surface emissivity eps = 1 - R_ir:
    Thermal radiation transfer between hot source (T_hot) and cold receiver (T_cold)
    in radiative equilibrium satisfies:
      q_net = (sigma * (T_hot^4 - T_cold^4)) / ( (1/eps_1 + 1/eps_2 - 1) + (N - 1)*(2/eps - 1) + ... )
    For N identical floating shields, the standard steady-state attenuation factor is:
      eta_rad = 1.0 / (N + 1) * (eps / (2 - eps))  [or 1 / (N + 1) for diffuse grey shields].

    In contrast, the naive optical attenuation formula (1 - R_ir)^N assumes each shield
    absorbs/reflects light like a cold optical filter without re-radiating its absorbed heat.
    """
    eps = 1.0 - r_ir
    if eps <= 0.0:
        return 0.0
    # True radiative equilibrium with re-emission from both sides of each shield:
    return float(eps / ((n_layers + 1.0) * (2.0 - eps)))


def test_multilayer_thermal_shield_not_power_law():
    """Verify why (1-R)^N is invalid: floating shields re-radiate absorbed energy from both faces."""
    n_layers = 5
    r_ir = 0.99
    eps = 1.0 - r_ir  # 0.01

    naive_attenuation = (1.0 - r_ir) ** n_layers  # (0.01)^5 = 1e-10
    true_attenuation = multilayer_shield_attenuation_analytical(n_layers, r_ir)

    # True steady-state radiative equilibrium allows much more heat to leak through
    # because shield #1 heats up and re-radiates forward and backward!
    # true_attenuation is ~ 8.4e-4, NOT 1e-10!
    assert true_attenuation > naive_attenuation * 1000.0
    assert true_attenuation == pytest.approx(0.01 / (6.0 * 1.99), rel=1e-3)


def test_shield_attenuation_is_assumed_config_parameter():
    """Verify that thermal shield attenuation is an ASSUMED threshold in rulebook_thresholds.yaml."""
    with pytest.warns(AssumedThresholdWarning):
        thresholds = load_thresholds()

    val = get_threshold_value(thresholds, "earth_safety", "thermal_shield_attenuation")
    assert val > 0.0
    assert thresholds["earth_safety"]["thermal_shield_attenuation"]["status"] == "ASSUMED"
