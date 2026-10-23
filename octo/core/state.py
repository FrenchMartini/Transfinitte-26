"""Deterministic simulation State container (all SI units)."""

from dataclasses import dataclass, field
from typing import Iterator
import numpy as np

from octo.core.exchange import ComponentId


def _to_vec3(arr: np.ndarray | list[float] | tuple[float, ...]) -> np.ndarray:
    """Convert 2D or 3D sequence into a mutable 3D float64 NumPy array."""
    v = np.asarray(arr, dtype=np.float64).reshape(-1)
    if v.size == 2:
        return np.array([v[0], v[1], 0.0], dtype=np.float64)
    if v.size == 3:
        return np.array([v[0], v[1], v[2]], dtype=np.float64)
    raise ValueError(f"Expected 2D or 3D vector, got shape {v.shape}.")


@dataclass
class BodyState:
    """Physical state of a single body or structural component in SI units."""

    name: ComponentId
    mass_kg: float
    position_m: np.ndarray
    velocity_m_s: np.ndarray
    angular_momentum_kg_m2_s: np.ndarray = field(
        default_factory=lambda: np.zeros(3, dtype=np.float64)
    )

    def __post_init__(self) -> None:
        self.mass_kg = float(self.mass_kg)
        self.position_m = _to_vec3(self.position_m)
        self.velocity_m_s = _to_vec3(self.velocity_m_s)
        self.angular_momentum_kg_m2_s = _to_vec3(self.angular_momentum_kg_m2_s)

    def clone(self) -> "BodyState":
        """Return a deep copy of this body state."""
        return BodyState(
            name=self.name,
            mass_kg=self.mass_kg,
            position_m=self.position_m.copy(),
            velocity_m_s=self.velocity_m_s.copy(),
            angular_momentum_kg_m2_s=self.angular_momentum_kg_m2_s.copy(),
        )


@dataclass
class State:
    """Shared deterministic state read by drivers and audited by the Ledger.

    Bodies are stored in a regular Python dict preserving deterministic insertion order.
    """

    t: float = 0.0
    stored_energy_j: float = 0.0
    heat_energy_j: float = 0.0
    radiated_energy_j: float = 0.0
    _bodies: dict[ComponentId, BodyState] = field(default_factory=dict)

    def add_body(self, body: BodyState) -> None:
        """Register or replace a body in deterministic order."""
        self._bodies[body.name] = body.clone()

    def get_body(self, name: ComponentId) -> BodyState:
        """Retrieve a body by ID, raising KeyError if not present."""
        if name not in self._bodies:
            raise KeyError(f"Body {name!r} not found in State.")
        return self._bodies[name]

    def has_body(self, name: ComponentId) -> bool:
        """Return True if body `name` exists in State."""
        return name in self._bodies

    def body_names(self) -> Iterator[ComponentId]:
        """Iterate over body IDs in deterministic insertion order."""
        return iter(self._bodies.keys())

    def bodies(self) -> Iterator[BodyState]:
        """Iterate over BodyState objects in deterministic insertion order."""
        return iter(self._bodies.values())

    def clone(self) -> "State":
        """Return a deep copy of the entire State."""
        copied = State(
            t=float(self.t),
            stored_energy_j=float(self.stored_energy_j),
            heat_energy_j=float(self.heat_energy_j),
            radiated_energy_j=float(self.radiated_energy_j),
        )
        for body in self._bodies.values():
            copied.add_body(body)
        return copied
