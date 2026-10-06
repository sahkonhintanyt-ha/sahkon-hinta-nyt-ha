/*
 * Sähkön hinta -kortti (Finnish spot electricity price card) for Home Assistant
 * Data: https://sähkönhintanyt.org  (ENTSO-E / Nord Pool day-ahead)
 * Works with sensor.sahkon_hinta_nyt from the sahkon-hinta-nyt-ha package.
 * License: MIT
 */
const SHN_VERSION = "1.1.0";
const SHN_PREFIX = "shn_";

const LEVELS = [
  { key: "negative", label: "Negatiivinen", color: "var(--shn-negative)" },
  { key: "cheap", label: "Halpa", color: "var(--shn-cheap)" },
  { key: "normal", label: "Normaali", color: "var(--shn-normal)" },
  { key: "expensive", label: "Kallis", color: "var(--shn-expensive)" },
  { key: "very_expensive", label: "Erittäin kallis", color: "var(--shn-very)" },
];

const DEVICE_DOMAINS = ["switch", "light", "input_boolean", "fan", "climate", "water_heater"];
const SCENE_DOMAINS = ["light", "switch", "fan", "climate", "input_boolean", "cover", "media_player"];

class SahkonHintaCard extends HTMLElement {
  static getStubConfig() {
    return { entity: "sensor.sahkon_hinta_nyt" };
  }

