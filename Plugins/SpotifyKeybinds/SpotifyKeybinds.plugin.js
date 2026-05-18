/**
 * @name SpotifyKeybinds
 * @author Sewsho
 * @description Control Spotify with custom keybinds from anywhere on your PC (even in-game!).
 * @version 1.0.0
 * @source https://github.com/sewsho/BetterDiscordAddons/blob/main/Plugins/SpotifyKeybinds/SpotifyKeybinds.plugin.js
 * @donate https://ko-fi.com/sewsho
 * @website https://github.com/sewsho/BetterDiscordAddons
 */

module.exports = (meta) => {
  const { Data, Webpack, UI, Logger } = BdApi;

  const config = {
    changelog: [
      {
        title: "Initial Release",
        type: "added",
        items: ["Added configurable settings for Spotify keybinds and preferences."],
      },
    ],
    settings: [
      {
        type: "category",
        id: "preferences",
        name: "Preferences",
        collapsible: true,
        shown: false,
        settings: [
          {
            type: "switch",
            id: "toastNotifications",
            name: "Toast Notifications",
            note: "Show a toast when a Spotify keybind runs.",
            value: false,
          },
        ],
      },
      {
        type: "category",
        id: "keybinds",
        name: "Keybinds",
        collapsible: true,
        shown: true,
        settings: [
          {
            type: "keybind",
            id: "pauseKeybind",
            name: "Pause / Play",
            note: "Toggles Spotify playback.",
            value: ["Control", "End"],
            max: 4,
            clearable: true,
          },
          {
            type: "keybind",
            id: "previousKeybind",
            name: "Previous Track",
            note: "Returns to the previous Spotify track.",
            value: ["Control", "ArrowLeft"],
            max: 4,
            clearable: true,
          },
          {
            type: "keybind",
            id: "nextKeybind",
            name: "Next Track",
            note: "Skips to the next Spotify track.",
            value: ["Control", "ArrowRight"],
            max: 4,
            clearable: true,
          },
          {
            type: "keybind",
            id: "volumeUpKeybind",
            name: "Volume Up",
            note: "Raises Spotify volume by the configured step.",
            value: ["Control", "ArrowUp"],
            max: 4,
            clearable: true,
          },
          {
            type: "keybind",
            id: "volumeDownKeybind",
            name: "Volume Down",
            note: "Lowers Spotify volume by the configured step.",
            value: ["Control", "ArrowDown"],
            max: 4,
            clearable: true,
          },
          {
            type: "slider",
            id: "volumeStep",
            name: "Volume Step",
            note: "How much Volume Up and Volume Down adjust Spotify volume.",
            value: 10,
            min: 5,
            max: 25,
            markers: [5, 10, 15, 20, 25],
            stickToMarkers: false,
          },
          {
            type: "keybind",
            id: "muteKeybind",
            name: "Mute / Unmute",
            note: "Toggles Spotify volume between 0 and your previous level.",
            value: [],
            max: 4,
            clearable: true,
          },
        ],
      },
    ],
  };

  const keybinds = [
    { id: "pauseKeybind", nativeId: 74291001, run: togglePause },
    { id: "muteKeybind", nativeId: 74291002, run: toggleMute },
    { id: "volumeUpKeybind", nativeId: 74291003, run: () => adjustVolume(getVolumeStep()) },
    { id: "volumeDownKeybind", nativeId: 74291004, run: () => adjustVolume(-getVolumeStep()) },
    { id: "nextKeybind", nativeId: 74291005, run: () => skipTrack("next") },
    { id: "previousKeybind", nativeId: 74291006, run: () => skipTrack("previous") },
  ];

  const keyCodes = {
    Backspace: 8,
    Tab: 9,
    Enter: 13,
    Shift: 160,
    Control: 162,
    Alt: 164,
    Pause: 19,
    CapsLock: 20,
    Escape: 27,
    " ": 32,
    PageUp: 33,
    PageDown: 34,
    End: 35,
    Home: 36,
    ArrowLeft: 37,
    ArrowUp: 38,
    ArrowRight: 39,
    ArrowDown: 40,
    Insert: 45,
    Delete: 46,
    Meta: 91,
    ";": 186,
    ":": 186,
    "=": 187,
    "+": 187,
    ",": 188,
    "<": 188,
    "-": 189,
    _: 189,
    ".": 190,
    ">": 190,
    "/": 191,
    "?": 191,
    "`": 192,
    "~": 192,
    "[": 219,
    "{": 219,
    "\\": 220,
    "|": 220,
    "]": 221,
    "}": 221,
    "'": 222,
    '"': 222,
  };

  const registered = new Set();
  const lastRuns = {};
  let previousVolume = Data.load(meta.name, "previousVolume") ?? 50;
  let busy = false;

  function cloneDefaultSettings() {
    return JSON.parse(JSON.stringify(config.settings));
  }

  function loadSettings() {
    const saved = Data.load(meta.name, "settings") ?? [];
    const groupedSaved = new Map(saved.map((category) => [category.id, category]));

    config.settings = cloneDefaultSettings();
    for (const category of config.settings) {
      const savedCategory = groupedSaved.get(category.id);
      const savedSettings = new Map((savedCategory?.settings ?? []).map((setting) => [setting.id, setting]));

      for (const setting of category.settings) {
        const match = savedSettings.get(setting.id);
        if (match) setting.value = match.value;
      }
    }

    if (saved.length && !saved.some((category) => Array.isArray(category.settings))) saveSettings();
  }

  function saveSettings() {
    Data.save(meta.name, "settings", config.settings);
  }

  function getSettingsGroup(categoryId) {
    return config.settings.find((category) => category.id === categoryId)?.settings ?? [];
  }

  function getSettingValue(categoryId, settingId, defaultValue) {
    return getSettingsGroup(categoryId).find((setting) => setting.id === settingId)?.value ?? defaultValue;
  }

  function getVolumeStep() {
    const value = Number(getSettingValue("keybinds", "volumeStep", 10));
    return Number.isFinite(value) ? Math.max(1, Math.min(25, Math.round(value))) : 10;
  }

  function handleSettingChange(categoryId, id, value) {
    const setting = getSettingsGroup(categoryId).find((s) => s.id === id);
    if (!setting) return;

    if (categoryId === "keybinds" && setting.type === "keybind") {
      const error = getKeybindError(id, value);
      if (error) {
        setting.value = [];
        Logger.warn(`${meta.name}: ${error}`);
        UI.showToast(error, { type: "error" });
        saveSettings();
        registerKeybinds();
        return;
      }
    }

    if (setting) setting.value = value;
    saveSettings();
    if (categoryId === "keybinds") registerKeybinds();
  }

  function notify(message) {
    Logger.info(`${meta.name}: ${message}`);
    if (getSettingValue("preferences", "toastNotifications", false)) UI.showToast(message, { type: "info" });
  }

  function notifyError() {
    UI.showToast(`${meta.name}: Something went wrong. Check the console for more details.`, {
      type: "error",
      timeout: 5000,
    });
  }

  function notifyTokenRejected() {
    UI.showToast(
      `${meta.name}: Spotify token was rejected. Wait a few seconds or reload Discord if it persists.`,
      {
        type: "error",
        timeout: 10000,
      },
    );
  }

  function getToken() {
    return Webpack.getStore("SpotifyStore")?.getActiveSocketAndDevice?.()?.socket?.accessToken;
  }

  function spotifyFetch(endpoint, method, token) {
    return fetch(`https://api.spotify.com/v1/me/player${endpoint}`, {
      method,
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  async function request(endpoint = "", method = "GET") {
    const token = getToken();
    if (!token) {
      Logger.warn(`${meta.name}: No Spotify token available.`);
      notifyError();
      return null;
    }

    try {
      const res = await spotifyFetch(endpoint, method, token);

      if (res.status === 401) {
        Logger.warn(`${meta.name}: Spotify token was rejected. Try again in a moment or reload Discord.`);
        notifyTokenRejected();
      } else if (!res.ok && res.status !== 204) {
        Logger.warn(`${meta.name}: Spotify returned ${res.status}.`);
        notifyError();
      }

      return res;
    } catch (e) {
      Logger.error(`${meta.name}: Spotify request failed: ${e}`);
      notifyError();
      return null;
    }
  }

  async function getPlayer() {
    const res = await request();
    if (res?.status === 204) {
      Logger.warn(`${meta.name}: No active Spotify player found.`);
      notifyError();
      return null;
    }
    if (!res?.ok) return null;
    return res.json();
  }

  async function run(action) {
    if (busy) return;
    busy = true;
    try {
      await action();
    } finally {
      busy = false;
    }
  }

  async function togglePause() {
    run(async () => {
      const player = await getPlayer();
      if (!player) return;

      const paused = player.is_playing;
      const res = await request(paused ? "/pause" : "/play", "PUT");
      if (res?.ok) notify(paused ? "Paused Spotify." : "Resumed Spotify.");
    });
  }

  async function toggleMute() {
    run(async () => {
      const player = await getPlayer();
      if (!player) return;

      const volume = player.device?.volume_percent ?? 0;
      if (volume > 0) {
        previousVolume = volume;
        Data.save(meta.name, "previousVolume", previousVolume);
        const res = await request("/volume?volume_percent=0", "PUT");
        if (res?.ok) notify("Muted Spotify.");
      } else {
        const res = await request(`/volume?volume_percent=${previousVolume}`, "PUT");
        if (res?.ok) notify("Unmuted Spotify.");
      }
    });
  }

  async function adjustVolume(delta) {
    run(async () => {
      const player = await getPlayer();
      if (!player) return;

      const volume = player.device?.volume_percent ?? 0;
      const next = Math.max(0, Math.min(100, volume + delta));
      if (next > 0) {
        previousVolume = next;
        Data.save(meta.name, "previousVolume", previousVolume);
      }

      const res = await request(`/volume?volume_percent=${next}`, "PUT");
      if (res?.ok) notify(`Set Spotify volume to ${next}%.`);
    });
  }

  async function skipTrack(direction) {
    run(async () => {
      const player = await getPlayer();
      if (!player) return;

      const previous = direction === "previous";
      const res = await request(previous ? "/previous" : "/next", "POST");
      if (res?.ok) notify(`Skipped to the ${previous ? "previous" : "next"} Spotify track.`);
    });
  }

  function getNativeInput() {
    return Webpack.getByKeys("inputEventRegister", "inputEventUnregister", { searchExports: true });
  }

  function getKeyCode(key) {
    if (keyCodes[key]) return keyCodes[key];
    if (/^[A-Z]$/i.test(key)) return key.toUpperCase().charCodeAt(0);
    if (/^[0-9]$/.test(key)) return key.charCodeAt(0);

    const match = key.match(/^F([1-9]|1[0-9]|2[0-4])$/i);
    return match ? 111 + Number(match[1]) : null;
  }

  function isModifier(code) {
    return [16, 17, 18, 91, 92, 93, 160, 161, 162, 163, 164, 165].includes(code);
  }

  function toShortcut(keys) {
    if (!Array.isArray(keys) || !keys.length) return null;

    const codes = keys.map(getKeyCode);
    if (codes.some((code) => !code) || codes.every(isModifier)) return null;
    return codes.map((code) => [0, code, "0:0"]);
  }

  function getKeybindSignature(keys) {
    const shortcut = toShortcut(keys);
    return shortcut
      ? shortcut
          .map((key) => key[1])
          .sort((a, b) => a - b)
          .join("+")
      : null;
  }

  function getKeybindError(id, keys) {
    if (!Array.isArray(keys) || !keys.length) return null;

    const codes = keys.map(getKeyCode);
    if (codes.some((code) => !code)) return "That keybind uses an unsupported key.";
    if (codes.every(isModifier)) return "Modifier-only keybinds are not supported.";

    const signature = getKeybindSignature(keys);
    const duplicate = getSettingsGroup("keybinds").find(
      (setting) =>
        setting.id !== id && setting.type === "keybind" && getKeybindSignature(setting.value) === signature,
    );

    return duplicate ? `That keybind is already used by ${duplicate.name}.` : null;
  }

  function unregisterKeybinds() {
    const NativeInput = getNativeInput();
    if (!NativeInput) return;

    for (const id of registered) NativeInput.inputEventUnregister(id);
    registered.clear();
  }

  function runKeybind(keybind) {
    const now = Date.now();
    if (now - (lastRuns[keybind.id] ?? 0) < 150) return;

    lastRuns[keybind.id] = now;
    keybind.run();
  }

  function registerKeybinds() {
    unregisterKeybinds();

    const NativeInput = getNativeInput();
    if (!NativeInput) {
      Logger.error(`${meta.name}: Could not find Discord native input service.`);
      notifyError();
      return false;
    }

    const signatures = new Set();
    for (const keybind of keybinds) {
      const keys = getSettingValue("keybinds", keybind.id, []);
      const shortcut = toShortcut(keys);
      if (!shortcut) continue;

      const signature = getKeybindSignature(keys);
      if (signatures.has(signature)) {
        Logger.warn(`${meta.name}: Skipped duplicate native keybind ${keybind.id}.`);
        continue;
      }

      NativeInput.inputEventRegister(keybind.nativeId, shortcut, () => runKeybind(keybind), {
        focused: false,
      });
      registered.add(keybind.nativeId);
      signatures.add(signature);
    }

    Logger.info(`${meta.name}: Registered ${registered.size} native keybinds.`);
    return true;
  }

  function showChangelog() {
    const lastVersion = Data.load(meta.name, "version");
    if (lastVersion !== meta.version) {
      UI.showChangelogModal({
        title: meta.name,
        subtitle: meta.version,
        changes: config.changelog,
      });
      Data.save(meta.name, "version", meta.version);
    }
  }

  return {
    start() {
      loadSettings();
      showChangelog();

      if (registerKeybinds()) Logger.info(`${meta.name} v${meta.version} has started successfully.`);
      else
        UI.showToast(`${meta.name}: Failed to start. Please check the console for error details.`, {
          type: "error",
          timeout: 5000,
        });
    },

    stop() {
      unregisterKeybinds();
      Logger.info(`${meta.name} v${meta.version} has stopped successfully.`);
    },

    getSettingsPanel() {
      return UI.buildSettingsPanel({
        settings: config.settings,
        onChange: handleSettingChange,
      });
    },
  };
};
