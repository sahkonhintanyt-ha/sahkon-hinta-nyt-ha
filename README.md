# ⚡ Sähkön hinta nyt – Home Assistant

Finnish spot electricity price (pörssisähkö) in Home Assistant: current price,
cheapest hours, tomorrow's prices and ready-made automations.
No custom integration, no API key, no registration.

Data: **[Sähkön hinta nyt – sähkönhintanyt.org](https://sähkönhintanyt.org/)**
(ENTSO-E / Nord Pool day-ahead, 15-minute resolution, VAT 25.5 % included).

🇫🇮 [Suomeksi alempana](#suomeksi)

## What you get

| Entity | What it does |
|---|---|
| `sensor.sahkon_hinta_nyt` | Current price in snt/kWh, with today's and tomorrow's prices as attributes |
| `binary_sensor.sahko_halpaa` | `on` during the 4 cheapest hours of the day |

Plus two blueprints:

- **Cheapest hours → turn on device** – water heater, EV charger, floor heating
- **Price alert** – phone notification when the price goes below or above your limit

## Installation

### 1. Add the package

In `configuration.yaml`, enable packages (if you haven't already):

```yaml
homeassistant:
  packages: !include_dir_named packages
```

Copy [`packages/sahkon_hinta_nyt.yaml`](packages/sahkon_hinta_nyt.yaml) into
your `config/packages/` folder and restart Home Assistant.

Want a different number of cheap hours? Change `hours=4` in the URL
(for example `hours=6`).

### 2. Import the blueprints

[![Import: cheapest hours](https://my.home-assistant.io/badges/blueprint_import.svg)](https://my.home-assistant.io/redirect/blueprint_import/?blueprint_url=https%3A%2F%2Fgithub.com%2Fsahkonhintanyt-ha%2Fsahkon-hinta-nyt-ha%2Fblob%2Fmain%2Fblueprints%2Fautomation%2Fsahkon-hinta-nyt%2Fcheap_hours_switch.yaml)
Cheapest hours → turn on device

[![Import: price alert](https://my.home-assistant.io/badges/blueprint_import.svg)](https://my.home-assistant.io/redirect/blueprint_import/?blueprint_url=https%3A%2F%2Fgithub.com%2Fsahkonhintanyt-ha%2Fsahkon-hinta-nyt-ha%2Fblob%2Fmain%2Fblueprints%2Fautomation%2Fsahkon-hinta-nyt%2Fprice_alert.yaml)
Price alert

### 3. Optional: price chart

Needs [apexcharts-card](https://github.com/RomRider/apexcharts-card) from HACS.

```yaml
type: custom:apexcharts-card
header:
  show: true
  title: Sähkön hinta
graph_span: 2d
span:
  start: day
now:
  show: true
series:
  - entity: sensor.sahkon_hinta_nyt
    type: column
    data_generator: |
      return [...entity.attributes.raw_today, ...entity.attributes.raw_tomorrow]
        .map((p) => [new Date(p.start).getTime(), p.value]);
```

## API

Free, no key, CORS enabled. Base URL: `https://api.sähkönhintanyt.org`

| Endpoint | Returns |
|---|---|
| `/v1/now?zone=FI` | Current price (JSON) |
| `/v1/now.txt?zone=FI` | Current price (plain number) |
| `/v1/is-cheap?zone=FI&hours=4` | Is it cheap now? |
| `/v1/cheapest?zone=FI&hours=3` | Cheapest 3-hour window |
| `/v1/prices?zone=FI&day=today` | Today's 15-minute prices |
| `/v1/ha?zone=FI` | Home Assistant format |

Full documentation: [sähkönhintanyt.org/integraatiot/home-assistant](https://sähkönhintanyt.org/integraatiot/home-assistant/)

If you show the prices publicly, please credit the source with a link to
[sähkönhintanyt.org](https://sähkönhintanyt.org/).

---

## Suomeksi

Pörssisähkön hinta Home Assistantiin: hinta nyt, päivän halvimmat tunnit,
huomisen hinnat ja valmiit automaatiot. Ei lisäosia, ei API-avainta.

1. Lisää `configuration.yaml`-tiedostoon `packages: !include_dir_named packages`
   (ks. yllä) ja kopioi `packages/sahkon_hinta_nyt.yaml` kansioon `config/packages/`.
2. Käynnistä Home Assistant uudelleen.
3. Tuo blueprintit yllä olevilla painikkeilla.

Uudet anturit: `sensor.sahkon_hinta_nyt` ja `binary_sensor.sahko_halpaa`
(päällä vuorokauden neljänä halvimpana tuntina).

Tarkempi ohje ja vastaukset yleisiin kysymyksiin:
**[Sähkön hinta nyt – Home Assistant -ohje](https://sähkönhintanyt.org/integraatiot/home-assistant/)**

## License

MIT
