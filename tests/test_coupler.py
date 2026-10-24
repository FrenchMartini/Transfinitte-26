"""Tests for SimulationCoupler, DriverRegistry, macro-step loop, and Parquet/matplotlib outputs (Step 3.2)."""

import os
from pathlib import Path
import tempfile
import numpy as np
import pyarrow.parquet as pq
import pytest
import yaml

os.environ.setdefault("MPLCONFIGDIR", "/tmp/matplotlib")
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

from octo.core import constants
from octo.core.coupler import (
    SimulationCoupler,
    create_default_driver_registry,
    plot_simulation_results,
)
from octo.core.ledger import Ledger
from octo.core.state import BodyState, State
from octo.core.thresholds import load_thresholds, AssumedThresholdWarning
from octo.drivers.orbit import OrbitDriver


ROOT_DIR = Path(__file__).resolve().parent.parent
CONFIG_PATH = ROOT_DIR / "config" / "base.yaml"


@pytest.fixture
def base_config() -> dict:
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


@pytest.fixture
def sun_earth_state() -> State:
    m_sun = constants.GM_SUN / constants.G
    m_earth = constants.M_EARTH
    mu_tot = constants.G * (m_sun + m_earth)
    r_earth = constants.AU
    v_earth = np.sqrt(mu_tot / r_earth)

    r_sun_h = np.zeros(3, dtype=np.float64)
    v_sun_h = np.zeros(3, dtype=np.float64)
    r_earth_h = np.array([r_earth, 0.0, 0.0], dtype=np.float64)
    v_earth_h = np.array([0.0, v_earth, 0.0], dtype=np.float64)

    r_com = (m_sun * r_sun_h + m_earth * r_earth_h) / (m_sun + m_earth)
    v_com = (m_sun * v_sun_h + m_earth * v_earth_h) / (m_sun + m_earth)

    state = State(t=0.0)
    state.add_body(
        BodyState(
            name="Sun",
            mass_kg=m_sun,
            position_m=r_sun_h - r_com,
            velocity_m_s=v_sun_h - v_com,
        )
    )
    state.add_body(
        BodyState(
            name="Earth",
            mass_kg=m_earth,
            position_m=r_earth_h - r_com,
            velocity_m_s=v_earth_h - v_com,
        )
    )
    return state


def test_driver_registry_registration_and_creation(sun_earth_state: State, base_config: dict):
    """DriverRegistry allows registering and instantiating drivers by name."""
    registry = create_default_driver_registry()
    assert "orbit" in registry.driver_names()

    with pytest.warns(AssumedThresholdWarning):
        thresholds = load_thresholds()
    ledger = Ledger(initial_state=sun_earth_state, thresholds=thresholds)

    orbit_drv = registry.create("orbit", state=sun_earth_state, ledger=ledger, config=base_config)
    assert isinstance(orbit_drv, OrbitDriver)


def test_coupler_initialization_from_config(sun_earth_state: State, base_config: dict):
    """Coupler reads driver list from config and instantiates all registered drivers."""
    with pytest.warns(AssumedThresholdWarning):
        thresholds = load_thresholds()
    ledger = Ledger(initial_state=sun_earth_state, thresholds=thresholds)

    coupler = SimulationCoupler(
        state=sun_earth_state,
        ledger=ledger,
        config=base_config,
    )
    assert coupler.macro_step_s == pytest.approx(base_config["macro_step_s"], rel=1e-12)
    assert "orbit" in coupler.drivers


def test_coupler_macro_step_strang_splitting_and_audit(sun_earth_state: State, base_config: dict):
    """Coupler executes Strang-splitting macro steps and calls ledger.audit each step."""
    with pytest.warns(AssumedThresholdWarning):
        thresholds = load_thresholds()
    ledger = Ledger(initial_state=sun_earth_state, thresholds=thresholds)

    coupler = SimulationCoupler(
        state=sun_earth_state,
        ledger=ledger,
        config=base_config,
    )

    row = coupler.step(dt=86400.0)
    assert row["step_index"] == 1
    assert row["t_s"] == pytest.approx(86400.0, rel=1e-9)
    assert row["audit_pass"] is True
    assert "Earth_r_au" in row
    assert "Earth_v_km_s" in row


def test_coupler_run_writes_parquet_results(sun_earth_state: State, base_config: dict):
    """Coupler run saves macro-step telemetry to Parquet via ParquetResultsWriter."""
    with pytest.warns(AssumedThresholdWarning):
        thresholds = load_thresholds()
    ledger = Ledger(initial_state=sun_earth_state, thresholds=thresholds)

    with tempfile.TemporaryDirectory() as tmpdir:
        pq_path = Path(tmpdir) / "test_run.parquet"
        run_cfg = dict(base_config)
        run_cfg.setdefault("output_paths", {})["parquet"] = str(pq_path)

        coupler = SimulationCoupler(
            state=sun_earth_state,
            ledger=ledger,
            config=run_cfg,
        )

        n_steps = 5
        history = coupler.run(num_steps=n_steps)
        assert len(history) == n_steps
        assert pq_path.is_file()

        table = pq.read_table(pq_path)
        assert table.num_rows == n_steps
        assert "t_s" in table.column_names
        assert "audit_pass" in table.column_names


def test_coupler_plot_results_with_matplotlib(sun_earth_state: State, base_config: dict):
    """plot_simulation_results generates a matplotlib figure displaying orbit and telemetry."""
    with pytest.warns(AssumedThresholdWarning):
        thresholds = load_thresholds()
    ledger = Ledger(initial_state=sun_earth_state, thresholds=thresholds)

    with tempfile.TemporaryDirectory() as tmpdir:
        test_cfg = dict(base_config)
        test_cfg["output_paths"] = {"parquet": str(Path(tmpdir) / "test_run.parquet")}
        coupler = SimulationCoupler(
            state=sun_earth_state,
            ledger=ledger,
            config=test_cfg,
        )
        history = coupler.run(num_steps=5)

        fig_path = Path(tmpdir) / "trajectory.png"
        fig = plot_simulation_results(history, output_path=fig_path)
        assert fig is not None
        assert fig_path.is_file()
        assert fig_path.stat().st_size > 0
        plt.close(fig)