  setConfig(config) {
    this._config = {
      entity: "sensor.sahkon_hinta_nyt",
      cheap_entity: "binary_sensor.sahko_halpaa",
      name: "Sähkön hinta nyt",
      thresholds: [5, 10, 15],
      show_source: true,
      show_actions: true,
      ...config,
    };
    this._day = this._day || "today";
    this._hover = null;
    this._panel = this._panel || null; // null | "alert" | "control" | "scene"
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
      this.shadowRoot.innerHTML = `${this._style()}<ha-card>
        <div class="pad"><div id="main"></div><div id="panel"></div><div id="foot"></div></div>
      </ha-card>`;
    }
    this._$("#foot").innerHTML = `<div class="toast" hidden role="status"></div>${
      this._config.show_source
        ? `<a class="src" href="https://xn--shknhintanyt-gcb8w.org/" target="_blank" rel="noopener">Lähde: sähkönhintanyt.org</a>`
        : ""
    }`;
    this._renderMain();
    this._renderPanel();
  }

  set hass(hass) {
    const st = hass.states[this._config.entity];
    const first = !this._hass;
    const changed = first || st !== this._stateObj;
    this._hass = hass;
    this._stateObj = st;
    if (changed) this._renderMain();
    if (first) this._renderPanel();
    else this._refreshList();
  }

  connectedCallback() {
    this._tick = setInterval(() => this._renderMain(), 60000);
  }

  disconnectedCallback() {
    clearInterval(this._tick);
  }

  getCardSize() {
    return 6;
  }

  /* ---------- helpers ---------- */

  _$(sel) {
    return this.shadowRoot.querySelector(sel);
  }

  _tz() {
    return (this._hass && this._hass.config && this._hass.config.time_zone) || "Europe/Helsinki";
  }

  _num(v) {
    if (v === null || v === undefined || v === "" || isNaN(Number(v))) return "–";
    const n = Number(v);
    const digits = Math.abs(n) < 0.1 && n !== 0 ? 3 : 2;
    return n
      .toLocaleString("fi-FI", { minimumFractionDigits: digits, maximumFractionDigits: digits })
      .replace("-", "−");
  }

  _time(iso) {
    return new Date(iso).toLocaleTimeString("fi-FI", { hour: "2-digit", minute: "2-digit", timeZone: this._tz() });
  }

  _hour(iso) {
    return new Date(iso).toLocaleTimeString("fi-FI", { hour: "2-digit", timeZone: this._tz() });
  }

  _level(v) {
    const [a, b, c] = this._config.thresholds;
    if (v < 0) return LEVELS[0];
    if (v < a) return LEVELS[1];
    if (v < b) return LEVELS[2];
    if (v < c) return LEVELS[3];
    return LEVELS[4];
  }

  _esc(s) {
    return String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  }

  _name(entityId) {
    const st = this._hass && this._hass.states[entityId];
    return ((st && st.attributes.friendly_name) || entityId).replace(/^⚡\s*/, "");
  }

  _entities(domains) {
    if (!this._hass) return [];
    return Object.keys(this._hass.states)
      .filter((e) => domains.includes(e.split(".")[0]))
      .sort((a, b) => this._name(a).localeCompare(this._name(b), "fi"));
  }

  _options(ids, selected) {
    return ids
      .map((e) => `<option value="${this._esc(e)}" ${e === selected ? "selected" : ""}>${this._esc(this._name(e))}</option>`)
      .join("");
  }

  _phones() {
    const notify = (this._hass && this._hass.services && this._hass.services.notify) || {};
    return Object.keys(notify)
      .filter((s) => s.startsWith("mobile_app_"))
      .map((s) => ({ id: `notify.${s}`, label: s.replace("mobile_app_", "").replace(/_/g, " ") }));
  }

  _isAdmin() {
    return !!(this._hass && this._hass.user && this._hass.user.is_admin);
  }

  _toast(msg, error = false) {
    const el = this._$(".toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.toggle("error", error);
    el.hidden = false;
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => (el.hidden = true), 5000);
  }

  /* ---------- chart ---------- */

  _chart(slots, now) {
    if (!slots || !slots.length) {
      return `<div class="empty">Huomisen hinnat julkaistaan yleensä noin klo 14.</div>`;
    }
    const W = 300, H = 120, PAD_T = 6, PAD_B = 4;
    const vals = slots.map((s) => Number(s.value));
    const max = Math.max(...vals, 0);
    const min = Math.min(0, ...vals);
    const span = max - min || 1;
    const y = (v) => PAD_T + ((max - v) / span) * (H - PAD_T - PAD_B);
    const zero = y(0);
    const w = W / slots.length;
    const gap = Math.min(2, w * 0.25);

    let bars = "";
    slots.forEach((s, i) => {
      const v = Number(s.value);
      const start = new Date(s.start).getTime();
      const end = new Date(s.end).getTime();
      const isNow = now >= start && now < end;
      const isPast = end <= now;
      const top = Math.min(y(v), zero);
      const h = Math.max(1.5, Math.abs(y(v) - zero));
      const cls = isNow ? "now" : isPast ? "past" : "";
      bars += `<rect class="bar ${cls}" data-i="${i}" x="${(i * w + gap / 2).toFixed(2)}" y="${top.toFixed(2)}"
        width="${(w - gap).toFixed(2)}" height="${h.toFixed(2)}" rx="${Math.min(2, (w - gap) / 2).toFixed(2)}"
        style="fill:${this._level(v).color}"><title>klo ${this._time(s.start)}–${this._time(s.end)}: ${this._num(v)} snt/kWh</title></rect>`;
      if (isNow) {
        const cx = i * w + w / 2;
        bars += `<line class="nowline" x1="${cx}" x2="${cx}" y1="0" y2="${H}"/>`;
      }
    });

    let ticks = "";
    slots.forEach((s, i) => {
      const hh = this._hour(s.start);
      if (new Date(s.start).getUTCMinutes() === 0 && ["00", "06", "12", "18"].includes(hh)) {
        ticks += `<span style="left:${((i * w) / W) * 100}%">${hh}</span>`;
      }
    });

    return `<div class="chart" role="img" aria-label="Sähkön hinta tunneittain">
        <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
          <line class="zero" x1="0" x2="${W}" y1="${zero}" y2="${zero}"/>${bars}
        </svg><div class="ticks">${ticks}</div></div>`;
  }

  /* ---------- main (price) ---------- */

  _renderMain() {
    if (!this.shadowRoot || !this._config || !this._hass) return;
    const main = this._$("#main");
    const st = this._stateObj;

    if (!st) {
      main.innerHTML = `<div class="title">${this._esc(this._config.name)}</div>
        <p class="muted">Anturia <b>${this._esc(this._config.entity)}</b> ei löydy. Asenna paketti
        sahkon-hinta-nyt-ha ja käynnistä Home Assistant uudelleen.</p>`;
      return;
    }

    const a = st.attributes || {};
    const price = Number(st.state);
    const lvl = isNaN(price) ? null : this._level(price);
    const now = Date.now();
    const hasTomorrow = a.tomorrow_valid === true && Array.isArray(a.raw_tomorrow) && a.raw_tomorrow.length;
    if (this._day === "tomorrow" && !hasTomorrow) this._day = "today";
    const slots = (this._day === "today" ? a.raw_today : a.raw_tomorrow) || [];
    const vals = slots.map((s) => Number(s.value));
    const dayMin = vals.length ? Math.min(...vals) : a.min;
    const dayMax = vals.length ? Math.max(...vals) : a.max;
    const dayAvg = vals.length ? vals.reduce((x, y) => x + y, 0) / vals.length : a.average;
    this._slots = slots;

    let readout = "&nbsp;";
    if (this._day === "today" && a.cheapest_3h_start) {
      const s = new Date(a.cheapest_3h_start);
      const e = new Date(s.getTime() + 3 * 3600 * 1000);
      readout = `Halvin 3 h: klo ${this._time(s)}–${this._time(e)}, keskimäärin <b>${this._num(a.cheapest_3h_avg)}</b> snt`;
    } else if (vals.length) {
      const i = vals.indexOf(dayMin);
      readout = `Halvin hetki: klo ${this._time(slots[i].start)}, <b>${this._num(dayMin)}</b> snt`;
    }
    this._defaultReadout = readout;

    const p = this._panel;
    main.innerHTML = `
      <div class="head">
        <div class="title">${this._esc(this._config.name)}</div>
        <div class="tabs" role="tablist" aria-label="Päivä">
          <button role="tab" data-day="today" aria-selected="${this._day === "today"}">Tänään</button>
          <button role="tab" data-day="tomorrow" aria-selected="${this._day === "tomorrow"}"
            ${hasTomorrow ? "" : "disabled title='Huomisen hinnat tulevat noin klo 14'"}>Huomenna</button>
        </div>
      </div>
      <div class="now">
        <span class="price" style="--c:${lvl ? lvl.color : "var(--primary-text-color)"}">${this._num(price)}</span>
        <span class="unit">snt/kWh</span>
        ${lvl ? `<span class="level" style="--c:${lvl.color}">${lvl.label}</span>` : ""}
      </div>
      <div class="readout">${readout}</div>
      ${this._chart(slots, now)}
      <div class="stats">
        <div><span>Alin</span><b>${this._num(dayMin)}</b></div>
        <div><span>Keskihinta</span><b>${this._num(dayAvg)}</b></div>
        <div><span>Ylin</span><b>${this._num(dayMax)}</b></div>
      </div>
      ${this._config.show_actions ? `
      <div class="actions" role="tablist" aria-label="Automaatiot">
        <button data-panel="alert" aria-expanded="${p === "alert"}"><ha-icon icon="mdi:bell-outline"></ha-icon>Ilmoitus</button>
        <button data-panel="control" aria-expanded="${p === "control"}"><ha-icon icon="mdi:power-plug-outline"></ha-icon>Ohjaus</button>
        <button data-panel="scene" aria-expanded="${p === "scene"}"><ha-icon icon="mdi:palette-outline"></ha-icon>Scene</button>
      </div>` : ""}`;

    main.querySelectorAll(".tabs button").forEach((b) =>
      b.addEventListener("click", () => {
        this._day = b.dataset.day;
        this._renderMain();
      })
    );
    main.querySelectorAll(".actions button").forEach((b) =>
      b.addEventListener("click", () => {
        this._panel = this._panel === b.dataset.panel ? null : b.dataset.panel;
        this._renderMain();
        this._renderPanel();
      })
    );

    const svg = main.querySelector("svg");
    if (svg) {
      svg.addEventListener("pointermove", (e) => {
        const r = svg.getBoundingClientRect();
        const i = Math.floor(((e.clientX - r.left) / r.width) * this._slots.length);
        if (i < 0 || i >= this._slots.length || i === this._hover) return;
        this._hover = i;
        const s = this._slots[i];
        main.querySelector(".readout").innerHTML =
          `Klo ${this._time(s.start)}–${this._time(s.end)}: <b>${this._num(s.value)}</b> snt/kWh`;
        main.querySelectorAll(".bar").forEach((bar) => bar.classList.toggle("hover", Number(bar.dataset.i) === i));
      });
      svg.addEventListener("pointerleave", () => {
        this._hover = null;
        main.querySelector(".readout").innerHTML = this._defaultReadout;
        main.querySelectorAll(".bar.hover").forEach((bar) => bar.classList.remove("hover"));
      });
    }
  }

  /* ---------- panel (forms) ---------- */

  _renderPanel() {
    const panel = this._$("#panel");
    if (!panel || !this._hass) return;
    if (!this._panel) {
      panel.innerHTML = "";
      return;
    }
    if (!this._isAdmin()) {
      panel.innerHTML = `<div class="panel"><p class="muted">Automaatioiden ja scenejen luominen vaatii
        järjestelmänvalvojan oikeudet.</p></div>`;
      return;
    }
    const body = { alert: this._alertForm(), control: this._controlForm(), scene: this._sceneForm() }[this._panel];
    panel.innerHTML = `<div class="panel">${body}<div class="list"></div></div>`;
    this._bindPanel();
    this._refreshList(true);
  }

  _alertForm() {
    const phones = this._phones();
    const phoneOpts = phones.map((p) => `<option value="${p.id}">${this._esc(p.label)}</option>`).join("");
    return `
      <form id="f-alert">
        <label>Ilmoita, kun
          <select name="kind">
            <option value="below">hinta laskee alle rajan</option>
            <option value="above">hinta nousee yli rajan</option>
            <option value="tomorrow">huomisen hinnat on julkaistu</option>
          </select>
        </label>
        <label class="limit">Raja (snt/kWh)
          <input name="limit" type="text" value="3" inputmode="decimal" autocomplete="off">
        </label>
        <label>Minne
          <select name="target">
            ${phoneOpts}
            <option value="persistent">Home Assistantin ilmoituksiin</option>
          </select>
        </label>
        ${phones.length ? "" : `<p class="hint">Puhelinta ei löytynyt. Asenna Home Assistant -sovellus puhelimeen, niin se näkyy tässä.</p>`}
        <button class="primary" type="submit">Luo ilmoitus</button>
      </form>`;
  }

  _controlForm() {
    const devices = this._entities(DEVICE_DOMAINS);
    const scenes = this._entities(["scene"]);
    const sceneOpts = `<option value="">Ei mitään</option>${this._options(scenes)}`;
    return `
      <form id="f-control">
        <label>Mitä ohjataan
          <select name="type">
            <option value="device">Laite</option>
            <option value="scene" ${scenes.length ? "" : "disabled"}>Scene${scenes.length ? "" : " (luo ensin Scene-välilehdellä)"}</option>
          </select>
        </label>
        <label class="t-device">Laite
          <select name="device">${this._options(devices)}</select>
        </label>
        <label class="t-scene" hidden>Scene, kun sähkö on halpaa
          <select name="scene_on">${this._options(scenes)}</select>
        </label>
        <label class="t-scene" hidden>Scene, kun halpa jakso päättyy
          <select name="scene_off">${sceneOpts}</select>
        </label>
        <label>Milloin
          <select name="when">
            <option value="cheapest">Vuorokauden halvimpina tunteina</option>
            <option value="below">Kun hinta on alle rajan</option>
          </select>
        </label>
        <label class="limit" hidden>Raja (snt/kWh)
          <input name="limit" type="text" value="5" inputmode="decimal" autocomplete="off">
        </label>
        <p class="hint t-device">Laite käynnistyy halvan jakson alussa ja sammuu sen päättyessä.</p>
        <button class="primary" type="submit">Luo ohjaus</button>
      </form>`;
  }

  _sceneForm() {
    const ents = this._entities(SCENE_DOMAINS);
    const rows = ents
      .map(
        (e) => `<label class="check"><input type="checkbox" name="ent" value="${this._esc(e)}">
          <span>${this._esc(this._name(e))}</span><em>${this._esc(this._hass.states[e].state)}</em></label>`
      )
      .join("");
    return `
      <form id="f-scene">
        <p class="hint">Aseta laitteet ensin haluamaasi tilaan. Scene tallentaa valittujen laitteiden nykyisen tilan.</p>
        <label>Nimi
          <input name="name" type="text" placeholder="esim. Halpa sähkö" required maxlength="60">
        </label>
        <input class="filter" type="search" placeholder="Hae laitetta" aria-label="Hae laitetta" autocomplete="off">
        <div class="checks" role="group" aria-label="Laitteet">${rows || `<p class="muted">Ei sopivia laitteita.</p>`}</div>
        <button class="primary" type="submit">Tallenna scene</button>
      </form>`;
  }

  _bindPanel() {
    const fa = this._$("#f-alert");
    if (fa) {
      const sync = () => (fa.querySelector(".limit").hidden = fa.elements["kind"].value === "tomorrow");
      fa.elements["kind"].addEventListener("change", sync);
      sync();
      fa.addEventListener("submit", (e) => {
        e.preventDefault();
        this._createAlert(fa);
      });
    }
    const fc = this._$("#f-control");
    if (fc) {
      const sync = () => {
        const scene = fc.elements["type"].value === "scene";
        fc.querySelectorAll(".t-scene").forEach((el) => (el.hidden = !scene));
        fc.querySelectorAll(".t-device").forEach((el) => (el.hidden = scene));
        fc.querySelector(".limit").hidden = fc.elements["when"].value !== "below";
      };
      fc.elements["type"].addEventListener("change", sync);
      fc.elements["when"].addEventListener("change", sync);
      sync();
      fc.addEventListener("submit", (e) => {
        e.preventDefault();
        this._createControl(fc);
      });
    }
    const fs = this._$("#f-scene");
    if (fs) {
      fs.querySelector(".filter").addEventListener("input", (e) => {
        const q = e.target.value.toLowerCase();
        fs.querySelectorAll(".check").forEach((row) => {
          row.hidden = q && !row.textContent.toLowerCase().includes(q) && !row.querySelector("input").value.includes(q);
        });
      });
      fs.addEventListener("submit", (e) => {
        e.preventDefault();
        this._createScene(fs);
      });
    }
  }

  /* ---------- builders ---------- */

  async _saveAutomation(config) {
    const id = `${SHN_PREFIX}${Date.now()}${Math.floor(Math.random() * 1000)}`;
    try {
      await this._hass.callApi("POST", `config/automation/config/${id}`, {
        id,
        description: "Luotu Sähkön hinta -kortilla (sähkönhintanyt.org)",
        mode: "single",
        ...config,
      });
      this._toast(`Tallennettu: ${config.alias}`);
      setTimeout(() => this._refreshList(true), 1500);
    } catch (err) {
      this._toast(`Tallennus epäonnistui: ${(err && err.body && err.body.message) || err.message || err}`, true);
    }
  }

  _createAlert(f) {
    const price = this._config.entity;
    const kind = f.elements["kind"].value;
    const limit = Number(String(f.elements["limit"].value).replace(",", "."));
    if (kind !== "tomorrow" && isNaN(limit)) return this._toast("Anna raja numerona.", true);

    let trigger, message, alias;
    const limitTxt = this._num(limit);
    if (kind === "tomorrow") {
      trigger = { trigger: "state", entity_id: price, attribute: "tomorrow_valid", to: true };
      message =
        "Huomisen hinnat on julkaistu. Halvin {{ state_attr('" + price + "','raw_tomorrow') | map(attribute='value') | min | round(2) }} snt, " +
        "keskihinta {{ state_attr('" + price + "','raw_tomorrow') | map(attribute='value') | average | round(2) }} snt/kWh.";
      alias = "⚡ Huomisen sähkön hinnat julkaistu";
    } else {
      trigger = { trigger: "numeric_state", entity_id: price, [kind]: limit };
      message = `Hinta on nyt {{ states('${price}') }} snt/kWh (${kind === "below" ? "alle" : "yli"} ${limitTxt} snt).`;
      alias = `⚡ Sähkön hinta ${kind === "below" ? "alle" : "yli"} ${limitTxt} snt`;
    }

    const target = f.elements["target"].value;
    const action =
      target === "persistent"
        ? { action: "persistent_notification.create", data: { title: "⚡ Sähkön hinta", message } }
        : { action: target, data: { title: "⚡ Sähkön hinta", message } };
    alias += target === "persistent" ? " → Home Assistant" : ` → ${target.replace("notify.mobile_app_", "").replace(/_/g, " ")}`;

    this._saveAutomation({ alias, triggers: [trigger], conditions: [], actions: [action] });
  }

  _createControl(f) {
    const type = f.elements["type"].value;
    const when = f.elements["when"].value;
    const limit = Number(String(f.elements["limit"].value).replace(",", "."));
    if (when === "below" && isNaN(limit)) return this._toast("Anna raja numerona.", true);

    let triggers;
    let whenTxt;
    if (when === "cheapest") {
      const cheap = this._config.cheap_entity;
      if (!this._hass.states[cheap]) return this._toast(`Anturia ${cheap} ei löydy.`, true);
      triggers = [
        { trigger: "state", entity_id: cheap, to: "on", id: "on" },
        { trigger: "state", entity_id: cheap, to: "off", id: "off" },
      ];
      whenTxt = "halvimpina tunteina";
    } else {
      triggers = [
        { trigger: "numeric_state", entity_id: this._config.entity, below: limit, id: "on" },
        { trigger: "numeric_state", entity_id: this._config.entity, above: limit, id: "off" },
      ];
      whenTxt = `kun hinta alle ${this._num(limit)} snt`;
    }

    let onAct, offAct, alias;
    if (type === "device") {
      const dev = f.elements["device"].value;
      if (!dev) return this._toast("Valitse laite.", true);
      onAct = [{ action: "homeassistant.turn_on", target: { entity_id: dev } }];
      offAct = [{ action: "homeassistant.turn_off", target: { entity_id: dev } }];
      alias = `⚡ ${this._name(dev)} päälle ${whenTxt}`;
    } else {
      const sOn = f.elements["scene_on"].value;
      const sOff = f.elements["scene_off"].value;
      if (!sOn) return this._toast("Valitse scene.", true);
      onAct = [{ action: "scene.turn_on", target: { entity_id: sOn } }];
      offAct = sOff ? [{ action: "scene.turn_on", target: { entity_id: sOff } }] : [];
      alias = `⚡ Scene ${this._name(sOn)} ${whenTxt}`;
    }

    const choose = [{ conditions: [{ condition: "trigger", id: "on" }], sequence: onAct }];
    if (offAct.length) choose.push({ conditions: [{ condition: "trigger", id: "off" }], sequence: offAct });

    this._saveAutomation({ alias, mode: "restart", triggers, conditions: [], actions: [{ choose }] });
  }

  async _createScene(f) {
    const name = f.elements["name"].value.trim();
    const picked = [...f.querySelectorAll("input[name=ent]:checked")].map((i) => i.value);
    if (!name) return this._toast("Anna scenelle nimi.", true);
    if (!picked.length) return this._toast("Valitse vähintään yksi laite.", true);

    const keep = {
      light: ["brightness", "color_temp_kelvin", "rgb_color"],
      climate: ["temperature", "hvac_mode"],
      fan: ["percentage"],
      cover: ["current_position"],
      media_player: ["volume_level"],
    };
    const entities = {};
    picked.forEach((e) => {
      const st = this._hass.states[e];
      const conf = { state: st.state };
      (keep[e.split(".")[0]] || []).forEach((k) => {
        if (st.attributes[k] !== undefined && st.attributes[k] !== null) conf[k] = st.attributes[k];
      });
      if (e.startsWith("cover.") && conf.current_position !== undefined) {
        conf.position = conf.current_position;
        delete conf.current_position;
      }
      entities[e] = conf;
    });

    const id = `${SHN_PREFIX}${Date.now()}${Math.floor(Math.random() * 1000)}`;
    try {
      await this._hass.callApi("POST", `config/scene/config/${id}`, { id, name: `⚡ ${name}`, entities });
      this._toast(`Scene tallennettu: ${name}. Käytä sitä Ohjaus-välilehdellä.`);
      f.reset();
      setTimeout(() => this._refreshList(true), 1500);
    } catch (err) {
      this._toast(`Tallennus epäonnistui: ${(err && err.body && err.body.message) || err.message || err}`, true);
    }
  }

  /* ---------- list of things this card created ---------- */

  _refreshList(force = false) {
    const list = this._$("#panel .list");
    if (!list || !this._hass) return;
    const domain = this._panel === "scene" ? "scene" : "automation";
    const mine = Object.values(this._hass.states).filter(
      (s) => s.entity_id.startsWith(`${domain}.`) && String(s.attributes.id || "").startsWith(SHN_PREFIX)
    );
    const sig = mine.map((s) => `${s.entity_id}:${s.state}`).join("|");
    if (!force && sig === this._listSig) return;
    this._listSig = sig;

    if (!mine.length) {
      list.innerHTML = "";
      return;
    }
    list.innerHTML = `<div class="list-title">${domain === "scene" ? "Kortilla luodut scenet" : "Kortilla luodut automaatiot"}</div>
      ${mine
        .map((s) => {
          const on = s.state === "on";
          const toggle =
            domain === "automation"
              ? `<button class="mini" data-act="toggle" data-e="${s.entity_id}" aria-pressed="${on}">${on ? "Päällä" : "Pois"}</button>`
              : `<button class="mini" data-act="run" data-e="${s.entity_id}">Aktivoi</button>`;
          return `<div class="row"><span>${this._esc(s.attributes.friendly_name || s.entity_id)}</span>
            ${toggle}<button class="mini danger" data-act="delete" data-e="${s.entity_id}"
            data-id="${this._esc(s.attributes.id)}" aria-label="Poista">Poista</button></div>`;
        })
        .join("")}`;

    list.querySelectorAll("button").forEach((b) =>
      b.addEventListener("click", async () => {
        const e = b.dataset.e;
        const dom = e.split(".")[0];
        try {
          if (b.dataset.act === "toggle") {
            await this._hass.callService("automation", b.getAttribute("aria-pressed") === "true" ? "turn_off" : "turn_on", { entity_id: e });
          } else if (b.dataset.act === "run") {
            await this._hass.callService("scene", "turn_on", { entity_id: e });
            this._toast("Scene aktivoitu.");
          } else if (b.dataset.act === "delete") {
            if (!confirm(`Poistetaanko "${this._name(e)}"?`)) return;
            await this._hass.callApi("DELETE", `config/${dom}/config/${b.dataset.id}`);
            this._toast("Poistettu.");
            setTimeout(() => this._refreshList(true), 1500);
          }
        } catch (err) {
          this._toast(`Toiminto epäonnistui: ${(err && err.body && err.body.message) || err.message || err}`, true);
        }
      })
    );
  }

  /* ---------- styles ---------- */

  _style() {
    return `<style>
      :host {
        --shn-negative: #5aa7e0;
        --shn-cheap: #5fbf9f;
        --shn-normal: #c8b45a;
        --shn-expensive: #e29654;
        --shn-very: #e0607a;
        --shn-line: var(--divider-color, rgba(127,127,127,.3));
      }
      ha-card { overflow: hidden; }
      .pad { padding: 16px 18px 12px; }
      .head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
      .title { font-size: 1rem; font-weight: 500; color: var(--primary-text-color); }
      button { font: inherit; }
      button:focus-visible, select:focus-visible, input:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; }
      .tabs { display: inline-flex; border: 1px solid var(--shn-line); border-radius: 999px; padding: 2px; }
      .tabs button { font-size: .8rem; border: 0; background: none; cursor: pointer; color: var(--secondary-text-color); padding: 4px 12px; border-radius: 999px; }
      .tabs button[aria-selected="true"] { background: var(--primary-color); color: var(--text-primary-color, #fff); }
      .tabs button:disabled { opacity: .4; cursor: default; }
      .now { display: flex; align-items: baseline; flex-wrap: wrap; gap: 6px 10px; margin: 14px 0 2px; }
      .price { color: color-mix(in srgb, var(--c) 78%, var(--primary-text-color)); font-size: 3rem; font-weight: 300; line-height: 1; font-variant-numeric: tabular-nums; letter-spacing: -.02em; }
      .unit { color: var(--secondary-text-color); font-size: .95rem; }
      .level { font-size: .8rem; padding: 2px 10px; border-radius: 999px; align-self: center; color: color-mix(in srgb, var(--c) 78%, var(--primary-text-color)); border: 1px solid var(--c); }
      .readout { min-height: 1.4em; margin: 10px 0 8px; font-size: .9rem; color: var(--secondary-text-color); font-variant-numeric: tabular-nums; }
      .readout b { color: var(--primary-text-color); font-weight: 500; }
      .chart { position: relative; }
      svg { display: block; width: 100%; height: 120px; touch-action: pan-y; }
      .bar { transition: opacity .15s; }
      .bar.past { opacity: .3; }
      .bar.hover { opacity: 1; filter: brightness(1.25); }
      .zero { stroke: var(--shn-line); stroke-width: 1; vector-effect: non-scaling-stroke; }
      .nowline { stroke: var(--primary-text-color); stroke-width: 1; stroke-dasharray: 2 3; opacity: .6; vector-effect: non-scaling-stroke; }
      .ticks { position: relative; height: 16px; margin-top: 4px; font-size: .72rem; color: var(--secondary-text-color); }
      .ticks span { position: absolute; transform: translateX(-2px); }
      .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--shn-line); }
      .stats div { display: flex; flex-direction: column; gap: 2px; }
      .stats span { font-size: .75rem; color: var(--secondary-text-color); }
      .stats b { font-weight: 400; font-size: 1.05rem; font-variant-numeric: tabular-nums; color: var(--primary-text-color); }
      .empty { height: 120px; display: grid; place-items: center; text-align: center; color: var(--secondary-text-color); font-size: .9rem; border: 1px dashed var(--shn-line); border-radius: 8px; }

      .actions { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 14px; }
      .actions button {
        display: flex; align-items: center; justify-content: center; gap: 6px; cursor: pointer;
        background: none; border: 1px solid var(--shn-line); border-radius: 10px; padding: 8px 6px;
        color: var(--primary-text-color); font-size: .85rem;
      }
      .actions button[aria-expanded="true"] { border-color: var(--primary-color); color: var(--primary-color); }
      .actions ha-icon { --mdc-icon-size: 18px; }

      .panel { margin-top: 10px; padding: 14px; border-radius: 10px; background: color-mix(in srgb, var(--primary-text-color) 4%, transparent); }
      form { display: flex; flex-direction: column; gap: 12px; }
      label { display: flex; flex-direction: column; gap: 4px; font-size: .8rem; color: var(--secondary-text-color); }
      label[hidden], p[hidden] { display: none; }
      select, input[type=text], input[type=search] {
        font: inherit; font-size: .95rem; color: var(--primary-text-color); background: var(--card-background-color, transparent);
        border: 1px solid var(--shn-line); border-radius: 8px; padding: 8px 10px; min-width: 0;
      }
      .hint { margin: 0; font-size: .8rem; color: var(--secondary-text-color); }
      .primary { align-self: flex-start; cursor: pointer; border: 0; border-radius: 8px; padding: 9px 16px; background: var(--primary-color); color: var(--text-primary-color, #fff); font-size: .9rem; }
      .checks { max-height: 220px; overflow: auto; border: 1px solid var(--shn-line); border-radius: 8px; padding: 4px 0; }
      .check[hidden] { display: none; }
      .check { flex-direction: row; align-items: center; gap: 10px; padding: 6px 10px; font-size: .9rem; color: var(--primary-text-color); cursor: pointer; }
      .check span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .check em { font-style: normal; font-size: .75rem; color: var(--secondary-text-color); }
      .list:empty { display: none; }
      .list { margin-top: 14px; padding-top: 10px; border-top: 1px solid var(--shn-line); }
      .list-title { font-size: .8rem; color: var(--secondary-text-color); margin-bottom: 6px; }
      .row { display: flex; align-items: center; gap: 8px; padding: 6px 0; font-size: .88rem; color: var(--primary-text-color); }
      .row span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .mini { cursor: pointer; border: 1px solid var(--shn-line); background: none; color: var(--primary-text-color); border-radius: 6px; padding: 3px 9px; font-size: .78rem; }
      .mini[aria-pressed="true"] { border-color: var(--shn-cheap); color: var(--shn-cheap); }
      .mini.danger { color: var(--error-color, #db4437); }

      .toast { margin-top: 10px; padding: 8px 10px; border-radius: 8px; font-size: .85rem; border: 1px solid var(--shn-cheap); color: var(--primary-text-color); }
      .toast.error { border-color: var(--error-color, #db4437); }
      .toast[hidden] { display: none; }
      .src { display: block; margin-top: 10px; text-align: right; font-size: .7rem; color: var(--secondary-text-color); text-decoration: none; }
      .src:hover { text-decoration: underline; }
      .muted { color: var(--secondary-text-color); font-size: .9rem; }
      @media (prefers-reduced-motion: reduce) { .bar { transition: none; } }
    </style>`;
  }
}

customElements.define("sahkon-hinta-card", SahkonHintaCard);
window.customCards = window.customCards || [];
window.customCards.push({
  type: "sahkon-hinta-card",
  name: "Sähkön hinta",
  description: "Pörssisähkön hinta nyt, tänään ja huomenna sekä hintailmoitukset ja ohjaukset (sähkönhintanyt.org)",
  documentationURL: "https://github.com/sahkonhintanyt-ha/sahkon-hinta-nyt-ha",
});
console.info(`%c SAHKON-HINTA-CARD %c ${SHN_VERSION} `, "background:#5fbf9f;color:#000", "background:#333;color:#fff");
