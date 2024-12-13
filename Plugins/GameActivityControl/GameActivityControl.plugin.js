/**
 * @name GameActivityControl
 * @author Sewsho
 * @description Selectively control which games show up in your Discord activity status
 * @version 1.0.1
 */

module.exports = (meta) => {
  // -- Destructure -- //
  const { Data, Webpack, Patcher, UI } = BdApi;

  // -- Config -- //
  const config = {
    changelog: [
      {
        title: "New Stuff",
        type: "added",
        items: [
          "Updated to match new BdApi version for improved compatibility.",
          "Temporarily removed the search functionality; will be re-added later.",
          "Introduced automatic hiding of newly added games via configurable setting.",
        ],
      },
      {
        title: "Improvements",
        type: "improved",
        items: ["Enhanced settings panel with collapsible categories for better navigation."],
      },
      {
        title: "On-going",
        type: "progress",
        items: [
          "Adding more advanced game filtering options in future updates.",
          "Working on reintroducing the game search functionality.",
        ],
      },
    ],
    settings: [
      {
        type: "category",
        id: "settings",
        name: "Settings",
        collapsible: true,
        shown: true,
        settings: [
          {
            type: "switch",
            id: "newGamesHidden",
            name: "Auto Hide",
            note: "Automatically hide newly added games from your activity status.",
            value: false,
          },
        ],
      },
      {
        type: "category",
        id: "games",
        name: "Games",
        collapsible: true,
        shown: true,
        settings: [],
      },
    ],
  };

  // -- Functions -- //
  function loadSettings() {
    Object.assign(config.settings, Data.load(meta.name, "settings"));
  }

  function showChangelog() {
    const lastVersion = Data.load(meta.name, "version");
    if (lastVersion !== meta.version) {
      UI.showChangelogModal({
        title: meta.name,
        subtitle: meta.version,
        changes: config.changelog,
      });
      Data.save("version", meta.version);
    }
  }

  function addNewGamesToSettings(activities) {
    const pluginSettings = config.settings.find((setting) => setting.id === "settings").settings;
    const gamesSettings = config.settings.find((setting) => setting.id === "games").settings;
    const newGamesHidden = pluginSettings.find((setting) => setting.id === "newGamesHidden").value;

    activities.forEach((activity) => {
      const gameName = activity.name;
      if (gameName && !gamesSettings.some((game) => game.id === gameName)) {
        gamesSettings.push({
          type: "switch",
          id: gameName,
          name: gameName,
          value: !newGamesHidden,
        });
      }
    });
  }

  function patchSelfPresenceStore() {
    const selfPresenceStore = Webpack.getByKeys("getLocalPresence", "getActivities");

    BdApi.Patcher.after(meta.name, selfPresenceStore, "getActivities", (_, args, activities) => {
      addNewGamesToSettings(activities);
      Data.save(meta.name, "settings", config.settings);

      const filteredActivities = activities.filter((activity) => {
        const gameName = activity.name;
        const isHidden =
          config.settings
            .find((setting) => setting.id === "games")
            .settings.find((setting) => setting.id === gameName).value === false;

        return !isHidden;
      });

      return filteredActivities;
    });
  }

  function sortGamesSettings() {
    const gamesSettings = config.settings.find((setting) => setting.id === "games").settings;
    gamesSettings.sort((a, b) => {
      if (a.value === b.value) {
        return a.name.localeCompare(b.name);
      }
      return a.value ? 1 : -1;
    });

    Data.save(meta.name, "settings", config.settings);
  }

  function handleSettingChange(category, id, value) {
    const pluginSettings = config.settings.find((setting) => setting.id === "settings").settings;
    const gamesSettings = config.settings.find((setting) => setting.id === "games").settings;
    let setting;

    if (category === "settings") {
      setting = pluginSettings.find((setting) => setting.id === id);
    } else if (category === "games") {
      setting = gamesSettings.find((setting) => setting.id === id);
    }

    if (setting) {
      setting.value = value;
    }

    Data.save("settings", config.settings);
  }

  return {
    start: () => {
      loadSettings();
      showChangelog();
      patchSelfPresenceStore();
    },

    stop: () => {
      Patcher.unpatchAll(meta.name);
    },
    getSettingsPanel: () => {
      sortGamesSettings();

      return UI.buildSettingsPanel({
        settings: config.settings,
        onChange: (category, id, value) => {
          handleSettingChange(category, id, value);
        },
      });
    },
  };
};
