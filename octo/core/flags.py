"""Flag contract and FlagRegistry for audit limit tracking and enabler matching.

Flag and enabler contracts:
- Flag records: Immutable instances capturing violation code, timestamp, source, and values.
- Enabler matching: `FlagRegistry` maps raised flags to declared hypothetical enablers.
- Enabler limits: Strictly enforces at most 3 declared enablers per competition rules.
- Audit verdict: Any unexplained or mismatched flag results in an unresolved audit failure.
"""

from dataclasses import dataclass, replace
from pathlib import Path
from typing import Any
import yaml


class EnablerValidationError(ValueError):
    """Raised when hypothetical_enablers.yaml violates schema or exceeds max 3 enablers."""


@dataclass(frozen=True, slots=True)
class Flag:
    """Record of a threshold or conservation violation raised by a driver or the Ledger."""

    code: str
    t: float
    source: str
    quantity: str
    value: float
    limit: float
    enabler_id: str | None = None

    def __post_init__(self) -> None:
        object.__setattr__(self, "code", str(self.code))
        object.__setattr__(self, "t", float(self.t))
        object.__setattr__(self, "source", str(self.source))
        object.__setattr__(self, "quantity", str(self.quantity))
        object.__setattr__(self, "value", float(self.value))
        object.__setattr__(self, "limit", float(self.limit))


@dataclass(frozen=True, slots=True)
class HypotheticalEnabler:
    """Declared impossible assumption from config/hypothetical_enablers.yaml."""

    id: str
    name: str
    relaxes: tuple[str, ...]
    value: float
    justification: str
    sources: tuple[str, ...]
    units: str = ""
    efficiency: str = ""


