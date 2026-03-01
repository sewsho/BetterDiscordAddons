/**
 * @name LastSeen
 * @author Sewsho
 * @description Tracks and displays when your friends were last seen.
 * @version 0.3.0
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

	// ─── Formatting ───────────────────────────────────────────────────────────

	_formatRelative(ts) {
		if (!ts) return "Never";
		const d = Math.floor((Date.now() - ts) / 1000);
		if (d < 60) return `${d}s ago`;
		if (d < 3600) return `${Math.floor(d / 60)}m ago`;
		if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
		if (d < 604800) return `${Math.floor(d / 86400)}d ago`;
		return new Date(ts).toLocaleDateString();
	}

	_formatDuration(ts) {
		if (!ts) return "unknown";
		const d = Math.floor((Date.now() - ts) / 1000);
		if (d < 60) return `${d}s`;
		if (d < 3600) return `${Math.floor(d / 60)}m`;
		if (d < 86400) return `${Math.floor(d / 3600)}h ${Math.floor((d % 3600) / 60)}m`;
		return `${Math.floor(d / 86400)}d`;
	}

	_getText(userId) {
		const record = this.presenceData[userId];
		const status = this.PresenceStore?.getStatus(userId) ?? "offline";
		const isOnline = this._isOnline(status);
		const ts = isOnline
			? (record?.lastOnline ?? null)
			: (record?.lastSeen ?? record?.lastOnline ?? null);
		return {
			label: isOnline ? "Online for" : "Last Seen",
			value: isOnline ? this._formatDuration(ts) : this._formatRelative(ts),
		};
	}
};
