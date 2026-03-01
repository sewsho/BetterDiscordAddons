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

		this._seedCurrentStatuses();
		this._boundHandler = this._onPresenceChange.bind(this);
		this.PresenceStore.addChangeListener(this._boundHandler);
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

	// ─── Presence Tracking ───────────────────────────────────────────────────

	_seedCurrentStatuses() {
		for (const userId of this.RelationshipStore.getFriendIDs()) {
			if (this.presenceData[userId]) continue;
			const status = this.PresenceStore.getStatus(userId) ?? "offline";
			this.presenceData[userId] = {
				lastStatus: status,
				lastOnline: this._isOnline(status) ? Date.now() : null,
				lastSeen: null,
			};
		}
		this._save();
	}

	_onPresenceChange() {
		let dirty = false;
		for (const userId of this.RelationshipStore.getFriendIDs()) {
			const newStatus = this.PresenceStore.getStatus(userId) ?? "offline";
			const record = this.presenceData[userId] ?? {
				lastStatus: "offline",
				lastOnline: null,
				lastSeen: null,
			};
			const oldStatus = record.lastStatus;
			if (newStatus === oldStatus) continue;
			dirty = true;
			if (!this._isOnline(oldStatus) && this._isOnline(newStatus)) record.lastOnline = Date.now();
			if (this._isOnline(oldStatus) && !this._isOnline(newStatus)) record.lastSeen = Date.now();
			record.lastStatus = newStatus;
			this.presenceData[userId] = record;
		}
		if (dirty) this._save();
	}

	_isOnline(status) {
		// online/idle/dnd = online. Only offline/invisible = away.
		return !!status && status !== "offline" && status !== "invisible";
	}

	_save() {
		this.Data.save("presenceData", this.presenceData);
	}
};
