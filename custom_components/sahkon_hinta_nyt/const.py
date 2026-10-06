"""Constants for Sähkön hinta nyt."""

from datetime import timedelta

DOMAIN = "sahkon_hinta_nyt"
API_BASE = "https://api.xn--shknhintanyt-gcb8w.org/v1"
SITE_URL = "https://xn--shknhintanyt-gcb8w.org/"

CONF_ZONE = "zone"
CONF_CHEAP_HOURS = "cheap_hours"

DEFAULT_ZONE = "FI"
DEFAULT_CHEAP_HOURS = 4

UPDATE_INTERVAL = timedelta(minutes=5)
ATTRIBUTION = "Data: sähkönhintanyt.org (ENTSO-E / Nord Pool day-ahead)"
