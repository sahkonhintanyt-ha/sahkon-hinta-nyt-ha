"""Sähkön hinta nyt – Finnish spot electricity price."""

from __future__ import annotations

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant
from homeassistant.loader import async_get_integration

from .const import DOMAIN
from .coordinator import SahkonHintaCoordinator
from .frontend import async_register_card, async_unregister_card

PLATFORMS: list[Platform] = [Platform.SENSOR, Platform.BINARY_SENSOR]

type SahkonHintaConfigEntry = ConfigEntry[SahkonHintaCoordinator]


async def async_setup_entry(hass: HomeAssistant, entry: SahkonHintaConfigEntry) -> bool:
    integration = await async_get_integration(hass, DOMAIN)
    await async_register_card(hass, str(integration.version))

    coordinator = SahkonHintaCoordinator(hass, entry)
    await coordinator.async_config_entry_first_refresh()
    entry.runtime_data = coordinator
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    entry.async_on_unload(entry.add_update_listener(_async_reload))
    return True


async def async_unload_entry(hass: HomeAssistant, entry: SahkonHintaConfigEntry) -> bool:
    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)


async def async_remove_entry(hass: HomeAssistant, entry: SahkonHintaConfigEntry) -> None:
    """Remove the card resource when the last entry is deleted."""
    if not hass.config_entries.async_entries(DOMAIN):
        await async_unregister_card(hass)


async def _async_reload(hass: HomeAssistant, entry: SahkonHintaConfigEntry) -> None:
    await hass.config_entries.async_reload(entry.entry_id)
