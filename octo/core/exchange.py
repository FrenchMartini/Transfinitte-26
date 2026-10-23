"""Immutable Exchange contract (ARCHITECTURE.md Section 6)."""

from dataclasses import dataclass
import numpy as np

ComponentId = str | int
DriverId = str


def _to_readonly_vec3(arr: np.ndarray | list[float] | tuple[float, ...]) -> np.ndarray:
    """Convert 2D or 3D sequence into a read-only 3D float64 NumPy array."""
    v = np.asarray(arr, dtype=np.float64).reshape(-1)
    if v.size == 2:
        out = np.array([v[0], v[1], 0.0], dtype=np.float64)
    elif v.size == 3:
        out = np.array([v[0], v[1], v[2]], dtype=np.float64)
    else:
        raise ValueError(f"Expected 2D or 3D vector, got shape {v.shape}.")
    out.setflags(write=False)
    return out


@dataclass(frozen=True, slots=True)
class Exchange:
    """Immutable physical interaction between component `a` (exerts) and `b` (receives).

    All values are in SI units:
      t:          simulation time [s]
      a:          exerting component ID
      b:          receiving component ID
      force_on_b: 3D force vector exerted by `a` on `b` [N]
      point:      3D application point in inertial frame [m], used for torque
      power_in:   power delivered by a power source [W]
      heat_out:   thermal power dissipated [W]
      mass_out:   reaction mass expelled rate [kg/s]
      exhaust_v:  optional 3D exhaust velocity relative to `a` [m/s]
      owner:      driver ID that booked the exchange
    """

    t: float
    a: ComponentId
    b: ComponentId
    force_on_b: np.ndarray
    point: np.ndarray
    power_in: float = 0.0
    heat_out: float = 0.0
    mass_out: float = 0.0
    exhaust_v: np.ndarray | None = None
    owner: DriverId = ""

    def __post_init__(self) -> None:
        object.__setattr__(self, "t", float(self.t))
        object.__setattr__(self, "force_on_b", _to_readonly_vec3(self.force_on_b))
        object.__setattr__(self, "point", _to_readonly_vec3(self.point))
        object.__setattr__(self, "power_in", float(self.power_in))
        object.__setattr__(self, "heat_out", float(self.heat_out))
        object.__setattr__(self, "mass_out", float(self.mass_out))
        if self.exhaust_v is not None:
            object.__setattr__(self, "exhaust_v", _to_readonly_vec3(self.exhaust_v))
        object.__setattr__(self, "owner", str(self.owner))

    @property
    def reaction_on_a(self) -> np.ndarray:
        """Equal and opposite reaction force exerted by `b` on `a` [N]."""
        react = -self.force_on_b
        react.setflags(write=False)
        return react
