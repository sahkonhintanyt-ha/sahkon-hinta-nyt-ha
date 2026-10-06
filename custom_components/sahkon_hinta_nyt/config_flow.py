"""Config flow for Sähkön hinta nyt."""

from __future__ import annotations

from typing import Any

import aiohttp
import voluptuous as vol

from homeassistant.config_entries import ConfigEntry, ConfigFlow, ConfigFlowResult, OptionsFlow
from homeassistant.core import callback
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.selector import NumberSelector, NumberSelectorConfig, NumberSelectorMode

from .const import API_BASE, CONF_CHEAP_HOURS, CONF_ZONE, DEFAULT_CHEAP_HOURS, DEFAULT_ZONE, DOMAIN

HOURS_SELECTOR = NumberSelector(NumberSelectorConfig(min=1, max=12, step=1, mode=NumberSelectorMode.BOX))


class SahkonHintaConfigFlow(ConfigFlow, domain=DOMAIN):
    """Handle setup from the UI."""

    VERSION = 1

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        errors: dict[str, str] = {}
        await self.async_set_unique_id(DEFAULT_ZONE)
        self._abort_if_unique_id_configured()

        if user_input is not None:
            try:
                session = async_get_clientsession(self.hass)
                async with session.get(f"{API_BASE}/now", params={"zone": DEFAULT_ZONE}, timeout=aiohttp.ClientTimeout(total=15)) as resp:
                    resp.raise_for_status()
            except (aiohttp.ClientError, TimeoutError):
                errors["base"] = "cannot_connect"
            else:
                return self.async_create_entry(
                    title="Sähkön hinta nyt",
                    data={CONF_ZONE: DEFAULT_ZONE, CONF_CHEAP_HOURS: int(user_input[CONF_CHEAP_HOURS])},
                )

        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema({vol.Required(CONF_CHEAP_HOURS, default=DEFAULT_CHEAP_HOURS): HOURS_SELECTOR}),
            errors=errors,
        )

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: ConfigEntry) -> OptionsFlow:
        return SahkonHintaOptionsFlow()


class SahkonHintaOptionsFlow(OptionsFlow):
    """Change the number of cheap hours later."""

    async def async_step_init(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        if user_input is not None:
            return self.async_create_entry(data={CONF_CHEAP_HOURS: int(user_input[CONF_CHEAP_HOURS])})

        current = self.config_entry.options.get(
            CONF_CHEAP_HOURS, self.config_entry.data.get(CONF_CHEAP_HOURS, DEFAULT_CHEAP_HOURS)
        )
        return self.async_show_form(
            step_id="init",
            data_schema=vol.Schema({vol.Required(CONF_CHEAP_HOURS, default=current): HOURS_SELECTOR}),
        )