class FlagRegistry:
    """Matches raised Flags against declared hypothetical enablers (max 3)."""

    MAX_ENABLERS = 3

    def __init__(
        self,
        enablers_data: dict[str, Any] | list[Any] | tuple[Any, ...] | None = None,
        thresholds: dict[str, Any] | None = None,
    ) -> None:
        raw_list: list[Any] = []
        if enablers_data is None:
            raw_list = []
        elif isinstance(enablers_data, dict):
            if "enablers" not in enablers_data or not isinstance(enablers_data["enablers"], list):
                raise EnablerValidationError("Enablers config must contain an 'enablers' list.")
            raw_list = enablers_data["enablers"]
        elif isinstance(enablers_data, (list, tuple)):
            raw_list = list(enablers_data)
        else:
            raise EnablerValidationError("Invalid enablers_data type.")

        if len(raw_list) > self.MAX_ENABLERS:
            raise EnablerValidationError(
                f"At most {self.MAX_ENABLERS} hypothetical enablers are allowed; got {len(raw_list)}."
            )

        # Build valid threshold keys if thresholds are provided
        valid_threshold_keys: set[str] | None = None
        if thresholds is not None:
            valid_threshold_keys = set()
            for cat, entries in thresholds.items():
                if isinstance(entries, dict):
                    for k in entries.keys():
                        valid_threshold_keys.add(f"{cat}.{k}")

        self._enablers: list[HypotheticalEnabler] = []
        seen_ids: set[str] = set()
        for item in raw_list:
            if isinstance(item, HypotheticalEnabler):
                if item.id in seen_ids:
                    raise EnablerValidationError(f"Duplicate enabler id {item.id!r}.")
                seen_ids.add(item.id)
                if valid_threshold_keys is not None:
                    for q in item.relaxes:
                        if q not in valid_threshold_keys:
                            raise EnablerValidationError(
                                f"Enabler '{item.id}' relaxes unknown threshold key '{q}' not found in rulebook_thresholds.yaml."
                            )
                self._enablers.append(item)
                continue
            if not isinstance(item, dict):
                raise EnablerValidationError("Each enabler entry must be a mapping or HypotheticalEnabler.")
            for req in ("id", "name", "relaxes", "value", "justification", "sources"):
                if req not in item:
                    raise EnablerValidationError(f"Enabler entry missing required field '{req}'.")
            enabler_id = str(item["id"]).strip()
            if not enabler_id:
                raise EnablerValidationError("Enabler 'id' must be non-empty.")
            if enabler_id in seen_ids:
                raise EnablerValidationError(f"Duplicate enabler id {enabler_id!r}.")
            seen_ids.add(enabler_id)
            if not isinstance(item["relaxes"], list) or not item["relaxes"]:
                raise EnablerValidationError(f"Enabler '{enabler_id}' field 'relaxes' must be a non-empty list.")

            relaxes_tuple = tuple(str(q) for q in item["relaxes"])
            if valid_threshold_keys is not None:
                for q in relaxes_tuple:
                    if q not in valid_threshold_keys:
                        raise EnablerValidationError(
                            f"Enabler '{enabler_id}' relaxes unknown threshold key '{q}' not found in rulebook_thresholds.yaml."
                        )

            # Parse numeric value and units
            val_raw = item["value"]
            units_field = str(item.get("units", "")).strip()
            if isinstance(val_raw, (int, float)):
                num_val = float(val_raw)
                val_units = units_field
            elif isinstance(val_raw, str):
                parts = val_raw.strip().split(maxsplit=1)
                try:
                    num_val = float(parts[0])
                    val_units = units_field or (parts[1] if len(parts) > 1 else "")
                except ValueError:
                    raise EnablerValidationError(
                        f"Enabler '{enabler_id}' value {val_raw!r} cannot be parsed as numeric."
                    )
            else:
                raise EnablerValidationError(
                    f"Enabler '{enabler_id}' value must be numeric or string with units."
                )

            efficiency_field = str(item.get("efficiency", "")).strip()

            self._enablers.append(
                HypotheticalEnabler(
                    id=enabler_id,
                    name=str(item["name"]),
                    relaxes=relaxes_tuple,
                    value=num_val,
                    justification=str(item["justification"]),
                    sources=tuple(str(s) for s in item["sources"]),
                    units=val_units,
                    efficiency=efficiency_field,
                )
            )

        self._flags: list[Flag] = []

    @classmethod
    def from_yaml(
        cls,
        path: str | Path,
        thresholds: dict[str, Any] | None = None,
    ) -> "FlagRegistry":
        """Load hypothetical_enablers.yaml, verify every relaxes key against thresholds, and return a FlagRegistry."""
        p = Path(path)
        data = yaml.safe_load(p.read_text())
        if thresholds is None:
            from octo.core.thresholds import load_thresholds
            thresholds = load_thresholds()
        return cls(data, thresholds=thresholds)

    @property
    def enablers(self) -> tuple[HypotheticalEnabler, ...]:
        """Return declared enablers."""
        return tuple(self._enablers)

    @staticmethod
    def _enabler_covers_flag(enabler: HypotheticalEnabler, flag: Flag) -> bool:
        """Return True if `enabler` relaxes `flag.quantity` and covers `flag.value`."""
        if flag.quantity not in enabler.relaxes:
            return False
        # Upper-bound violation (value > limit): enabler capability must be >= flag.value
        if flag.value > flag.limit:
            return flag.value <= enabler.value
        # Lower-bound violation (value < limit): enabler capability must be <= flag.value
        if flag.value < flag.limit:
            return flag.value >= enabler.value
        return True

    def register(self, flag: Flag) -> Flag:
        """Evaluate a Flag against declared enablers, record it, and return the resolved Flag."""
        matched_id: str | None = None
        for enabler in self._enablers:
            if self._enabler_covers_flag(enabler, flag):
                matched_id = enabler.id
                break

        resolved = replace(flag, enabler_id=matched_id)
        self._flags.append(resolved)
        return resolved

    def register_many(self, flags: list[Flag]) -> list[Flag]:
        """Register a sequence of flags in deterministic order."""
        return [self.register(f) for f in flags]

    @property
    def all_flags(self) -> list[Flag]:
        """Return all registered flags (both allowed and unresolved)."""
        return list(self._flags)

    @property
    def allowed_flags(self) -> list[Flag]:
        """Return flags excused by a declared hypothetical enabler."""
        return [f for f in self._flags if f.enabler_id is not None]

    @property
    def unresolved_flags(self) -> list[Flag]:
        """Return flags not explained by any declared hypothetical enabler."""
        return [f for f in self._flags if f.enabler_id is None]

    def has_unresolved_flags(self) -> bool:
        """Return True if any registered flag has no matching enabler."""
        return any(f.enabler_id is None for f in self._flags)
