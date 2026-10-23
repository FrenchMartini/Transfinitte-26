"""Swappable propulsion interface (all SI units).

Exposes both a functional interface `zero_thrust_propulsion` and a class
`PropulsionModel` taking (time, position, velocity, mass) and returning
(thrust_vector_N, power_W, mass_flow_kg_s, exhaust_velocity_m_s).
"""

from typing import Callable
import numpy as np

PropulsionReturn = tuple[np.ndarray, float, float, float]
PropulsionCallable = Callable[[float, np.ndarray, np.ndarray, float], PropulsionReturn]


def zero_thrust_propulsion(
    time_s: float,
    position_m: np.ndarray,
    velocity_m_s: np.ndarray,
    mass_kg: float,
) -> PropulsionReturn:
    """Stub propulsion function returning zero thrust in SI units."""
    _ = (time_s, position_m, velocity_m_s, mass_kg)
    return np.zeros(2, dtype=float), 0.0, 0.0, 0.0


class PropulsionModel:
    """Callable propulsion class wrapping the swappable propulsion interface."""

    def __init__(
        self,
        exhaust_velocity_m_s: float = 0.0,
        mass_flow_kg_s: float = 0.0,
        efficiency: float = 1.0,
    ) -> None:
        self.exhaust_velocity_m_s = float(exhaust_velocity_m_s)
        self.mass_flow_kg_s = float(mass_flow_kg_s)
        self.efficiency = float(efficiency)

    def __call__(
        self,
        time_s: float,
        position_m: np.ndarray,
        velocity_m_s: np.ndarray,
        mass_kg: float,
    ) -> PropulsionReturn:
        _ = (time_s, position_m, mass_kg)
        if self.mass_flow_kg_s <= 0.0 or self.exhaust_velocity_m_s <= 0.0:
            return np.zeros(2, dtype=float), 0.0, 0.0, 0.0

        v_vec = np.asarray(velocity_m_s, dtype=float)
        v_norm = float(np.linalg.norm(v_vec))
        if v_norm == 0.0:
            direction = np.array([0.0, 1.0], dtype=float)
        else:
            direction = v_vec / v_norm

        thrust_mag = self.mass_flow_kg_s * self.exhaust_velocity_m_s
        thrust_vec = thrust_mag * direction
        jet_power_w = 0.5 * self.mass_flow_kg_s * (self.exhaust_velocity_m_s**2)
        total_power_w = jet_power_w / self.efficiency if self.efficiency > 0.0 else jet_power_w
        return thrust_vec, float(total_power_w), self.mass_flow_kg_s, self.exhaust_velocity_m_s
