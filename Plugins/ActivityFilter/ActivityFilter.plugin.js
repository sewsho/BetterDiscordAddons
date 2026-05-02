/**
 * @name ActivityFilter
 * @author Sewsho
 * @description Hide activities from your Discord status so other users never see them.
 * @version 2.2.0
 * @source https://github.com/sewsho/BetterDiscordAddons/blob/main/Plugins/ActivityFilter/ActivityFilter.plugin.js
 * @donate https://ko-fi.com/sewsho
 * @website https://github.com/sewsho/BetterDiscordAddons
 */

module.exports = (meta) => {
	const { Data, Webpack, Patcher, UI, Logger, React } = BdApi;

	// -- Config -- //

	const config = {
		changelog: [
			{
				title: "Anonymizer Mode | v2.2.0",
				type: "added",
				items: [
					"Added separate 'Anonymize' toggles to each activity category for more granular privacy control.",
					"Anonymized activities now display a generic status (e.g. 'Playing a game') instead of being hidden from your status entirely.",
				],
			},
			{
				title: "Maintenance Update | v2.1.2",
				type: "improved",
				items: ["Improved startup error handling and notifications."],
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
					{
						type: "switch",
						id: "anonymizePlaying",
						name: "Anonymize Playing",
						note: 'Show games as "Playing a game" instead of revealing their titles.',
						value: false,
					},
					{
						type: "switch",
						id: "anonymizeListening",
						name: "Anonymize Listening",
						note: 'Show listening activities as "Listening to music" instead of revealing their titles.',
						value: false,
					},
					{
						type: "switch",
						id: "anonymizeStreaming",
						name: "Anonymize Streaming",
						note: 'Show streams as "Streaming something" instead of revealing their titles. Stream links use a neutral placeholder.',
						value: false,
					},
					{
						type: "switch",
						id: "anonymizeWatching",
						name: "Anonymize Watching",
						note: 'Show watching activities as "Watching something" instead of revealing their titles.',
						value: false,
					},
					{
						type: "switch",
						id: "anonymizeCompeting",
						name: "Anonymize Competing",
						note: 'Show competing activities as "Competing in something" instead of revealing their titles.',
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

			if (!isActivityCategoryId(category.id)) continue;
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

	function getActivityCategoryId(type) {
		switch (type) {
			case 0:
				return "playing";
			case 1:
				return "streaming";
			case 2:
				return "listening";
			case 3:
				return "watching";
			case 5:
				return "competing";
			default:
				return null;
		}
	}

	function isActivityCategoryId(id) {
		return ["playing", "streaming", "listening", "watching", "competing"].includes(id);
	}

	function getAnonymizedActivityName(type) {
		switch (type) {
			case 0:
				return "Playing a game";
			case 1:
				return "Streaming something";
			case 2:
				return "Listening to music";
			case 3:
				return "Watching something";
			case 5:
				return "Competing in something";
			default:
				return null;
		}
	}

	function getAnonymizerSettingId(type) {
		switch (type) {
			case 0:
				return "anonymizePlaying";
			case 1:
				return "anonymizeStreaming";
			case 2:
				return "anonymizeListening";
			case 3:
				return "anonymizeWatching";
			case 5:
				return "anonymizeCompeting";
			default:
				return null;
		}
	}

	function getAnonymizedCategoryId(settingId) {
		switch (settingId) {
			case "anonymizePlaying":
				return "playing";
			case "anonymizeStreaming":
				return "streaming";
			case "anonymizeListening":
				return "listening";
			case "anonymizeWatching":
				return "watching";
			case "anonymizeCompeting":
				return "competing";
			default:
				return null;
		}
	}

	function anonymizeCategoryActivities(categoryId) {
		for (const setting of getSettingsGroup(categoryId)) setting.value = false;
	}

	function getAnonymizerPreviousStates() {
		return Data.load(meta.name, "anonymizerPreviousStates") ?? {};
	}

	function saveAnonymizerPreviousStates(states) {
		Data.save(meta.name, "anonymizerPreviousStates", states);
	}

	function saveCategoryActivityStates(categoryId) {
		const states = getAnonymizerPreviousStates();
		states[categoryId] = Object.fromEntries(getSettingsGroup(categoryId).map((s) => [s.id, s.value]));
		saveAnonymizerPreviousStates(states);
	}

	function restoreCategoryActivityStates(categoryId) {
		const states = getAnonymizerPreviousStates();
		const categoryStates = states[categoryId];
		if (!categoryStates) return;

		for (const setting of getSettingsGroup(categoryId)) {
			if (Object.hasOwn(categoryStates, setting.id)) setting.value = categoryStates[setting.id];
		}

		delete states[categoryId];
		saveAnonymizerPreviousStates(states);
	}

	function registerNewActivities(activities) {
		if (!Array.isArray(activities)) return;
		const autoHide = getSettingValue("settings", "newActivitiesHidden", false);
		let changed = false;

		for (const { name, type } of activities) {
			const categoryId = getActivityCategoryId(type);
			if (!categoryId || !name) continue;

			const group = getSettingsGroup(categoryId);
			if (!group.some((s) => s.id === name)) {
				group.push({
					type: "switch",
					id: name,
					name,
					note: "",
					value: !autoHide && !isAnonymizerEnabled(type),
				});
				changed = true;
			}
		}

		if (changed) saveSettings();
	}

	function isActivityHidden(type, name) {
		const categoryId = getActivityCategoryId(type);
		if (!categoryId) return false;
		return getSettingsGroup(categoryId).find((s) => s.id === name)?.value === false;
	}

	function isAnonymizerEnabled(type) {
		const settingId = getAnonymizerSettingId(type);
		return settingId ? getSettingValue("settings", settingId, false) : false;
	}

	function isSpotifyActivity(activity) {
		return activity?.type === 2 && activity?.name === "Spotify";
	}

	function anonymizeSpotifyActivity(activity) {
		const anonymized = {
			...activity,
			details: "Listening to music",
			state: "Listening to music",
			assets: {
				...activity.assets,
				large_image: undefined,
				large_text: "Listening to music",
			},
		};

		delete anonymized.sync_id;
		return anonymized;
	}

	function anonymizeActivity(activity) {
		if (isSpotifyActivity(activity)) return anonymizeSpotifyActivity(activity);

		const name = getAnonymizedActivityName(activity.type);
		if (!name) return activity;

		const anonymized = {
			...activity,
			name,
		};

		delete anonymized.details;
		delete anonymized.state;
		delete anonymized.assets;
		delete anonymized.application_id;
		delete anonymized.buttons;
		delete anonymized.metadata;
		delete anonymized.party;
		delete anonymized.sync_id;
		delete anonymized.session_id;
		delete anonymized.secrets;

		if (activity.type === 1) anonymized.url = "https://www.twitch.tv/activityfilter-anonymized-stream";
		else delete anonymized.url;

		return anonymized;
	}

	function filterActivities(activities) {
		if (!Array.isArray(activities)) return activities;
		registerNewActivities(activities);

		return activities
			.map((activity) => {
				if (!isActivityHidden(activity.type, activity.name)) return activity;
				if (!isAnonymizerEnabled(activity.type)) return null;
				return anonymizeActivity(activity);
			})
			.filter(Boolean);
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
		for (const categoryId of ["playing", "streaming", "listening", "watching", "competing"]) {
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

		const anonymizedCategoryId = getAnonymizedCategoryId(settingId);
		if (anonymizedCategoryId) {
			if (value) {
				saveCategoryActivityStates(anonymizedCategoryId);
				anonymizeCategoryActivities(anonymizedCategoryId);
			} else {
				restoreCategoryActivityStates(anonymizedCategoryId);
			}
		}

		saveSettings();
		forcePresenceUpdate();
	}

	function buildFilteredSettings(term) {
		const normalised = term.toLowerCase().trim();

		return config.settings
			.map((category) => {
				if (!isActivityCategoryId(category.id)) return category;

				if (!normalised) {
					return category.settings.length > 0 ? { ...category, settings: category.settings } : null;
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
		const panelSettings = visibleSettings.filter(
			(category) => !isActivityCategoryId(category.id) || category.settings?.length,
		);

		const hasActivityCategories = panelSettings.some((c) => isActivityCategoryId(c.id));

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
				settings: panelSettings,
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
