from collections.abc import Mapping
from typing import Any

import voluptuous as vol
from homeassistant.config_entries import ConfigFlow, ConfigFlowResult
from homeassistant.const import CONF_TOKEN, CONF_URL
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .api import HabitsAuthError, HabitsClient, HabitsError
from .const import DOMAIN

USER_SCHEMA = vol.Schema({vol.Required(CONF_URL): str, vol.Required(CONF_TOKEN): str})
TOKEN_SCHEMA = vol.Schema({vol.Required(CONF_TOKEN): str})


class HabitsConfigFlow(ConfigFlow, domain=DOMAIN):
    VERSION = 1

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        errors: dict[str, str] = {}
        if user_input is not None:
            me, errors = await self._check(user_input[CONF_URL], user_input[CONF_TOKEN])
            if me is not None:
                await self.async_set_unique_id(str(me["id"]))
                self._abort_if_unique_id_configured()
                return self.async_create_entry(title=me["display_name"], data=user_input)
        return self.async_show_form(
            step_id="user",
            data_schema=self.add_suggested_values_to_schema(USER_SCHEMA, user_input),
            errors=errors,
        )

    async def async_step_reauth(self, entry_data: Mapping[str, Any]) -> ConfigFlowResult:
        return await self.async_step_reauth_confirm()

    async def async_step_reauth_confirm(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        errors: dict[str, str] = {}
        entry = self._get_reauth_entry()
        if user_input is not None:
            me, errors = await self._check(entry.data[CONF_URL], user_input[CONF_TOKEN])
            if me is not None:
                await self.async_set_unique_id(str(me["id"]))
                self._abort_if_unique_id_mismatch(reason="wrong_account")
                return self.async_update_reload_and_abort(entry, data_updates=user_input)
        return self.async_show_form(
            step_id="reauth_confirm", data_schema=TOKEN_SCHEMA, errors=errors
        )

    async def _check(self, url: str, token: str) -> tuple[dict[str, Any] | None, dict[str, str]]:
        client = HabitsClient(async_get_clientsession(self.hass), url, token)
        try:
            return await client.me(), {}
        except HabitsAuthError:
            return None, {"base": "invalid_auth"}
        except HabitsError:
            return None, {"base": "cannot_connect"}
