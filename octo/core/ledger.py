"""Conservation Ledger enforcing Newton's Third Law and auditing simulation state.

Conservation rules and audit contracts:
- Bilateral booking: `book(exchange)` applies +F on component b and -F on component a.
- Force integrity: Rejects self-forces (a == b), unknown components, and NaN/Inf values.
- Reaction mass closure: Expelled mass is booked with its inertial momentum and kinetic energy.
- Independent audit: `audit(state, t)` verifies mass, linear momentum, angular momentum, and total energy.
- Exact floating-point math: All running ledger reductions use `math.fsum` with deterministic iteration.
"""

import math
from typing import Any
import numpy as np

from octo.core import constants
from octo.core.exchange import ComponentId, Exchange
from octo.core.flags import Flag
from octo.core.state import State
from octo.core.thresholds import get_threshold_value


class LedgerBookingError(ValueError):
    """Raised when an Exchange violates conservation or structural booking rules."""


EXHAUST_SINK_IDS = {"Exhaust", "Radiation", "Space"}


def _fsum_vec3(vectors: list[np.ndarray]) -> np.ndarray:
    """Compute exact component-wise sum of 3D vectors using math.fsum in fixed order."""
    if not vectors:
        out = np.zeros(3, dtype=np.float64)
        out.setflags(write=False)
        return out
    x = math.fsum(float(v[0]) for v in vectors)
    y = math.fsum(float(v[1]) for v in vectors)
    z = math.fsum(float(v[2]) for v in vectors)
    out = np.array([x, y, z], dtype=np.float64)
    out.setflags(write=False)
    return out


