/**
 * @name SpotifyTitleDisplay
 * @author Sewsho
 * @description Shows the song title instead of the artist name on Spotify statuses.
 * @version 1.0.0
 * @source https://github.com/sewsho/BetterDiscordAddons/blob/main/Plugins/SpotifyTitleDisplay/SpotifyTitleDisplay.plugin.js
 */

module.exports = (meta) => {
	const { Data, Webpack, Patcher, UI, Logger } = BdApi;

	// -- Config -- //

	const config = {
		changelog: [
			{
				title: "Initial Release",
				type: "added",
				items: ["Shows song title instead of artist name in Spotify statuses."],
			},
		],
	};

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
			if (!isSpotifyActivity(activity) || !activity.details) return;
			return { ...ret, text: activity.details, tooltip: activity.details };
		});

		Logger.info(`${meta.name}: ActivityTextModule patched successfully.`);
		return true;
	}

	// -- Lifecycle -- //

	return {
		start() {
			showChangelog();
			if (patchActivityTextModule()) Logger.info(`${meta.name} v${meta.version} has started successfully.`);
		},

		stop() {
			Patcher.unpatchAll(meta.name);
			Logger.info(`${meta.name} v${meta.version} has stopped successfully.`);
		},
	};
};
