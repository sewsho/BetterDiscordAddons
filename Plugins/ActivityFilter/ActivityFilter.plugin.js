/**
 * @name ActivityFilter
 * @author Sewsho
 * @description Customize which activities, games, or apps are displayed in your Discord status with advanced filtering and visibility options.
 * @version 1.1.0
 * @source https://github.com/sewsho/BetterDiscordAddons/blob/main/Plugins/ActivityFilter/ActivityFilter.plugin.js
 */

module.exports = (meta) => {
  // -- Destructure -- //
  const { Data, Webpack, Patcher, UI } = BdApi;

  // -- Config -- //
  const config = {
    changelog: [
      {
        title: 'New Stuff',
        type: 'added',
        items: [
          'Added filtering for activities based on type (Playing, Streaming, Listening, Watching, Competing).',
          'Categories without any activities will be hidden.',
        ],
      },
      {
        title: 'Improvements',
        type: 'improved',
        items: [
          'Enhanced settings panel with collapsible categories for better navigation.',
        ],
      },
      {
        title: 'On-going',
        type: 'progress',
        items: [
          'Working on profiles: create and select activities for each profile (e.g., "Work" profile for relevant activities).',
          'Working on reintroducing the activity search functionality.',
        ],
      },
    ],
    settings: [
      {
        type: 'category',
        id: 'settings',
        name: 'Settings',
        collapsible: true,
        shown: true,
        settings: [
          {
            type: 'switch',
            id: 'newActivitiesHidden',
            name: 'Auto Hide',
            note: 'Automatically hide newly added activities from your activity status.',
            value: false,
          },
        ],
      },
      {
        type: 'category',
        id: 'playing',
        name: 'Playing',
        collapsible: true,
        shown: true,
        settings: [],
      },
      {
        type: 'category',
        id: 'listening',
        name: 'Listening',
        collapsible: true,
        shown: true,
        settings: [],
      },
      {
        type: 'category',
        id: 'streaming',
        name: 'Streaming',
        collapsible: true,
        shown: true,
        settings: [],
      },
      {
        type: 'category',
        id: 'watching',
        name: 'Watching',
        collapsible: true,
        shown: true,
        settings: [],
      },
      {
        type: 'category',
        id: 'competing',
        name: 'Competing',
        collapsible: true,
        shown: true,
        settings: [],
      },
    ],
  };

  // -- Functions -- //
  function loadSettings() {
    Object.assign(config.settings, Data.load(meta.name, 'settings'));
  }

  function showChangelog() {
    const lastVersion = Data.load(meta.name, 'version');
    if (lastVersion !== meta.version) {
      UI.showChangelogModal({
        title: meta.name,
        subtitle: meta.version,
        changes: config.changelog,
      });
      Data.save(meta.name, 'version', meta.version);
    }
  }

  function addNewActivitiesToSettings(activities) {
    const pluginSettings = config.settings.find(
      (setting) => setting.id === 'settings'
    ).settings;

    const playingSettings = config.settings.find(
      (setting) => setting.id === 'playing'
    ).settings;
    const streamingSettings = config.settings.find(
      (setting) => setting.id === 'streaming'
    ).settings;
    const listeningSettings = config.settings.find(
      (setting) => setting.id === 'listening'
    ).settings;
    const watchingSettings = config.settings.find(
      (setting) => setting.id === 'watching'
    ).settings;
    const competingSettings = config.settings.find(
      (setting) => setting.id === 'competing'
    ).settings;

    const newActivitiesHidden = pluginSettings.find(
      (setting) => setting.id === 'newActivitiesHidden'
    ).value;

    activities.forEach((activity) => {
      const activityName = activity.name;
      const activityType = activity.type;

      let settingsArray;

      switch (activityType) {
        case 0: // Playing
          settingsArray = playingSettings;
          break;
        case 1: // Streaming
          settingsArray = streamingSettings;
          break;
        case 2: // Listening
          settingsArray = listeningSettings;
          break;
        case 3: // Watching
          settingsArray = watchingSettings;
          break;
        case 5: // Competing
          settingsArray = competingSettings;
          break;
        default:
          return;
      }

      if (
        activityName &&
        !settingsArray.some((setting) => setting.id === activityName)
      ) {
        settingsArray.push({
          type: 'switch',
          id: activityName,
          name: activityName,
          value: !newActivitiesHidden,
        });
      }
    });
  }

  function isActivityHidden(activityType, activityName) {
    let settingsArray;
    switch (activityType) {
      case 0: // Playing
        settingsArray = config.settings.find(
          (setting) => setting.id === 'playing'
        ).settings;
        break;
      case 1: // Streaming
        settingsArray = config.settings.find(
          (setting) => setting.id === 'streaming'
        ).settings;
        break;
      case 2: // Listening
        settingsArray = config.settings.find(
          (setting) => setting.id === 'listening'
        ).settings;
        break;
      case 3: // Watching
        settingsArray = config.settings.find(
          (setting) => setting.id === 'watching'
        ).settings;
        break;
      case 5: // Competing
        settingsArray = config.settings.find(
          (setting) => setting.id === 'competing'
        ).settings;
        break;
      default:
        return false;
    }

    const activitySetting = settingsArray.find(
      (setting) => setting.id === activityName
    );
    return activitySetting ? activitySetting.value === false : false;
  }

  function patchSelfPresenceStore() {
    const selfPresenceStore = Webpack.getByKeys(
      'getLocalPresence',
      'getActivities'
    );

    BdApi.Patcher.after(
      meta.name,
      selfPresenceStore,
      'getActivities',
      (_, args, activities) => {
        addNewActivitiesToSettings(activities);
        Data.save(meta.name, 'settings', config.settings);

        const filteredActivities = activities.filter((activity) => {
          const activityName = activity.name;
          const activityType = activity.type;

          return !isActivityHidden(activityType, activityName);
        });

        return filteredActivities;
      }
    );
  }

  function sortActivitiesSettings() {
    const activityTypes = [
      'playing',
      'streaming',
      'listening',
      'watching',
      'competing',
    ];

    activityTypes.forEach((type) => {
      const activitySettings = config.settings.find(
        (setting) => setting.id === type
      ).settings;

      activitySettings.sort((a, b) => {
        if (a.value === b.value) {
          return a.name.localeCompare(b.name);
        }
        return a.value ? 1 : -1;
      });
    });

    Data.save(meta.name, 'settings', config.settings);
  }

  function getVisibleCategories() {
    return config.settings.filter((category) => category.settings.length > 0);
  }

  function handleSettingChange(category, id, value) {
    const categorySettings = config.settings.find(
      (setting) => setting.id === category
    ).settings;

    const setting = categorySettings.find((setting) => setting.id === id);
    if (setting) {
      setting.value = value;
    }

    Data.save(meta.name, 'settings', config.settings);
  }

  // -- Main -- //
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
      sortActivitiesSettings();
      const visibleCategories = getVisibleCategories();

      return UI.buildSettingsPanel({
        settings: visibleCategories,
        onChange: (category, id, value) => {
          handleSettingChange(category, id, value);
        },
      });
    },
  };
};
