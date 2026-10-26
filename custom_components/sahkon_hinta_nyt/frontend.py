"""Serve the bundled Lovelace card and register it as a dashboard resource."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from homeassistant.components.frontend import add_extra_js_url
from homeassistant.components.http import StaticPathConfig
from homeassistant.core import HomeAssistant

from .const import CARD_FILENAME, CARD_URL_BASE, DOMAIN

_LOGGER = logging.getLogger(__name__)

_DATA_STATIC = f"{DOMAIN}_card_static"
_OLD_CARD_URLS = ("/local/sahkon-hinta-card.js", "/hacsfiles/sahkon-hinta-card/")


def _card_url(version: str) -> str:
    return f"{CARD_URL_BASE}/{CARD_FILENAME}?v={version}"


def _resources(hass: HomeAssistant) -> Any | None:
    """Return the Lovelace resource collection when resources are UI-managed."""
    lovelace = hass.data.get("lovelace")
    if lovelace is None:
        return None
    if isinstance(lovelace, dict):  # older Home Assistant versions
        mode = lovelace.get("mode")
        resources = lovelace.get("resources")
    else:
        mode = getattr(lovelace, "resource_mode", None) or getattr(lovelace, "mode", None)
        resources = getattr(lovelace, "resources", None)
    if mode != "storage" or resources is None:
        return None
    return resources


async def async_register_card(hass: HomeAssistant, version: str) -> None:
    """Serve the card and add (or update) its dashboard resource."""
    if not hass.data.get(_DATA_STATIC):
        await hass.http.async_register_static_paths(
            [
                StaticPathConfig(
                    f"{CARD_URL_BASE}/{CARD_FILENAME}",
                    str(Path(__file__).parent / "www" / CARD_FILENAME),
                    False,
                )
            ]
        )
        hass.data[_DATA_STATIC] = True

    url = _card_url(version)
    resources = _resources(hass)
    if resources is None:
        # Resources are managed in YAML: load the card on every frontend page instead.
        add_extra_js_url(hass, url)
        return

    await resources.async_get_info()  # loads the collection from storage
    ours: list[dict] = []
    for item in resources.async_items():
        item_url = str(item.get("url", ""))
        if item_url.split("?")[0] == f"{CARD_URL_BASE}/{CARD_FILENAME}":
            ours.append(item)
        elif item_url.startswith(_OLD_CARD_URLS):
            _LOGGER.warning(
                "The Sähkön hinta card now ships with this integration. "
                "You can remove the old dashboard resource %s",
                item_url,
            )

    if not ours:
        await resources.async_create_item({"res_type": "module", "url": url})
        _LOGGER.debug("Added dashboard resource %s", url)
        return
    if ours[0].get("url") != url:
        await resources.async_update_item(ours[0]["id"], {"res_type": "module", "url": url})
        _LOGGER.debug("Updated dashboard resource to %s", url)
    for extra in ours[1:]:
        await resources.async_delete_item(extra["id"])


async def async_unregister_card(hass: HomeAssistant) -> None:
    """Remove the dashboard resource (called when the integration is removed)."""
    resources = _resources(hass)
    if resources is None:
        return
    await resources.async_get_info()
    for item in list(resources.async_items()):
        if str(item.get("url", "")).split("?")[0] == f"{CARD_URL_BASE}/{CARD_FILENAME}":
            await resources.async_delete_item(item["id"])
