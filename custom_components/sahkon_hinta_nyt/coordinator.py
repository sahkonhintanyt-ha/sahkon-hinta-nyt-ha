"""Data coordinator for Sähkön hinta nyt."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

import aiohttp

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .const import (
    API_BASE,
    CONF_CHEAP_HOURS,
    CONF_ZONE,
    DEFAULT_CHEAP_HOURS,
    DEFAULT_ZONE,
    DOMAIN,
    UPDATE_INTERVAL,
)

_LOGGER = logging.getLogger(__name__)


class SahkonHintaCoordinator(DataUpdateCoordinator[dict[str, Any]]):
    """Fetch the current price and the cheap-hours flag from the free API."""

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        super().__init__(hass, _LOGGER, name=DOMAIN, update_interval=UPDATE_INTERVAL)
        self.entry = entry
        self._session = async_get_clientsession(hass)

    @property
    def zone(self) -> str:
        return self.entry.data.get(CONF_ZONE, DEFAULT_ZONE)

    @property
    def cheap_hours(self) -> int:
        return int(self.entry.options.get(CONF_CHEAP_HOURS, self.entry.data.get(CONF_CHEAP_HOURS, DEFAULT_CHEAP_HOURS)))

    async def _get(self, path: str, params: dict[str, Any]) -> dict[str, Any]:
        async with asyncio.timeout(20):
            async with self._session.get(
                f"{API_BASE}/{path}",
                params=params,
                headers={"User-Agent": "HomeAssistant-sahkon_hinta_nyt/1.0"},
            ) as resp:
                resp.raise_for_status()
                return await resp.json(content_type=None)

    async def _async_update_data(self) -> dict[str, Any]:
        try:
            price, cheap = await asyncio.gather(
                self._get("ha", {"zone": self.zone}),
                self._get("is-cheap", {"zone": self.zone, "hours": self.cheap_hours}),
            )
        except (aiohttp.ClientError, TimeoutError, ValueError) as err:
            raise UpdateFailed(f"Sähkön hinta API error: {err}") from err

        if not isinstance(price, dict) or "state" not in price:
            raise UpdateFailed("Unexpected response from the price API")

        return {
            "state": price.get("state"),
            "attributes": price.get("attributes") or {},
            "cheap": bool(cheap.get("cheap")) if isinstance(cheap, dict) else None,
        }
