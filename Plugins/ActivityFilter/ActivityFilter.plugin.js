/**
 * @name ActivityFilter
 * @author Sewsho
 * @description Hide activities from your Discord status so other users never see them. Filters are applied directly to outgoing presence updates.
 * @version 2.0.0
 * @source https://github.com/sewsho/BetterDiscordAddons/blob/main/Plugins/ActivityFilter/ActivityFilter.plugin.js
 */

module.exports = (meta) => {
	const { Data, Webpack, Patcher, UI, Logger } = BdApi;

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
				title: "V2 Rewrite",
				type: "added",
				items: [
					"Improved presence filtering through refined protocol interception.",
					"Added support for real-time status updates when toggling filters.",
					"Enhanced detection for active activities on startup.",
					"Refined settings management for better stability across updates.",
					"Fixed: activities now restore instantly when stopping the plugin.",
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
			{ type: "category", id: "playing", name: "Playing", collapsible: true, settings: [] },
			{ type: "category", id: "listening", name: "Listening", collapsible: true, settings: [] },
			{ type: "category", id: "streaming", name: "Streaming", collapsible: true, settings: [] },
			{ type: "category", id: "watching", name: "Watching", collapsible: true, settings: [] },
			{ type: "category", id: "competing", name: "Competing", collapsible: true, settings: [] },
		],
	};

	// -- Settings -- //

	function cloneDefaultSettings() {
		return JSON.parse(JSON.stringify(config.settings));
	}

	function getSavedSettings() {
		return Data.load(meta.name, "settings") ?? [];
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
	function patchPresence() {
		const handler = Webpack.getModule((m) => m?.emitPresenceUpdate && m?.socket, {
			searchExports: true,
		});

		if (!handler?.socket?.send) {
			Logger.error(`${meta.name}: Could not find presence handler or socket.`);
			return;
		}

		Patcher.before(meta.name, handler.socket, "send", (_, args) => {
			// args: (opcode, data, requiresSession)
			if (args[0] !== 3 || !Array.isArray(args[1]?.activities)) return;

			// Clone the data object to avoid mutating Discord's internal state
			args[1] = {
				...args[1],
				activities: filterActivities(args[1].activities),
			};
		});

		// Logger.info(`${meta.name}: socket.send patched for op 3 filtering.`);
	}

	function forcePresenceUpdate() {
		const handler = Webpack.getModule((m) => m?.emitPresenceUpdate && m?.socket, {
			searchExports: true,
		});
		handler?.emitPresenceUpdate?.(handler?.getState?.());
	}

	// -- Changelog -- //

	function showChangelog() {
		const lastVersion = Data.load(meta.name, "version");
		if (lastVersion !== meta.version) {
			UI.showChangelogModal({
				title: meta.name,
				subtitle: meta.version,
				changes: /** @type {any} */ (config.changelog),
			});
			Data.save(meta.name, "version", meta.version);
		}
	}

	// -- Settings Panel -- //

	function sortActivityCategories() {
		for (const categoryId of ACTIVITY_CATEGORY_IDS) {
			const settings = config.settings.find((s) => s.id === categoryId)?.settings;
			if (!settings) continue;
			settings.sort((a, b) =>
				a.value === b.value ? a.name.localeCompare(b.name) : a.value ? 1 : -1,
			);
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

	// -- Lifecycle -- //

	return {
		start() {
			loadSettings();
			showChangelog();
			patchPresence();
			const current = Webpack.getStore("LocalActivityStore")?.getActivities?.() ?? [];
			registerNewActivities(current);
			forcePresenceUpdate();

			Logger.info(`${meta.name} v${meta.version} has started.`);
		},

		stop() {
			Patcher.unpatchAll(meta.name);
			forcePresenceUpdate();
			Logger.info(`${meta.name} v${meta.version} has stopped.`);
		},

		getSettingsPanel() {
			sortActivityCategories();
			const visibleCategories = config.settings.filter((c) => c.settings.length > 0);
			return UI.buildSettingsPanel({
				settings: /** @type {any} */ (visibleCategories),
				onChange: (category, id, value) => handleSettingChange(category, id, value),
			});
		},
	};
};
