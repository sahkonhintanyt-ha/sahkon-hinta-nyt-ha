"""Cheap-hours binary sensor for Sähkön hinta nyt."""

from __future__ import annotations

from homeassistant.components.binary_sensor import BinarySensorEntity
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from . import SahkonHintaConfigEntry
from .entity import SahkonHintaEntity


async def async_setup_entry(
    hass: HomeAssistant, entry: SahkonHintaConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    async_add_entities([SahkoHalpaaBinarySensor(entry.runtime_data)])


class SahkoHalpaaBinarySensor(SahkonHintaEntity, BinarySensorEntity):
    """On during the cheapest hours of the day."""

    # Entity id becomes binary_sensor.sahko_halpaa (same as the YAML package).
    _attr_name = "Sähkö halpaa"
    _attr_icon = "mdi:piggy-bank"

    def __init__(self, coordinator) -> None:
        super().__init__(coordinator, "cheap")

    @property
    def is_on(self) -> bool | None:
        return self.coordinator.data.get("cheap")

    @property
    def extra_state_attributes(self) -> dict[str, int]:
        return {"cheap_hours": self.coordinator.cheap_hours}
