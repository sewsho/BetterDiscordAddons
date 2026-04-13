/**
 * @name SpotifyListenAlong
 * @author Sewsho
 * @description Unlocks the Listen Along feature for Spotify without needing Premium.
 * @version 1.0.0
 * @source https://github.com/sewsho/BetterDiscordAddons/blob/main/Plugins/SpotifyListenAlong/SpotifyListenAlong.plugin.js
 */

module.exports = (meta) => {
	const { Data, Webpack, Patcher, UI, Logger } = BdApi;

	// -- Config -- //

	const config = {
		changelog: [
			{
				title: "Initial Release",
				type: "added",
				items: ["Spoofs premium status so Listen Along works without Spotify Premium."],
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
				changes: /** @type {any} */ (config.changelog),
			});
			Data.save(meta.name, "version", meta.version);
		}
	}

	// -- Patching -- //

	function patchSpotify() {
		if (SpotifyStore) {
			Patcher.after(
				"SpotifyListenAlong",
				SpotifyStore,
				"getActiveSocketAndDevice",
				(_, args, res) => {
					if (res?.socket) {
						res.socket.isPremium = true;
					}
					return res;
				},
			);
		} else {
			Logger.error(`${meta.name}: Could not find SpotifyStore module.`);
		}
	}

	// -- Webpack -- //

	const SpotifyStore = Webpack.getModule((m) => m.getActiveSocketAndDevice);

	// -- Lifecycle -- //

	return {
		start() {
			showChangelog();
			patchSpotify();
		},
		stop: () => {
			Patcher.unpatchAll("SpotifyListenAlong");
		},
	};
};
