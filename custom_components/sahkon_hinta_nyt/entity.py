"""Base entity for Sähkön hinta nyt."""

from __future__ import annotations

from homeassistant.helpers.device_registry import DeviceEntryType, DeviceInfo
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import ATTRIBUTION, DOMAIN, SITE_URL
from .coordinator import SahkonHintaCoordinator


class SahkonHintaEntity(CoordinatorEntity[SahkonHintaCoordinator]):
    """Common device info and attribution."""

    _attr_attribution = ATTRIBUTION

    def __init__(self, coordinator: SahkonHintaCoordinator, key: str) -> None:
        super().__init__(coordinator)
        self._attr_unique_id = f"{coordinator.entry.entry_id}_{key}"
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, coordinator.entry.entry_id)},
            name="Sähkön hinta nyt",
            manufacturer="sähkönhintanyt.org",
            model=f"Pörssisähkö {coordinator.zone}",
            entry_type=DeviceEntryType.SERVICE,
            configuration_url=SITE_URL,
        )
