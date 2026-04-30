/**
 * @name ActivityFilter
 * @author Sewsho
 * @description Hide activities from your Discord status so other users never see them.
 * @version 2.1.2
 * @source https://github.com/sewsho/BetterDiscordAddons/blob/main/Plugins/ActivityFilter/ActivityFilter.plugin.js
 */

module.exports = (meta) => {
	const { Data, Webpack, Patcher, UI, Logger, React } = BdApi;

	// -- Constants -- //

	const ACTIVITY_TYPES = {
		0: "playing",
		1: "streaming",
		2: "listening",
		3: "watching",
		5: "competing",
	};

	const ACTIVITY_CATEGORY_IDS = new Set(Object.values(ACTIVITY_TYPES));

	// -- Config -- //

	const config = {
		changelog: [
			{
				title: "Maintenance Update | v2.1.2",
				type: "improved",
				items: ["Improved startup error handling and notifications."],
			},
			{
				title: "Sorting Fix | v2.1.1",
				type: "fixed",
				items: ["Hidden activities now show at the top of the list."],
			},
			{
				title: "Search Update | v2.1.0",
				type: "added",
				items: [
					"Activity categories now start collapsed by default, preventing the settings panel from becoming overwhelming.",
					"Added a search bar to the settings panel to instantly filter your activity list by name.",
				],
			},
		],
		settings: [
			{
				type: "category",
				id: "settings",
				name: "Settings",
				collapsible: true,
				settings: [
					{
						type: "switch",
						id: "newActivitiesHidden",
						name: "Auto Hide New Activities",
						note: "Automatically hide newly detected activities from your status.",
						value: false,
					},
				],
			},
			{ type: "category", id: "playing", name: "Playing", collapsible: true, shown: false, settings: [] },
			{ type: "category", id: "listening", name: "Listening", collapsible: true, shown: false, settings: [] },
			{ type: "category", id: "streaming", name: "Streaming", collapsible: true, shown: false, settings: [] },
			{ type: "category", id: "watching", name: "Watching", collapsible: true, shown: false, settings: [] },
			{ type: "category", id: "competing", name: "Competing", collapsible: true, shown: false, settings: [] },
		],
	};

	// -- Settings -- //

	function cloneDefaultSettings() {
		return JSON.parse(JSON.stringify(config.settings));
	}

	function mergeSettings(saved) {
		const defaults = cloneDefaultSettings();
		const savedMap = new Map(saved.map((c) => [c.id, c]));

		for (const category of defaults) {
			const savedCategory = savedMap.get(category.id);
			if (!savedCategory || !Array.isArray(category.settings)) continue;

			const defaultsMap = new Map(category.settings.map((s) => [s.id, s]));
			for (const savedSetting of savedCategory.settings ?? []) {
				const target = defaultsMap.get(savedSetting.id);
				if (target) target.value = savedSetting.value;
			}

			if (!ACTIVITY_CATEGORY_IDS.has(category.id)) continue;
			const existingIds = new Set(category.settings.map((s) => s.id));
			for (const savedSetting of savedCategory.settings ?? []) {
				if (!savedSetting?.id || existingIds.has(savedSetting.id)) continue;
				category.settings.push({
					type: "switch",
					id: savedSetting.id,
					name: savedSetting.name ?? savedSetting.id,
					note: "",
					value: savedSetting.value ?? true,
				});
			}
		}

		return defaults;
	}

	function getSavedSettings() {
		return Data.load(meta.name, "settings") ?? [];
	}

	function loadSettings() {
		config.settings = mergeSettings(getSavedSettings());
	}

	function saveSettings() {
		Data.save(meta.name, "settings", config.settings);
	}

	function getSettingsGroup(id) {
		return config.settings.find((s) => s.id === id)?.settings ?? [];
	}

	function getSettingValue(groupId, settingId, fallback = false) {
		return getSettingsGroup(groupId).find((s) => s.id === settingId)?.value ?? fallback;
	}

	// -- Activity Logic -- //

	function registerNewActivities(activities) {
		if (!Array.isArray(activities)) return;
		const autoHide = getSettingValue("settings", "newActivitiesHidden", false);
		let changed = false;

		for (const { name, type } of activities) {
			const categoryId = ACTIVITY_TYPES[type];
			if (!categoryId || !name) continue;

			const group = getSettingsGroup(categoryId);
			if (!group.some((s) => s.id === name)) {
				group.push({ type: "switch", id: name, name, note: "", value: !autoHide });
				changed = true;
			}
		}

		if (changed) saveSettings();
	}

	function isActivityHidden(type, name) {
		const categoryId = ACTIVITY_TYPES[type];
		if (!categoryId) return false;
		return getSettingsGroup(categoryId).find((s) => s.id === name)?.value === false;
	}

	function filterActivities(activities) {
		if (!Array.isArray(activities)) return activities;
		registerNewActivities(activities);
		return activities.filter(({ name, type }) => !isActivityHidden(type, name));
	}

	// -- Patching -- //

	function patchLocalActivityStore() {
		const LocalActivityStore = Webpack.getStore("LocalActivityStore");

		if (!LocalActivityStore) {
			Logger.error(`${meta.name}: Could not find LocalActivityStore.`);
			return false;
		}

		Patcher.after(meta.name, LocalActivityStore, "getActivities", (_, __, ret) => {
			if (!Array.isArray(ret)) return;
			return filterActivities(ret);
		});

		Logger.info(`${meta.name}: LocalActivityStore patched successfully.`);
		return true;
	}

	// -- Force Update -- //

	function forcePresenceUpdate() {
		const LocalActivityStore = Webpack.getStore("LocalActivityStore");
		if (!LocalActivityStore) return;
		try {
			LocalActivityStore.emitChange?.();
			LocalActivityStore.doEmitChanges?.();
		} catch (e) {
			Logger.warn(`${meta.name}: forcePresenceUpdate failed: ${e}`);
		}
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

	// -- Settings Panel -- //

	function sortActivityCategories() {
		for (const categoryId of ACTIVITY_CATEGORY_IDS) {
			const settings = config.settings.find((s) => s.id === categoryId)?.settings;
			if (!settings) continue;
			settings.sort((a, b) => (a.value === b.value ? a.name.localeCompare(b.name) : a.value ? -1 : 1));
		}
		saveSettings();
	}

	function handleSettingChange(categoryId, settingId, value) {
		const setting = config.settings
			.find((c) => c.id === categoryId)
			?.settings?.find((s) => s.id === settingId);
		if (setting) setting.value = value;
		saveSettings();
		forcePresenceUpdate();
	}

	function buildFilteredSettings(term) {
		const normalised = term.toLowerCase().trim();

		return config.settings
			.map((category) => {
				if (!ACTIVITY_CATEGORY_IDS.has(category.id)) return category;

				if (!normalised) {
					return category.settings.length > 0 ? category : null;
				}

				const matched = category.settings.filter((s) => s.name.toLowerCase().includes(normalised));

				if (!matched.length) return null;

				return { ...category, settings: matched, shown: true };
			})
			.filter(Boolean);
	}

	// -- Search Bar Component -- //

	function SearchableSettingsPanel() {
		const [search, setSearch] = React.useState("");

		const term = search.trim();

		const visibleSettings = React.useMemo(() => buildFilteredSettings(search), [search]);

		const hasActivityCategories = visibleSettings.some((c) => ACTIVITY_CATEGORY_IDS.has(c.id));

		const searchNote =
			term && !hasActivityCategories ? `No activities match "${term}".` : "Filter the activity list by name.";

		const searchItem = UI.buildSettingItem({
			type: "text",
			id: "activitySearch",
			name: "Search Activities",
			note: searchNote,
			value: search,
			placeholder: "e.g. Spotify, VSCode…",
			onChange: (value) => setSearch(value),
		});

		const panel = React.createElement(
			"div",
			{ key: term },
			UI.buildSettingsPanel({
				settings: visibleSettings,
				onChange: (category, id, value) => handleSettingChange(category, id, value),
			}),
		);

		return React.createElement("div", null, searchItem, panel);
	}

	// -- Lifecycle -- //

	return {
		start() {
			loadSettings();
			showChangelog();

			if (patchLocalActivityStore()) {
				forcePresenceUpdate();
				Logger.info(`${meta.name} v${meta.version} has started successfully.`);
			} else {
				UI.showToast(`${meta.name}: Failed to start. Please check the console for error details.`, {
					type: "error",
					timeout: 5000,
				});
			}
		},

		stop() {
			Patcher.unpatchAll(meta.name);
			forcePresenceUpdate();

			Logger.info(`${meta.name} v${meta.version} has stopped successfully.`);
		},

		getSettingsPanel() {
			sortActivityCategories();
			return React.createElement(SearchableSettingsPanel);
		},
	};
};
