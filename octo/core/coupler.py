"""Simulation Coupler, Driver Registry, macro-step Strang splitting, and output dispatchers.

Simulation loop contracts:
- Driver orchestration: Drivers never call each other directly; they read State and book to Ledger.
- Strang splitting per macro-step: Half-step power/propulsion, full-step orbit, half-step propulsion/power.
- N-body orbit integration: Orbit driver applies net booked forces via REBOUND IAS15.
- Post-step audits: Structure and habitability monitors evaluate limits, followed by `ledger.audit`.
- Output dispatching: Serializes telemetry rows to Parquet and generates diagnostic summary plots.
"""

import os
from pathlib import Path
from typing import Any, Callable, Protocol
import numpy as np

os.environ.setdefault("MPLCONFIGDIR", "/tmp/matplotlib")
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

from octo.core import constants
from octo.core.flags import FlagRegistry
from octo.core.ledger import Ledger
from octo.core.recorder import ParquetResultsWriter
from octo.core.state import State
from octo.drivers.habitability import HabitabilityDriver
from octo.drivers.orbit import OrbitDriver
from octo.drivers.propulsion import CeresTugDriver, PropulsionModel
from octo.drivers.structure import StructureDriver


class DriverProtocol(Protocol):
    """Protocol for simulation drivers coordinated by the Coupler."""

    name: str

    def step(self, dt: float) -> Any: ...


class StubDriver:
    """Pass-through driver for declared pipeline stages not yet implemented."""

    def __init__(self, name: str, state: State, ledger: Ledger | None = None, config: dict[str, Any] | None = None) -> None:
        self.name = name
        self.state = state
        self.ledger = ledger
        self.config = config or {}

    def step(self, dt: float) -> None:
        pass


class PropulsionDriverWrapper:
    """Driver wrapping PropulsionModel and booking Exchanges to the Ledger."""

    def __init__(
        self,
        state: State,
        ledger: Ledger | None = None,
        config: dict[str, Any] | None = None,
    ) -> None:
        self.name = "propulsion"
        self.state = state
        self.ledger = ledger
        self.config = config or {}

        p_cfg = self.config.get("propulsion", {})
        self.model = PropulsionModel(
            exhaust_velocity_m_s=float(p_cfg.get("exhaust_velocity_m_s", 0.0)),
            mass_flow_kg_s=float(p_cfg.get("mass_flow_kg_s", 0.0)),
            efficiency=float(p_cfg.get("efficiency", 1.0)),
        )

    def step(self, dt: float) -> None:
        pass


class DriverRegistry:
    """Registry mapping driver names to driver constructor factories."""

    def __init__(self) -> None:
        self._factories: dict[str, Callable[..., Any]] = {}

    def register(self, name: str, factory: Callable[..., Any]) -> None:
        """Register a constructor factory for driver `name`."""
        self._factories[name] = factory

    def create(self, name: str, **kwargs: Any) -> Any:
        """Instantiate a registered driver by name."""
        if name in self._factories:
            return self._factories[name](**kwargs)
        # Default fallback to StubDriver
        return StubDriver(name=name, **kwargs)

    def driver_names(self) -> list[str]:
        """Return list of all registered driver names."""
        return sorted(self._factories.keys())


def create_default_driver_registry() -> DriverRegistry:
    """Create and populate a DriverRegistry with standard core drivers."""
    registry = DriverRegistry()
    registry.register(
        "orbit",
        lambda state, ledger=None, config=None, **kw: OrbitDriver(
            state=state, ledger=ledger, config=config, **kw
        ),
    )
    def _create_propulsion(state: Any, ledger: Any = None, config: Any = None, **kw: Any) -> Any:
        if state.has_body("Tug") or (config and "ceres_tug" in config):
            return CeresTugDriver(state=state, ledger=ledger, config=config)
        return PropulsionDriverWrapper(state=state, ledger=ledger, config=config)

    registry.register("propulsion", _create_propulsion)
    registry.register(
        "power",
        lambda state, ledger=None, config=None, **kw: StubDriver(
            name="power", state=state, ledger=ledger, config=config
        ),
    )
    registry.register(
        "structure",
        lambda state, ledger=None, config=None, **kw: StructureDriver(
            state=state, ledger=ledger, config=config, **kw
        ),
    )
    registry.register(
        "habitability",
        lambda state, ledger=None, config=None, **kw: HabitabilityDriver(
            state=state, ledger=ledger, config=config, **kw
        ),
    )
    return registry


