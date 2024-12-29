/**
 * @name ActivityFilter
 * @author Sewsho
 * @description Customize which activities, games, or apps are displayed in your Discord status with advanced filtering and visibility options.
 * @version 1.1.1
 * @source https://github.com/sewsho/BetterDiscordAddons/blob/main/Plugins/ActivityFilter/ActivityFilter.plugin.js
 */

module.exports = (meta) => {
  // -- Destructure -- //
  const { Data, Webpack, Patcher, UI } = BdApi;

  // -- Config -- //
  const config = {
    changelog: [
      {
        title: 'Improvements',
        type: 'improved',
        items: [
          'Code optimization and cleanup for better performance',
          'Enhanced error handling for activity settings',
        ],
      },
      {
        title: 'Bug Fixes',
        type: 'fixed',
        items: ['Improved handling of undefined activity states'],
      },
      {
        title: 'On-going',
        type: 'progress',
        items: [
          'Working on profiles: create and select activities for each profile (e.g., "Work" profile for relevant activities)',
          'Working on reintroducing the activity search functionality',
        ],
      },
    ],
    settings: [
      {
        type: 'category',
        id: 'settings',
        name: 'Settings',
        collapsible: true,
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
        settings: [],
      },
      {
        type: 'category',
        id: 'listening',
        name: 'Listening',
        collapsible: true,
        settings: [],
      },
      {
        type: 'category',
        id: 'streaming',
        name: 'Streaming',
        collapsible: true,
        settings: [],
      },
      {
        type: 'category',
        id: 'watching',
        name: 'Watching',
        collapsible: true,
        settings: [],
      },
      {
        type: 'category',
        id: 'competing',
        name: 'Competing',
        collapsible: true,
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
    const activityTypes = {
      0: 'playing',
      1: 'streaming',
      2: 'listening',
      3: 'watching',
      5: 'competing',
    };

    const getSettingsGroup = (id) => config.settings.find((setting) => setting.id === id)?.settings;
    const newActivitiesHidden = getSettingsGroup('settings').find(
      (setting) => setting.id === 'newActivitiesHidden'
    ).value;

    activities.forEach(({ name, type }) => {
      const categoryId = activityTypes[type];
      if (!categoryId || !name) return;

      const categorySettings = getSettingsGroup(categoryId);
      if (!categorySettings.some((setting) => setting.id === name)) {
        categorySettings.push({
          type: 'switch',
          id: name,
          name: name,
          value: !newActivitiesHidden,
        });
      }
    });
  }

  function isActivityHidden(activityType, activityName) {
    const activityTypes = {
      0: 'playing',
      1: 'streaming',
      2: 'listening',
      3: 'watching',
      5: 'competing',
    };

    const categoryId = activityTypes[activityType];
    if (!categoryId) return false;

    const categorySettings = config.settings.find((setting) => setting.id === categoryId)?.settings;
    const activitySetting = categorySettings?.find((setting) => setting.id === activityName);

    return activitySetting?.value === false;
  }

  function patchSelfPresenceStore() {
    const selfPresenceStore = Webpack.getByKeys('getLocalPresence', 'getActivities');

    BdApi.Patcher.after(meta.name, selfPresenceStore, 'getActivities', (_, args, activities) => {
      addNewActivitiesToSettings(activities);
      Data.save(meta.name, 'settings', config.settings);

      return activities.filter(({ name, type }) => !isActivityHidden(type, name));
    });
  }

  function sortActivitiesSettings() {
    const activityTypes = ['playing', 'streaming', 'listening', 'watching', 'competing'];

    activityTypes.forEach((type) => {
      const settings = config.settings.find((s) => s.id === type)?.settings;
      if (!settings) return;

      settings.sort((a, b) =>
        a.value === b.value ? a.name.localeCompare(b.name) : a.value ? 1 : -1
      );
    });

    Data.save(meta.name, 'settings', config.settings);
  }

  function getVisibleCategories() {
    return config.settings.filter((category) => category.settings.length > 0);
  }

  function handleSettingChange(category, id, value) {
    const setting = config.settings
      .find((s) => s.id === category)
      ?.settings?.find((s) => s.id === id);
    if (setting) setting.value = value;

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
