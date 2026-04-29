/**
 * @name SpotifyTitleDisplay
 * @author Sewsho
 * @description Replaces the artist name with the song title on Spotify statuses, with an optional setting to show both.
 * @version 1.1.0
 * @source https://github.com/sewsho/BetterDiscordAddons/blob/main/Plugins/SpotifyTitleDisplay/SpotifyTitleDisplay.plugin.js
 */

module.exports = (meta) => {
	const { Data, Webpack, Patcher, UI, Logger } = BdApi;

	// -- Config -- //

	const config = {
		changelog: [
			{
				title: "Artist Update | v1.1.0",
				type: "added",
				items: ["Added an optional setting to show the artist name after the song title."],
			},
			{
				title: "Initial Release",
				type: "added",
				items: ["Shows song title instead of artist name in Spotify statuses."],
			},
		],
		settings: [
			{
				type: "switch",
				id: "showArtist",
				name: "Include Artist",
				note: 'Display the artist name after the song title, e.g. "Song Title — Artist".',
				value: false,
			},
		],
	};

	// -- Settings -- //

	function loadSettings() {
		const saved = Data.load(meta.name, "settings") ?? [];
		for (const setting of config.settings) {
			const match = saved.find((s) => s.id === setting.id);
			if (match) setting.value = match.value;
		}
	}

	function saveSettings() {
		Data.save(meta.name, "settings", config.settings);
	}

	function getSettingValue(id, fallback = false) {
		return config.settings.find((s) => s.id === id)?.value ?? fallback;
	}

	function handleSettingChange(_, id, value) {
		const setting = config.settings.find((s) => s.id === id);
		if (setting) setting.value = value;
		saveSettings();
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

	// -- Activity Logic -- //

	function isSpotifyActivity(activity) {
		return activity?.type === 2 && activity?.name === "Spotify";
	}

	function buildDisplayText(activity) {
		const title = activity.details;
		if (!title) return null;

		const artist = activity.state;
		if (getSettingValue("showArtist", false) && artist) return `${title} \u2014 ${artist}`;
		return title;
	}

	// -- Patching -- //

	function patchActivityTextModule() {
		const ActivityTextModule = Webpack.getModule((m) =>
			Object.values(m).some((v) => typeof v === "function" && v.toString().includes("status_display_type")),
		);

		if (!ActivityTextModule) {
			Logger.error(`${meta.name}: Could not find ActivityTextModule.`);
			return false;
		}

		const key = Object.keys(ActivityTextModule).find((k) =>
			ActivityTextModule[k].toString().includes("status_display_type"),
		);

		if (!key) {
			Logger.error(`${meta.name}: Could not find ActivityTextModule key.`);
			return false;
		}

		Patcher.after(meta.name, ActivityTextModule, key, (_, args, ret) => {
			const activity = args[0];
			if (!isSpotifyActivity(activity)) return;

			const text = buildDisplayText(activity);
			if (!text) return;

			return { ...ret, text, tooltip: text };
		});

		Logger.info(`${meta.name}: ActivityTextModule patched successfully.`);
		return true;
	}

	// -- Lifecycle -- //

	return {
		start() {
			loadSettings();
			showChangelog();
			if (patchActivityTextModule()) Logger.info(`${meta.name} v${meta.version} has started successfully.`);
		},

		stop() {
			Patcher.unpatchAll(meta.name);
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