class SimulationCoupler:
    """Coupler coordinating multi-physics drivers via macro-step Strang splitting."""

    def __init__(
        self,
        state: State,
        ledger: Ledger,
        config: dict[str, Any],
        flag_registry: FlagRegistry | None = None,
        driver_registry: DriverRegistry | None = None,
    ) -> None:
        self.state = state
        self.ledger = ledger
        self.config = config
        self.flag_registry = flag_registry

        self.macro_step_s = float(self.config.get("macro_step_s", 86400.0))
        self.step_index = 0
        self.history: list[dict[str, Any]] = []

        self.registry = driver_registry or create_default_driver_registry()
        self.drivers: dict[str, Any] = {}

        declared_driver_names = self.config.get("drivers", ["orbit"])
        for name in declared_driver_names:
            self.drivers[name] = self.registry.create(
                name=name,
                state=self.state,
                ledger=self.ledger,
                config=self.config,
            )

        self.results_writer = ParquetResultsWriter()

    def step(self, dt: float | None = None) -> dict[str, Any]:
        """Execute one Strang-splitting macro step: half power/propulsion, full orbit, half propulsion/power."""
        dt_s = float(dt) if dt is not None else self.macro_step_s
        half_dt = dt_s / 2.0

        # 1. Reset per-step ledger accumulators
        self.ledger.begin_step()

        # 2. First half-step: power, propulsion
        if "power" in self.drivers:
            self.drivers["power"].step(half_dt)
        if "propulsion" in self.drivers:
            self.drivers["propulsion"].step(half_dt)

        # 3. Full step: orbit (reads net forces from ledger and advances N-body motion)
        if "orbit" in self.drivers:
            self.state = self.drivers["orbit"].step(dt_s)

        # 4. Second half-step: propulsion, power
        if "propulsion" in self.drivers:
            self.drivers["propulsion"].step(half_dt)
        if "power" in self.drivers:
            self.drivers["power"].step(half_dt)

        # 5. Post-step: structure, habitability
        monitor_flags = []
        if "structure" in self.drivers:
            res = self.drivers["structure"].step(dt_s)
            if isinstance(res, list):
                monitor_flags.extend(res)
        if "habitability" in self.drivers:
            res = self.drivers["habitability"].step(dt_s)
            if isinstance(res, list):
                monitor_flags.extend(res)

        # 6. Audit state conservation against initial baseline
        flags = self.ledger.audit(self.state, self.state.t)
        all_flags = list(flags) + monitor_flags

        if self.flag_registry is not None:
            self.flag_registry.register_many(all_flags)
            audit_pass = not self.flag_registry.has_unresolved_flags()
        else:
            audit_pass = len(all_flags) == 0

        self.step_index += 1

        # 7. Build telemetry record
        row: dict[str, Any] = {
            "step_index": self.step_index,
            "t_s": float(self.state.t),
            "dt_s": dt_s,
            "audit_pass": audit_pass,
            "flags_count": len(all_flags),
            "expelled_mass_kg": float(self.ledger.total_expelled_mass_kg),
            "heat_booked_j": float(self.ledger.total_heat_booked_j),
            "exhaust_ke_j": float(self.ledger.total_exhaust_ke_j),
        }

        # Body coordinates
        for body in self.state.bodies():
            r_mag = float(np.linalg.norm(body.position_m))
            v_mag = float(np.linalg.norm(body.velocity_m_s))
            row[f"{body.name}_r_au"] = r_mag / constants.AU
            row[f"{body.name}_v_km_s"] = v_mag / 1000.0
            row[f"{body.name}_mass_kg"] = float(body.mass_kg)
            row[f"{body.name}_x_au"] = float(body.position_m[0]) / constants.AU
            row[f"{body.name}_y_au"] = float(body.position_m[1]) / constants.AU

        self.history.append(row)
        return row

    def run(
        self,
        num_steps: int | None = None,
        duration_s: float | None = None,
    ) -> list[dict[str, Any]]:
        """Run macro-step simulation loop and write Parquet results if configured."""
        if num_steps is None:
            if duration_s is not None:
                num_steps = max(1, int(np.ceil(duration_s / self.macro_step_s)))
            else:
                total_time_yr = float(self.config.get("time_span_years", 1.0))
                total_time_s = total_time_yr * constants.YEAR
                num_steps = max(1, int(np.ceil(total_time_s / self.macro_step_s)))

        for _ in range(num_steps):
            self.step(self.macro_step_s)

        # Write Parquet table if output path is set in config
        out_cfg = self.config.get("output_paths", {})
        pq_path = out_cfg.get("parquet")
        if pq_path and self.history:
            self.results_writer.write_run_rows(pq_path, self.history)

        return self.history


