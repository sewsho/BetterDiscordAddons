/**
 * @name SpotifyListenAlong
 * @author Sewsho
 * @description Unlocks the Listen Along feature for Spotify without needing Premium.
 * @version 1.0.1
 * @source https://github.com/sewsho/BetterDiscordAddons/blob/main/Plugins/SpotifyListenAlong/SpotifyListenAlong.plugin.js
 */

module.exports = (meta) => {
	const { Data, Webpack, Patcher, UI, Logger } = BdApi;

	// -- Config -- //

	const config = {
		changelog: [
			{
				title: "Maintenance Update | v1.0.1",
				type: "improved",
				items: ["Improved stability and reliability under the hood."],
			},
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
				changes: config.changelog,
			});
			Data.save(meta.name, "version", meta.version);
		}
	}

	// -- Patching -- //

	function patchSpotify() {
		const SpotifyStore = Webpack.getModule((m) => m.getActiveSocketAndDevice);

		if (!SpotifyStore) {
			Logger.error(`${meta.name}: Could not find SpotifyStore module.`);
			return false;
		}

		Patcher.after(meta.name, SpotifyStore, "getActiveSocketAndDevice", (_, args, res) => {
			if (res?.socket) res.socket.isPremium = true;
		});

		return true;
	}

	// -- Lifecycle -- //

	return {
		start() {
			showChangelog();
			if (patchSpotify()) Logger.info(`${meta.name} v${meta.version} has started successfully.`);
		},
		stop() {
			Patcher.unpatchAll(meta.name);
			Logger.info(`${meta.name} v${meta.version} has stopped successfully.`);
		},
	};
};
