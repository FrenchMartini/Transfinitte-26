"""SI unit conversion helpers and boundary unit wrappers.

Unit system and safety contracts:
- Strict SI base math: All internal simulation math uses raw floats and NumPy float64 arrays.
- Boundary typing: Strongly-typed wrappers enforce physical dimensional safety at IO boundaries.
- Type mismatch prevention: Mixing incompatible units raises UnitMismatchError immediately.
"""

from dataclasses import dataclass
import math
from typing import Self
from octo.core import constants


class UnitMismatchError(TypeError):
    """Raised when arithmetic or comparison is attempted between incompatible physical unit wrappers."""


@dataclass(frozen=True, slots=True)
class Quantity:
    """Base immutable SI scalar quantity wrapper."""

    value: float

    def __post_init__(self) -> None:
        object.__setattr__(self, "value", float(self.value))

    def _check_same_unit(self, other: object) -> None:
        if type(self) is not type(other):
            raise UnitMismatchError(
                f"Cannot combine {type(self).__name__} with {type(other).__name__}."
            )

    def __float__(self) -> float:
        return self.value

    def __add__(self, other: Self) -> Self:
        self._check_same_unit(other)
        return type(self)(self.value + other.value)

    def __sub__(self, other: Self) -> Self:
        self._check_same_unit(other)
        return type(self)(self.value - other.value)

    def __mul__(self, factor: float | int) -> Self:
        if isinstance(factor, Quantity):
            raise UnitMismatchError(
                f"Cannot multiply {type(self).__name__} by {type(factor).__name__} without explicit unit conversion."
            )
        return type(self)(self.value * float(factor))

    def __rmul__(self, factor: float | int) -> Self:
        return self.__mul__(factor)

    def __truediv__(self, divisor: float | int) -> Self:
        if isinstance(divisor, Quantity):
            raise UnitMismatchError(
                f"Cannot divide {type(self).__name__} by {type(divisor).__name__} without explicit unit conversion."
            )
        return type(self)(self.value / float(divisor))

    def __lt__(self, other: Self) -> bool:
        self._check_same_unit(other)
        return self.value < other.value

    def __le__(self, other: Self) -> bool:
        self._check_same_unit(other)
        return self.value <= other.value

    def __gt__(self, other: Self) -> bool:
        self._check_same_unit(other)
        return self.value > other.value

    def __ge__(self, other: Self) -> bool:
        self._check_same_unit(other)
        return self.value >= other.value


class Meters(Quantity):
    """SI length [m]."""


class Kilograms(Quantity):
    """SI mass [kg]."""


class Seconds(Quantity):
    """SI time [s]."""


class Newtons(Quantity):
    """SI force [N]."""


class Joules(Quantity):
    """SI energy [J]."""


class Watts(Quantity):
    """SI power [W]."""


class Teslas(Quantity):
    """SI magnetic flux density [T]."""


class Amperes(Quantity):
    """SI electric current [A]."""


class Pascals(Quantity):
    """SI pressure or stress [Pa]."""


class Radians(Quantity):
    """Plane angle in radians [rad]."""


class Degrees(Quantity):
    """Plane angle in degrees [deg]."""


class MetersPerSecond(Quantity):
    """SI velocity [m/s]."""


class MetersPerSecondSquared(Quantity):
    """SI acceleration [m/s^2]."""


def degrees_to_radians(deg: float) -> float:
    """Convert degrees [deg] to radians [rad]."""
    return math.radians(float(deg))


def radians_to_degrees(rad: float) -> float:
    """Convert radians [rad] to degrees [deg]."""
    return math.degrees(float(rad))


def au_to_meters(au_val: float) -> float:
    """Convert Astronomical Units [AU] to SI meters [m]."""
    return float(au_val) * constants.AU


def meters_to_au(meters_val: float) -> float:
    """Convert SI meters [m] to Astronomical Units [AU]."""
    return float(meters_val) / constants.AU


def years_to_seconds(years_val: float) -> float:
    """Convert Julian years [yr] to SI seconds [s]."""
    return float(years_val) * constants.YEAR


def seconds_to_years(seconds_val: float) -> float:
    """Convert SI seconds [s] to Julian years [yr]."""
    return float(seconds_val) / constants.YEAR


def km_to_meters(km_val: float) -> float:
    """Convert kilometers [km] to SI meters [m]."""
    return float(km_val) * 1000.0


def meters_to_km(meters_val: float) -> float:
    """Convert SI meters [m] to kilometers [km]."""
    return float(meters_val) / 1000.0
