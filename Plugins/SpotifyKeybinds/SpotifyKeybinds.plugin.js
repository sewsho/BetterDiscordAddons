/**
 * @name SpotifyKeybinds
 * @author Sewsho
 * @description Control Spotify with custom keybinds from anywhere on your PC, even in-game.
 * @version 1.0.0
 * @source https://github.com/sewsho/BetterDiscordAddons/blob/main/Plugins/SpotifyKeybinds/SpotifyKeybinds.plugin.js
 * @donate https://ko-fi.com/sewsho
 * @website https://github.com/sewsho/BetterDiscordAddons
 */

module.exports = (meta) => {
  const { Data, Webpack, UI, Logger, Net } = BdApi;

  // -- Config -- //

  const SPOTIFY_API = "https://api.spotify.com/v1/me/player";

  const config = {
    changelog: [
      {
        title: "Initial Release",
        type: "added",
        items: [
          "Pause and resume Spotify playback.",
          "Skip to the next or previous track.",
          "Raise or lower volume by a configurable step.",
          "Mute and unmute while remembering your previous volume.",
          "All keybinds work globally, even in-game.",
        ],
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
            note: "Show a toast notification when a Spotify keybind is triggered.",
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
    { id: "pauseKeybind", nativeId: 74291001, action: togglePlayback },
    { id: "muteKeybind", nativeId: 74291002, action: toggleMute },
    { id: "volumeUpKeybind", nativeId: 74291003, action: () => changeVolume(getVolumeStep()) },
    { id: "volumeDownKeybind", nativeId: 74291004, action: () => changeVolume(-getVolumeStep()) },
    { id: "nextKeybind", nativeId: 74291005, action: () => changeTrack("next") },
    { id: "previousKeybind", nativeId: 74291006, action: () => changeTrack("previous") },
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
  };

  const modifierCodes = new Set([16, 17, 18, 91, 92, 93, 160, 161, 162, 163, 164, 165]);

  const registeredKeybinds = new Set();
  let cachedToken = null;

  let previousVolume = Data.load(meta.name, "previousVolume") ?? 50;
  let currentVolume = Data.load(meta.name, "currentVolume") ?? previousVolume;

  // -- Settings -- //

  function loadSettings() {
    const saved = Data.load(meta.name, "settings") ?? [];
    const defaults = JSON.parse(JSON.stringify(config.settings));

    for (const category of defaults) {
      const savedCategory = saved.find((c) => c.id === category.id);
      if (!savedCategory || !Array.isArray(savedCategory.settings)) continue;

      for (const setting of category.settings) {
        const savedSetting = savedCategory.settings.find((s) => s.id === setting.id);
        if (savedSetting) setting.value = savedSetting.value;
      }
    }

    config.settings = defaults;
  }

  function saveSettings() {
    Data.save(meta.name, "settings", config.settings);
  }

  function getSettingValue(groupId, settingId, fallback) {
    const setting = config.settings
      .find((group) => group.id === groupId)
      ?.settings?.find((s) => s.id === settingId);
    return setting?.value ?? fallback;
  }

  function handleSettingChange(categoryId, settingId, value) {
    const setting = config.settings
      .find((category) => category.id === categoryId)
      ?.settings?.find((s) => s.id === settingId);
    if (!setting) return;

    if (setting.type === "keybind") {
      const error = getKeybindError(settingId, value);
      if (error) {
        setting.value = [];
        saveSettings();
        registerKeybinds();
        notify(error, "error");
        return;
      }
    }

    setting.value = value;
    saveSettings();

    if (categoryId === "keybinds") registerKeybinds();
  }

  // -- Notifications -- //

  function notify(message, type = "info") {
    if (type === "error") Logger.error(`${meta.name}: ${message}`);
    else if (type === "warning") Logger.warn(`${meta.name}: ${message}`);
    else Logger.info(`${meta.name}: ${message}`);

    if (
      type === "error" ||
      type === "warning" ||
      getSettingValue("preferences", "toastNotifications", false)
    ) {
      UI.showToast(message, { type, timeout: type === "error" ? 5000 : 3000 });
    }
  }

  // -- Spotify Token -- //

  let SpotifyStore = null;

  function syncTokenFromStore() {
    const token = SpotifyStore?.getActiveSocketAndDevice()?.socket?.accessToken;
    if (token) cachedToken = token;
  }

  function startTokenSync() {
    SpotifyStore = Webpack.getStore("SpotifyStore");
    if (!SpotifyStore) return false;

    SpotifyStore.addChangeListener(syncTokenFromStore);
    syncTokenFromStore();
    return true;
  }

  function stopTokenSync() {
    SpotifyStore?.removeChangeListener(syncTokenFromStore);
    SpotifyStore = null;
  }

  async function refreshSpotifyToken() {
    const socket = SpotifyStore?.getActiveSocketAndDevice()?.socket;
    if (!socket) return false;

    notify("Refreshing Spotify token.", "warning");

    const previousToken = cachedToken;

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        SpotifyStore.removeChangeListener(onStoreChange);
        resolve(false);
      }, 5000);

      function onStoreChange() {
        syncTokenFromStore();
        if (cachedToken === previousToken) return;
        clearTimeout(timeout);
        SpotifyStore.removeChangeListener(onStoreChange);
        resolve(true);
      }

      SpotifyStore.addChangeListener(onStoreChange);
      socket.handleDeviceStateChange();
    });
  }

  // -- Spotify API -- //

  async function spotifyRequest(endpoint = "", method = "GET", retryOnRefresh = true) {
    syncTokenFromStore();

    if (!cachedToken) {
      notify("Make sure Spotify is connected and playing.", "error");
      return null;
    }

    try {
      const response = await Net.fetch(`${SPOTIFY_API}${endpoint}`, {
        method,
        headers: { Authorization: `Bearer ${cachedToken}` },
      });

      if (response.status === 401) {
        if (retryOnRefresh && (await refreshSpotifyToken())) return spotifyRequest(endpoint, method, false);
        notify("Spotify token expired. Try pausing manually to refresh it.", "error");
        return response;
      }

      if (response.status === 404)
        notify("No active Spotify player found. Make sure Spotify is connected and playing.", "error");

      return response;
    } catch (error) {
      Logger.error(`${meta.name}: Spotify request failed: ${error}`);
      notify("Spotify request failed. Check the console for details.", "error");
      return null;
    }
  }

  async function getPlayer() {
    const response = await spotifyRequest();
    if (response?.status === 204) {
      notify("No active Spotify player found. Make sure Spotify is connected and playing.", "error");
      return null;
    }

    if (!response?.ok) return null;

    const player = await response.json();
    saveCurrentVolume(getPlayerVolume(player));
    return player;
  }

  function togglePlayback() {
    void (async () => {
      const player = await getPlayer();
      if (!player) return;

      const endpoint = player.is_playing ? "/pause" : "/play";
      const message = player.is_playing ? "Paused Spotify." : "Resumed Spotify.";
      const response = await spotifyRequest(endpoint, "PUT");

      if (response?.ok) notify(message);
    })();
  }

  function toggleMute() {
    void (async () => {
      const isMuted = currentVolume === 0;
      const nextVolume = isMuted ? previousVolume : 0;

      const response = await spotifyRequest(`/volume?volume_percent=${nextVolume}`, "PUT");
      if (!response?.ok) return;

      if (!isMuted) savePreviousVolume(currentVolume);
      saveCurrentVolume(nextVolume);
      notify(isMuted ? "Unmuted Spotify." : "Muted Spotify.");
    })();
  }

  function changeVolume(amount) {
    void (async () => {
      const nextVolume = Math.max(0, Math.min(100, currentVolume + amount));
      const response = await spotifyRequest(`/volume?volume_percent=${nextVolume}`, "PUT");
      if (!response?.ok) return;

      if (nextVolume > 0) savePreviousVolume(nextVolume);
      saveCurrentVolume(nextVolume);
      notify(`Set volume to ${nextVolume}%.`);
    })();
  }

  function changeTrack(direction) {
    void (async () => {
      const isPrevious = direction === "previous";
      const response = await spotifyRequest(isPrevious ? "/previous" : "/next", "POST");
      if (response?.ok) notify(`Skipped to the ${isPrevious ? "previous" : "next"} track.`);
    })();
  }

  function getPlayerVolume(player) {
    const volume = player?.device?.volume_percent;
    return Number.isFinite(volume) ? volume : 0;
  }

  function saveCurrentVolume(value) {
    currentVolume = Math.max(0, Math.min(100, value));
    Data.save(meta.name, "currentVolume", currentVolume);
  }

  function savePreviousVolume(value) {
    previousVolume = Math.max(1, Math.min(100, value));
    Data.save(meta.name, "previousVolume", previousVolume);
  }

  function getVolumeStep() {
    const value = Number(getSettingValue("keybinds", "volumeStep", 10));
    return Math.max(1, Math.min(25, Math.round(value) || 10));
  }

  // -- Keybinds -- //

  function getKeyCode(key) {
    if (keyCodes[key]) return keyCodes[key];
    if (/^[A-Z]$/i.test(key)) return key.toUpperCase().charCodeAt(0);
    if (/^[0-9]$/.test(key)) return key.charCodeAt(0);

    const fn = key.match(/^F([1-9]|1[0-9]|2[0-4])$/i);
    if (fn) return 111 + Number(fn[1]);

    return null;
  }

  function makeShortcut(keys) {
    if (!Array.isArray(keys) || !keys.length) return null;

    const codes = keys.map((key) => getKeyCode(key));
    if (codes.some((code) => !code)) return null;
    if (codes.every((code) => modifierCodes.has(code))) return null;

    return codes.map((code) => [0, code, "0:0"]);
  }

  function getKeybindSignature(keys) {
    const shortcut = makeShortcut(keys);
    if (!shortcut) return null;

    return shortcut
      .map((key) => key[1])
      .sort((a, b) => a - b)
      .join("+");
  }

  function getKeybindError(settingId, keys) {
    if (!Array.isArray(keys) || !keys.length) return null;

    const codes = keys.map((key) => getKeyCode(key));
    if (codes.some((code) => !code))
      return "That keybind uses a symbol key that may not work on every keyboard layout.";
    if (codes.every((code) => modifierCodes.has(code))) return "Modifier-only keybinds are not supported.";

    const signature = getKeybindSignature(keys);
    for (const setting of config.settings.find((g) => g.id === "keybinds")?.settings ?? []) {
      if (setting.id === settingId || setting.type !== "keybind") continue;
      if (getKeybindSignature(setting.value) === signature)
        return `That keybind is already used by ${setting.name}.`;
    }

    return null;
  }

  let NativeInput = null;

  function unregisterKeybinds() {
    if (NativeInput) {
      for (const id of registeredKeybinds) NativeInput.inputEventUnregister(id);
    }
    registeredKeybinds.clear();
  }

  function registerKeybinds() {
    unregisterKeybinds();

    if (!NativeInput)
      NativeInput = Webpack.getByKeys("inputEventRegister", "inputEventUnregister", { searchExports: true });
    if (!NativeInput) {
      notify("Could not find Discord's native input service.", "error");
      return false;
    }

    const usedSignatures = new Set();

    for (const keybind of keybinds) {
      const keys = getSettingValue("keybinds", keybind.id, []);
      const shortcut = makeShortcut(keys);
      const signature = getKeybindSignature(keys);

      if (!shortcut || !signature || usedSignatures.has(signature)) continue;

      try {
        NativeInput.inputEventRegister(keybind.nativeId, shortcut, keybind.action, { focused: false });
        registeredKeybinds.add(keybind.nativeId);
        usedSignatures.add(signature);
      } catch (error) {
        Logger.warn(`${meta.name}: Could not register ${keybind.id}: ${error}`);
      }
    }

    Logger.info(`${meta.name}: Registered ${registeredKeybinds.size} native keybinds.`);
    return true;
  }

  // -- Changelog -- //

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

  // -- Lifecycle -- //

  return {
    start() {
      loadSettings();
      showChangelog();

      if (!startTokenSync() || !registerKeybinds()) {
        UI.showToast(`${meta.name}: Failed to start. Please check the console for error details.`, {
          type: "error",
          timeout: 5000,
        });
        return;
      }

      Logger.info(`${meta.name} v${meta.version} has started successfully.`);
    },

    stop() {
      unregisterKeybinds();
      stopTokenSync();
      NativeInput = null;
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
