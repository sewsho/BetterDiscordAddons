/**
 * @name LastSeen
 * @author Sewsho
 * @description Tracks and displays when your friends were last seen.
 * @version 0.0.0
 * @source https://github.com/sewsho/BetterDiscordAddons/blob/main/Plugins/LastSeen/LastSeen.plugin.js
 */

module.exports = class LastSeen {
	constructor() {
		this.api = new BdApi("LastSeen");
		this.Data = this.api.Data;
		this.UI = this.api.UI;
		this.Webpack = this.api.Webpack;
		this.presenceData = this.Data.load("presenceData") ?? {};
		this._boundHandler = null;
		this._observer = null;
	}

	// ─── Lifecycle ────────────────────────────────────────────────────────────

	start() {
		this.PresenceStore = this.Webpack.getStore("PresenceStore");
		this.RelationshipStore = this.Webpack.getStore("RelationshipStore");
		this.UserStore = this.Webpack.getStore("UserStore");

		if (!this.PresenceStore || !this.RelationshipStore || !this.UserStore) {
			this.api.Logger.error("Could not find required Discord stores.");
			this.UI.showToast("LastSeen: Failed - stores not found.", { type: "error" });
			return;
		}

		this.UI.showToast("LastSeen started!", { type: "success" });
	}

	stop() {
		if (this._boundHandler && this.PresenceStore)
			this.PresenceStore.removeChangeListener(this._boundHandler);
		if (this._observer) {
			this._observer.disconnect();
			this._observer = null;
		}
		this._boundHandler = null;
		document.querySelectorAll(".ls-injected").forEach((el) => el.remove());
	}
};
