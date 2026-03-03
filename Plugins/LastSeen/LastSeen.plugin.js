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
		this._startObserver();
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
			this._refreshInjected(userId);
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

	_refreshInjected(userId) {
		const { label, value } = this._getText(userId);
		document.querySelectorAll(`.ls-injected[data-uid="${userId}"]`).forEach((el) => {
			const l = el.querySelector(".ls-label");
			const v = el.querySelector(".ls-value");
			if (l) l.textContent = label;
			if (v) v.textContent = value;
		});
	}

	// ─── Fiber Walker ─────────────────────────────────────────────────────────

	_getUserIdFromFiber(domNode) {
		const key = Object.keys(domNode).find(
			(k) => k.startsWith("__reactFiber") || k.startsWith("__reactInternalInstance"),
		);
		if (!key) return null;
		let fiber = domNode[key],
			depth = 0;
		while (fiber && depth++ < 150) {
			const p = fiber.memoizedProps ?? fiber.pendingProps ?? {};
			if (p?.user?.id) return p.user.id;
			if (p?.member?.user?.id) return p.member.user.id;
			if (typeof p?.userId === "string") return p.userId;
			const sp = fiber.stateNode?.props ?? {};
			if (sp?.user?.id) return sp.user.id;
			if (sp?.member?.user?.id) return sp.member.user.id;
			if (typeof sp?.userId === "string") return sp.userId;
			fiber = fiber.return;
		}
		return null;
	}

	_getUserIdFromNode(node) {
		let uid = this._getUserIdFromFiber(node);
		if (uid) return uid;
		for (const child of node.querySelectorAll("*")) {
			uid = this._getUserIdFromFiber(child);
			if (uid) return uid;
		}
		return node.querySelector("[data-user-id]")?.dataset?.userId ?? null;
	}

	// ─── Injection ────────────────────────────────────────────────────────────

	_whenReady(containerEl, cb) {
		const uid = this._getUserIdFromNode(containerEl);
		if (uid) {
			cb(uid);
			return;
		}
		const obs = new MutationObserver(() => {
			const uid2 = this._getUserIdFromNode(containerEl);
			if (uid2) {
				obs.disconnect();
				cb(uid2);
			}
		});
		obs.observe(containerEl, { childList: true, subtree: true });
		setTimeout(() => obs.disconnect(), 2000);
	}

	_buildInline(userId) {
		const { label, value } = this._getText(userId);
		const el = document.createElement("span");
		el.className = "ls-injected";
		el.dataset.uid = userId;
		el.style.cssText = [
			"font-size:11px",
			"color:var(--text-muted)",
			"white-space:nowrap",
			"flex-shrink:0",
			"margin-right:8px",
			"display:flex",
			"align-items:center",
		].join(";");
		el.innerHTML = `<span class="ls-label" style="color:var(--text-muted)">${label}</span><span style="margin:0 4px;color:var(--text-muted)">·</span><span class="ls-value" style="color:var(--text-normal);font-weight:600">${value}</span>`;
		return el;
	}

	_buildRow(userId) {
		const { label, value } = this._getText(userId);
		const el = document.createElement("div");
		el.className = "ls-injected";
		el.dataset.uid = userId;
		el.style.cssText = [
			"font-size:12px",
			"display:flex",
			"align-items:center",
			"color:var(--text-muted)",
			"font-family:var(--font-primary)",
		].join(";");
		el.innerHTML = `<span class="ls-label" style="font-size:12px;color:var(--text-muted)">${label}</span><span style="margin:0 4px;color:var(--text-muted)">·</span><span class="ls-value" style="font-size:12px;font-weight:600;color:var(--text-normal)">${value}</span>`;
		return el;
	}

	_startObserver() {
		const self = this;

		const injectPopout = (node) => {
			if (node.querySelector(".ls-injected[data-type=popout]")) return;
			self._whenReady(node, (uid) => {
				if (node.querySelector(".ls-injected[data-type=popout]")) return;
				const badge = self._buildRow(uid);
				badge.dataset.type = "popout";
				const anchor =
					node.querySelector("[class*=tags_]") ??
					node.querySelector("h2 + div") ??
					node.querySelector("[class*=username_]");
				if (anchor) anchor.after(badge);
				else (node.querySelector("[class*=inner_]") ?? node).prepend(badge);
			});
		};

		const injectFriendRow = (row) => {
			if (row.querySelector(".ls-injected[data-type=friend]")) return;
			self._whenReady(row, (uid) => {
				if (row.querySelector(".ls-injected[data-type=friend]")) return;
				const el = self._buildInline(uid);
				el.dataset.type = "friend";
				const actions = row.querySelector("[class*=actions_]");
				if (actions) actions.prepend(el);
				else row.appendChild(el);
			});
		};

		const handle = (node) => {
			if (!(node instanceof HTMLElement)) return;
			const cls = typeof node.className === "string" ? node.className : "";

			if (
				node.matches?.("[role=dialog][aria-labelledby]") ||
				cls.includes("user-profile-popout") ||
				cls.includes("outer_c0bea0")
			) {
				injectPopout(node);
				return;
			}
			const popout = node.querySelector(
				"[role=dialog][aria-labelledby], [class*=user-profile-popout], [class*=outer_c0bea0]",
			);
			if (popout) injectPopout(popout);

			if (
				node.matches?.("[role=listitem][data-list-item-id*=people]") ||
				cls.includes("peopleListItem_")
			) {
				injectFriendRow(node);
				return;
			}
			node
				.querySelectorAll("[role=listitem][data-list-item-id*=people], [class*=peopleListItem_]")
				.forEach(injectFriendRow);
		};

		this._observer = new MutationObserver((mutations) => {
			for (const mut of mutations) for (const node of mut.addedNodes) handle(node);
		});

		this._observer.observe(document.body, { childList: true, subtree: true });

		document
			.querySelectorAll("[role=listitem][data-list-item-id*=people], [class*=peopleListItem_]")
			.forEach(injectFriendRow);
	}

	// ─── Settings Panel ───────────────────────────────────────────────────────

	getSettingsPanel() {
		const React = BdApi.React;
		const self = this;

		const Panel = () => {
			return React.createElement(
				"div",
				{
					style: {
						padding: "16px",
						color: "var(--text-normal)",
						fontFamily: "var(--font-primary)",
					},
				},
				React.createElement(
					"button",
					{
						style: {
							padding: "8px 14px",
							borderRadius: "6px",
							border: "none",
							background: "#d22d39",
							color: "white",
							cursor: "pointer",
							fontSize: "13px",
							fontWeight: 600,
						},
						onClick: () => {
							self.presenceData = {};
							self._save();
							self.UI.showToast("LastSeen: Data cleared.", { type: "info" });
						},
					},
					"Clear All Data",
				),
			);
		};

		return React.createElement(Panel);
	}
};
