"""Price sensor for Sähkön hinta nyt."""

from __future__ import annotations

from typing import Any

from homeassistant.components.sensor import SensorEntity, SensorStateClass
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from . import SahkonHintaConfigEntry
from .entity import SahkonHintaEntity


async def async_setup_entry(
    hass: HomeAssistant, entry: SahkonHintaConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    async_add_entities([SahkonHintaSensor(entry.runtime_data)])


class SahkonHintaSensor(SahkonHintaEntity, SensorEntity):
    """Current spot price in snt/kWh (VAT included)."""

    # Named so the entity id becomes sensor.sahkon_hinta_nyt (same as the YAML package),
    # which the Sähkön hinta card and the blueprints use by default.
    _attr_name = "Sähkön hinta nyt"
    _attr_icon = "mdi:flash"
    _attr_native_unit_of_measurement = "snt/kWh"
    _attr_state_class = SensorStateClass.MEASUREMENT
    _attr_suggested_display_precision = 2
    # Price lists are large and change daily; keep them out of the recorder database.
    _unrecorded_attributes = frozenset({"raw_today", "raw_tomorrow"})

    def __init__(self, coordinator) -> None:
        super().__init__(coordinator, "price")

    @property
    def native_value(self) -> float | None:
        value = self.coordinator.data.get("state")
        try:
            return float(value)
        except (TypeError, ValueError):
            return None

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        return dict(self.coordinator.data.get("attributes") or {})