class Ledger:
    """Central conservation ledger for forces, torques, mass expulsion, and energy."""

    def __init__(
        self,
        initial_state: State,
        thresholds: dict[str, dict[str, dict[str, Any]]],
        g_const: float = constants.G,
    ) -> None:
        self._thresholds = thresholds
        self._g_const = float(g_const)
        self._current_state = initial_state
        self._known_bodies: tuple[ComponentId, ...] = tuple(initial_state.body_names())
        self._initial_state_snapshot = initial_state.clone()

        # Per-step force and torque accumulators (list of vectors per component for math.fsum)
        self._step_forces: dict[ComponentId, list[np.ndarray]] = {}
        self._step_torques: dict[ComponentId, list[np.ndarray]] = {}
        self._step_exchanges: list[Exchange] = []
        self.begin_step()

        # Running cumulative histories (stored as lists of floats/vectors for exact math.fsum)
        self._expelled_mass_terms: list[float] = []
        self._exhaust_momentum_terms: list[np.ndarray] = []
        self._exhaust_ang_mom_terms: list[np.ndarray] = []
        self._exhaust_ke_terms: list[float] = []
        self._heat_terms: list[float] = []
        self._power_in_terms: list[float] = []
        self._custom_scalars: dict[str, list[float]] = {}

        all_actor_ids = list(self._known_bodies) + [s for s in EXHAUST_SINK_IDS if s not in self._known_bodies]
        self._actor_impulse_x: dict[ComponentId, list[float]] = {a: [] for a in all_actor_ids}
        self._actor_impulse_y: dict[ComponentId, list[float]] = {a: [] for a in all_actor_ids}
        self._actor_impulse_z: dict[ComponentId, list[float]] = {a: [] for a in all_actor_ids}
        self._actor_scalar_impulse: dict[ComponentId, list[float]] = {a: [] for a in all_actor_ids}
        self._actor_ang_impulse_z: dict[ComponentId, list[float]] = {a: [] for a in all_actor_ids}
        self._actor_energy_supplied: dict[ComponentId, list[float]] = {a: [] for a in all_actor_ids}
        self._actor_energy_received: dict[ComponentId, list[float]] = {a: [] for a in all_actor_ids}
        self._actor_heat_dissipated: dict[ComponentId, list[float]] = {a: [] for a in all_actor_ids}
        self._actor_mass_supplied: dict[ComponentId, list[float]] = {a: [] for a in all_actor_ids}
        self._actor_mass_absorbed: dict[ComponentId, list[float]] = {a: [] for a in all_actor_ids}

        # Compute initial conservation baselines from initial_state
        (
            self._init_mass_kg,
            self._init_momentum_vec,
            self._init_ang_mom_vec,
            self._init_total_energy_j,
            self._init_momentum_scale,
            self._init_ang_mom_scale,
            self._init_energy_scale,
        ) = self._compute_state_totals(initial_state)

    def begin_step(self) -> None:
        """Reset per-step force and torque accumulators while keeping cumulative totals."""
        self._step_forces = {name: [] for name in self._known_bodies}
        self._step_torques = {name: [] for name in self._known_bodies}
        for sink in EXHAUST_SINK_IDS:
            self._step_forces[sink] = []
            self._step_torques[sink] = []
        self._step_exchanges = []

    def _validate_component(self, comp_id: ComponentId) -> None:
        if comp_id is None or (isinstance(comp_id, str) and not comp_id.strip()):
            raise LedgerBookingError("Component ID cannot be empty.")
        if comp_id not in self._known_bodies and comp_id not in EXHAUST_SINK_IDS:
            raise LedgerBookingError(
                f"Exchange references unknown component {comp_id!r} not in State."
            )

    def book(self, exchange: Exchange, dt: float = 1.0) -> None:
        """Book an Exchange, automatically creating the equal-and-opposite reaction on `a`."""
        if not isinstance(exchange, Exchange):
            raise LedgerBookingError("book() requires an immutable Exchange instance.")

        if exchange.a == exchange.b:
            raise LedgerBookingError(
                f"Self-interaction rejected: component a and b are the same component ({exchange.a!r})."
            )

        self._validate_component(exchange.a)
        self._validate_component(exchange.b)

        dt_f = float(dt)
        if not math.isfinite(dt_f) or dt_f < 0.0:
            raise LedgerBookingError(f"Invalid step duration dt={dt!r}; must be finite and >= 0.")

        if (
            not math.isfinite(exchange.t)
            or not math.isfinite(exchange.power_in)
            or not math.isfinite(exchange.heat_out)
            or not math.isfinite(exchange.mass_out)
            or not np.all(np.isfinite(exchange.force_on_b))
            or not np.all(np.isfinite(exchange.point))
        ):
            raise LedgerBookingError("Exchange contains non-finite (NaN or infinite) values.")

        if exchange.mass_out < 0.0:
            raise LedgerBookingError("mass_out rate cannot be negative.")

        if exchange.exhaust_v is not None and not np.all(np.isfinite(exchange.exhaust_v)):
            raise LedgerBookingError("exhaust_v contains non-finite values.")

        # 1. Book force on b (+F) and equal-and-opposite reaction on a (-F)
        f_on_b = exchange.force_on_b
        f_on_a = exchange.reaction_on_a
        pt = exchange.point

        self._step_forces[exchange.b].append(f_on_b)
        self._step_forces[exchange.a].append(f_on_a)
        self._step_exchanges.append(exchange)

        # 2. Book torque r x F on b and r x (-F) on a
        tau_on_b = np.cross(pt, f_on_b)
        tau_on_a = np.cross(pt, f_on_a)
        self._step_torques[exchange.b].append(tau_on_b)
        self._step_torques[exchange.a].append(tau_on_a)

        # 2b. Per-actor cumulative impulse, angular impulse, power, heat, and mass flow
        if dt_f > 0.0:
            f_mag_dt = float(np.linalg.norm(f_on_b)) * dt_f
            self._actor_impulse_x[exchange.b].append(float(f_on_b[0]) * dt_f)
            self._actor_impulse_y[exchange.b].append(float(f_on_b[1]) * dt_f)
            self._actor_impulse_z[exchange.b].append(float(f_on_b[2]) * dt_f)
            self._actor_impulse_x[exchange.a].append(float(f_on_a[0]) * dt_f)
            self._actor_impulse_y[exchange.a].append(float(f_on_a[1]) * dt_f)
            self._actor_impulse_z[exchange.a].append(float(f_on_a[2]) * dt_f)
            self._actor_scalar_impulse[exchange.b].append(f_mag_dt)
            self._actor_scalar_impulse[exchange.a].append(f_mag_dt)
            self._actor_ang_impulse_z[exchange.b].append(float(tau_on_b[2]) * dt_f)
            self._actor_ang_impulse_z[exchange.a].append(float(tau_on_a[2]) * dt_f)

            if exchange.power_in != 0.0:
                de = exchange.power_in * dt_f
                self._actor_energy_supplied[exchange.a].append(de)
                self._actor_energy_received[exchange.b].append(de)
            if exchange.heat_out != 0.0:
                dh = exchange.heat_out * dt_f
                self._actor_heat_dissipated[exchange.b].append(dh)
                self._actor_heat_dissipated[exchange.a].append(dh)
            if exchange.mass_out > 0.0:
                dm_actor = exchange.mass_out * dt_f
                self._actor_mass_absorbed[exchange.a].append(dm_actor)
                self._actor_mass_supplied[exchange.b].append(dm_actor)

        # 3. Book power and heat over dt
        if exchange.power_in != 0.0:
            self._power_in_terms.append(exchange.power_in * dt_f)
        if exchange.heat_out != 0.0:
            self._heat_terms.append(exchange.heat_out * dt_f)

        # 4. Book expelled reaction mass, momentum, angular momentum, and kinetic energy
        if exchange.mass_out > 0.0 and dt_f > 0.0:
            if exchange.exhaust_v is None:
                raise LedgerBookingError(
                    "Exchange with mass_out > 0 must specify exhaust_v."
                )
            dm = exchange.mass_out * dt_f
            self._expelled_mass_terms.append(dm)

            # Determine parent body velocity to transform exhaust_v (relative to emitter)
            # into the inertial frame: v_exhaust_inertial = v_emitter + exhaust_v.
            emitter_id = (
                exchange.b
                if self._current_state.has_body(exchange.b)
                else exchange.a
            )
            if self._current_state.has_body(emitter_id):
                v_emitter = self._current_state.get_body(emitter_id).velocity_m_s
            else:
                v_emitter = np.zeros(3, dtype=np.float64)

            v_exhaust_inertial = v_emitter + exchange.exhaust_v
            dp_exhaust = dm * v_exhaust_inertial
            self._exhaust_momentum_terms.append(dp_exhaust)
            self._exhaust_ang_mom_terms.append(np.cross(pt, dp_exhaust))

            v_ex_sq = float(np.dot(v_exhaust_inertial, v_exhaust_inertial))
            self._exhaust_ke_terms.append(0.5 * dm * v_ex_sq)

    def net_force_on(
        self,
        component_id: ComponentId,
        exclude_sources: set[ComponentId] | None = None,
    ) -> np.ndarray:
        """Return read-only net force vector [N] on `component_id` in the current step.

        If `exclude_sources` is provided, omits exchanges where the other component is in `exclude_sources`.
        """
        self._validate_component(component_id)
        if exclude_sources is None:
            return _fsum_vec3(self._step_forces[component_id])
        matching_forces: list[np.ndarray] = []
        for ex in self._step_exchanges:
            if ex.b == component_id and ex.a not in exclude_sources:
                matching_forces.append(ex.force_on_b)
            elif ex.a == component_id and ex.b not in exclude_sources:
                matching_forces.append(ex.reaction_on_a)
        return _fsum_vec3(matching_forces)

    def net_torque_on(self, component_id: ComponentId) -> np.ndarray:
        """Return read-only net torque vector [N*m] on `component_id` about origin in the current step."""
        self._validate_component(component_id)
        return _fsum_vec3(self._step_torques[component_id])

    @property
    def total_expelled_mass_kg(self) -> float:
        """Cumulative reaction mass expelled [kg] using math.fsum."""
        return math.fsum(self._expelled_mass_terms)

    @property
    def total_heat_booked_j(self) -> float:
        """Cumulative dissipated heat booked [J] using math.fsum."""
        return math.fsum(self._heat_terms)

    @property
    def total_exhaust_momentum_kg_m_s(self) -> np.ndarray:
        """Cumulative linear momentum carried by expelled mass [kg*m/s] using math.fsum."""
        return _fsum_vec3(self._exhaust_momentum_terms)

    @property
    def total_exhaust_angular_momentum_kg_m2_s(self) -> np.ndarray:
        """Cumulative angular momentum carried by expelled mass [kg*m^2/s] using math.fsum."""
        return _fsum_vec3(self._exhaust_ang_mom_terms)

    @property
    def total_exhaust_ke_j(self) -> float:
        """Cumulative kinetic energy booked into exhaust [J] using math.fsum."""
        return math.fsum(self._exhaust_ke_terms)

    def record_scalar_contribution(self, key: str, value: float) -> None:
        """Record a scalar contribution into named accumulator `key` for exact math.fsum summation."""
        if not math.isfinite(value):
            raise LedgerBookingError("Scalar contribution must be finite.")
        self._custom_scalars.setdefault(key, []).append(float(value))

    def get_scalar_total(self, key: str) -> float:
        """Return compensated math.fsum total for named accumulator `key`."""
        return math.fsum(self._custom_scalars.get(key, []))

    def summary_by_actor(self) -> dict[ComponentId, dict[str, Any]]:
        """Return per-actor cumulative impulse, angular impulse, energy, heat, and mass totals."""
        out: dict[ComponentId, dict[str, Any]] = {}
        for actor in self._actor_impulse_x:
            ix = math.fsum(self._actor_impulse_x[actor])
            iy = math.fsum(self._actor_impulse_y[actor])
            iz = math.fsum(self._actor_impulse_z[actor])
            out[actor] = {
                "net_impulse_vec_n_s": np.array([ix, iy, iz], dtype=np.float64),
                "scalar_impulse_n_s": math.fsum(self._actor_scalar_impulse[actor]),
                "net_ang_impulse_z_n_m_s": math.fsum(self._actor_ang_impulse_z[actor]),
                "energy_supplied_j": math.fsum(self._actor_energy_supplied[actor]),
                "energy_received_j": math.fsum(self._actor_energy_received[actor]),
                "heat_dissipated_j": math.fsum(self._actor_heat_dissipated[actor]),
                "mass_supplied_kg": math.fsum(self._actor_mass_supplied[actor]),
                "mass_absorbed_kg": math.fsum(self._actor_mass_absorbed[actor]),
            }
        return out

    def _compute_state_totals(
        self, state: State
    ) -> tuple[float, np.ndarray, np.ndarray, float, float, float, float]:
        """Independently compute mass, linear momentum, angular momentum, and energy from State."""
        bodies = [state.get_body(name) for name in self._known_bodies if state.has_body(name)]

        mass_terms: list[float] = [b.mass_kg for b in bodies]
        mom_vecs: list[np.ndarray] = [b.mass_kg * b.velocity_m_s for b in bodies]
        ang_mom_vecs: list[np.ndarray] = [
            np.cross(b.position_m, b.mass_kg * b.velocity_m_s) + b.angular_momentum_kg_m2_s
            for b in bodies
        ]
        ke_terms: list[float] = [
            0.5 * b.mass_kg * float(np.dot(b.velocity_m_s, b.velocity_m_s))
            for b in bodies
        ]

        pe_terms: list[float] = []
        n_bodies = len(bodies)
        for i in range(n_bodies):
            for j in range(i + 1, n_bodies):
                r_ij = float(np.linalg.norm(bodies[i].position_m - bodies[j].position_m))
                if r_ij > 0.0:
                    # Use exact GM_SUN when one of the bodies is Sun, else G * m_i * m_j
                    if bodies[i].name == "Sun":
                        pe_terms.append(-constants.GM_SUN * bodies[j].mass_kg / r_ij)
                    elif bodies[j].name == "Sun":
                        pe_terms.append(-constants.GM_SUN * bodies[i].mass_kg / r_ij)
                    else:
                        pe_terms.append(
                            -self._g_const * bodies[i].mass_kg * bodies[j].mass_kg / r_ij
                        )

        total_mass = math.fsum(mass_terms)
        total_mom = _fsum_vec3(mom_vecs)
        total_ang_mom = _fsum_vec3(ang_mom_vecs)

        energy_components = (
            ke_terms
            + pe_terms
            + [state.stored_energy_j, state.heat_energy_j, state.radiated_energy_j]
        )
        total_energy = math.fsum(energy_components)

        # Characteristic normalization scales to avoid divide-by-zero when net momentum is 0
        mom_scale = max(
            math.fsum(float(np.linalg.norm(v)) for v in mom_vecs),
            1.0,
        )
        ang_mom_scale = max(
            math.fsum(float(np.linalg.norm(v)) for v in ang_mom_vecs),
            1.0,
        )
        energy_scale = max(
            math.fsum(abs(x) for x in ke_terms + pe_terms + [state.stored_energy_j]),
            1.0,
        )

        return (
            total_mass,
            total_mom,
            total_ang_mom,
            total_energy,
            mom_scale,
            ang_mom_scale,
            energy_scale,
        )

    def audit(self, state: State, t: float) -> list[Flag]:
        """Independently audit State against initial conservation baselines and config tolerances."""
        max_energy_rel = float(
            get_threshold_value(self._thresholds, "conservation", "max_energy_rel_error")
        )
        max_mom_rel = float(
            get_threshold_value(self._thresholds, "conservation", "max_momentum_rel_error")
        )
        max_mass_rel = float(
            get_threshold_value(self._thresholds, "conservation", "max_mass_rel_error")
        )

        (
            curr_body_mass,
            curr_body_mom,
            curr_body_ang_mom,
            curr_state_energy,
            curr_mom_scale,
            curr_ang_mom_scale,
            curr_energy_scale,
        ) = self._compute_state_totals(state)

        flags: list[Flag] = []

        # 1. Mass conservation: current body mass + cumulative expelled mass == initial mass
        total_mass_now = math.fsum([curr_body_mass, self.total_expelled_mass_kg])
        mass_rel_err = abs(total_mass_now - self._init_mass_kg) / max(self._init_mass_kg, 1.0)
        if mass_rel_err > max_mass_rel:
            flags.append(
                Flag(
                    code="MASS_DRIFT",
                    t=float(t),
                    source="ledger",
                    quantity="conservation.max_mass_rel_error",
                    value=float(mass_rel_err),
                    limit=max_mass_rel,
                )
            )

        # 2. Linear momentum conservation: body momentum + exhaust momentum == initial momentum
        total_mom_now = _fsum_vec3([curr_body_mom, self.total_exhaust_momentum_kg_m_s])
        mom_diff = float(np.linalg.norm(total_mom_now - self._init_momentum_vec))
        mom_denom = max(self._init_momentum_scale, curr_mom_scale)
        mom_rel_err = mom_diff / mom_denom
        if mom_rel_err > max_mom_rel:
            flags.append(
                Flag(
                    code="MOMENTUM_DRIFT",
                    t=float(t),
                    source="ledger",
                    quantity="conservation.max_momentum_rel_error",
                    value=float(mom_rel_err),
                    limit=max_mom_rel,
                )
            )

        # 3. Angular momentum conservation: body L + exhaust L == initial L
        total_ang_mom_now = _fsum_vec3(
            [curr_body_ang_mom, self.total_exhaust_angular_momentum_kg_m2_s]
        )
        ang_mom_diff = float(np.linalg.norm(total_ang_mom_now - self._init_ang_mom_vec))
        ang_mom_denom = max(self._init_ang_mom_scale, curr_ang_mom_scale)
        ang_mom_rel_err = ang_mom_diff / ang_mom_denom
        if ang_mom_rel_err > max_mom_rel:
            flags.append(
                Flag(
                    code="ANGULAR_MOMENTUM_DRIFT",
                    t=float(t),
                    source="ledger",
                    quantity="conservation.max_momentum_rel_error",
                    value=float(ang_mom_rel_err),
                    limit=max_mom_rel,
                )
            )

        # 4. Total Energy conservation: State energy + exhaust KE + booked heat == initial energy
        # Note: if Rocket is moving in inertial frame, work done on rocket + exhaust KE in inertial
        # frame equals jet energy. When rocket starts at v != 0, inertial exhaust KE differs from
        # relative jet work by the work-energy cross term; we compute exact work/energy closure.
        total_energy_now = math.fsum(
            [curr_state_energy, self.total_exhaust_ke_j, self.total_heat_booked_j]
        )
        energy_diff = abs(total_energy_now - self._init_total_energy_j)
        energy_denom = max(self._init_energy_scale, curr_energy_scale)
        energy_rel_err = energy_diff / energy_denom
        if energy_rel_err > max_energy_rel:
            flags.append(
                Flag(
                    code="ENERGY_DRIFT",
                    t=float(t),
                    source="ledger",
                    quantity="conservation.max_energy_rel_error",
                    value=float(energy_rel_err),
                    limit=max_energy_rel,
                )
            )

        return flags