def plot_simulation_results(
    history: list[dict[str, Any]],
    output_path: str | Path | None = None,
    title: str = "OrbitShift Trajectory & Telemetry",
) -> matplotlib.figure.Figure:
    """Plot orbital trajectory and telemetry using Matplotlib."""
    times_days = [r["t_s"] / 86400.0 for r in history]

    fig, axes = plt.subplots(1, 2, figsize=(12, 6))

    # Panel 1: Orbital Trajectory (X vs Y in AU)
    ax_orbit = axes[0]
    ax_orbit.set_title("Heliocentric Trajectory")
    ax_orbit.set_xlabel("X [AU]")
    ax_orbit.set_ylabel("Y [AU]")
    ax_orbit.grid(True, linestyle="--", alpha=0.4)

    # Plot Sun at origin
    ax_orbit.plot(0, 0, "yo", markersize=8, label="Sun")

    # Plot Earth or bodies
    if history and "Earth_x_au" in history[0]:
        xs = [r["Earth_x_au"] for r in history]
        ys = [r["Earth_y_au"] for r in history]
        ax_orbit.plot(xs, ys, "b-", linewidth=2.0, label="Earth Trajectory")
        ax_orbit.plot(xs[-1], ys[-1], "bo", markersize=6, label="Earth Current")

    ax_orbit.set_aspect("equal", adjustable="datalim")
    ax_orbit.legend(loc="upper right")

    # Panel 2: Orbital Radius and Speed vs Time
    ax_tele = axes[1]
    ax_tele.set_title("Orbital Distance vs Time")
    ax_tele.set_xlabel("Time [days]")
    ax_tele.set_ylabel("Radius [AU]", color="blue")
    ax_tele.grid(True, linestyle="--", alpha=0.4)

    if history and "Earth_r_au" in history[0]:
        rs = [r["Earth_r_au"] for r in history]
        line1 = ax_tele.plot(times_days, rs, "b-", label="Radius [AU]")
        ax_tele.tick_params(axis="y", labelcolor="blue")

        if "Earth_v_km_s" in history[0]:
            ax_vel = ax_tele.twinx()
            vs = [r["Earth_v_km_s"] for r in history]
            line2 = ax_vel.plot(times_days, vs, "r--", label="Speed [km/s]")
            ax_vel.set_ylabel("Speed [km/s]", color="red")
            ax_vel.tick_params(axis="y", labelcolor="red")

            lines = line1 + line2
            labels = [l.get_label() for l in lines]
            ax_tele.legend(lines, labels, loc="upper right")

    fig.suptitle(title)
    fig.tight_layout()

    if output_path:
        out_p = Path(output_path)
        out_p.parent.mkdir(parents=True, exist_ok=True)
        fig.savefig(out_p, dpi=120)

    return fig
