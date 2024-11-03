/**
 * @name GameActivityControl
 * @author Sewsho
 * @description Selectively control which games show up in your Discord activity status
 * @version 1.0.0
 */

module.exports = class GameActivityControl {
  constructor() {
    // Load or create game settings
    this.gameSettings = BdApi.Data.load("GameActivityControl", "games") || {};
    this.initialized = false;
    this.checkInterval = null;
    this.gameModule = null;
  }

  start() {
    // Initialize plugin and retry if needed
    try {
      this.loadStyles();
      this.initializeGameModule();

      this.checkInterval = setInterval(() => {
        if (!this.gameModule || !this.initialized) {
          this.initializeGameModule();
        }
      }, 100);

      setTimeout(() => {
        if (this.checkInterval) {
          clearInterval(this.checkInterval);
          this.checkInterval = null;
        }
      }, 5000);
    } catch (error) {
      BdApi.showToast("GameActivityControl: Failed to start - " + error.message, { type: "error" });
    }
  }

  stop() {
    // Clean up plugin resources
    BdApi.DOM.removeStyle("GameActivityControl");
    BdApi.Patcher.unpatchAll("GameActivityControl");
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.initialized = false;
    this.gameModule = null;
  }

  initializeGameModule() {
    // Set up game detection and monitoring
    const gameModule = BdApi.Webpack.getModule((m) => m?.getName?.() === "GameStore");
    if (!gameModule) return;

    this.gameModule = gameModule;
    this.patchGameModule();

    const ActivityStore = BdApi.Webpack.getModule(
      BdApi.Webpack.Filters.byProps("getActivities", "getLocalPresence")
    );
    if (ActivityStore) {
      const DispatchModule = BdApi.Webpack.getModule(
        BdApi.Webpack.Filters.byProps("dispatch", "subscribe")
      );
      if (DispatchModule) {
        if (DispatchModule.subscribe) {
          DispatchModule.subscribe("GAME_DETECTION_CHANGE", () => {
            const currentActivities = ActivityStore.getActivities();
            currentActivities.forEach((activity) => {
              const name = activity?.name || activity?.applicationName;
              if (name && !(name in this.gameSettings)) {
                this.gameSettings[name] = true;
                this.saveSettings();
              }
            });
          });
        }

        DispatchModule.dispatch({
          type: "GAME_DETECTION_CHANGE",
        });
      }
    }

    this.initialized = true;
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  patchGameModule() {
    // Patch Discord methods to filter game activity
    BdApi.Patcher.after("GameActivityControl", this.gameModule, "getGame", (_, args, game) => {
      if (!game) return game;

      const gameName = game.name || game.applicationName || game.exeName;
      if (!gameName) return game;

      if (!(gameName in this.gameSettings)) {
        this.gameSettings[gameName] = true;
        this.saveSettings();
      }

      if (!this.gameSettings[gameName]) {
        return null;
      }

      return game;
    });

    const ActivityStore = BdApi.Webpack.getModule(
      BdApi.Webpack.Filters.byProps("getActivities", "getLocalPresence")
    );

    if (ActivityStore) {
      BdApi.Patcher.after(
        "GameActivityControl",
        ActivityStore,
        "getLocalPresence",
        (_, args, presence) => {
          if (presence?.activities) {
            presence.activities = presence.activities.filter((activity) => {
              const name = activity?.name || activity?.applicationName;
              if (!name) return true;
              if (!(name in this.gameSettings)) {
                this.gameSettings[name] = true;
                this.saveSettings();
              }
              return this.gameSettings[name];
            });
          }
          return presence;
        }
      );

      BdApi.Patcher.after(
        "GameActivityControl",
        ActivityStore,
        "getActivities",
        (_, args, activities) => {
          if (!Array.isArray(activities)) return activities;
          return activities.filter((activity) => {
            const name = activity?.name || activity?.applicationName;
            if (!name) return true;
            if (!(name in this.gameSettings)) {
              this.gameSettings[name] = true;
              this.saveSettings();
            }
            return this.gameSettings[name];
          });
        }
      );
    }
  }

  loadStyles() {
    const css = `
        .game-activity-control-panel {
            padding: 20px;
            color: var(--text-normal);
            max-width: 800px;
            margin: 0 auto;
        }

        .game-control-list {
            display: flex;
            flex-direction: column;
            gap: 12px;
        }

        .game-control-item {
            display: flex;
            align-items: center;
            padding: 16px;
            background: var(--background-secondary);
            border-radius: 8px;
            transition: background 0.2s;
        }

        .game-control-item:hover {
            background: var(--background-secondary-alt);
        }

        .game-control-item span {
            flex: 1;
            font-size: 14px;
        }

        .toggle-switch {
            position: relative;
            width: 40px;
            height: 22px;
            margin: 0 12px;
        }

        .toggle-switch input {
            opacity: 0;
            width: 0;
            height: 0;
            position: absolute;
        }

        .toggle-slider {
            position: absolute;
            cursor: pointer;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: var(--background-tertiary);
            transition: .3s;
            border-radius: 34px;
            display: flex;
            align-items: center;
        }

        .toggle-slider:before {
            position: absolute;
            content: "";
            height: 16px;
            width: 16px;
            left: 3px;
            bottom: 3px;
            background-color: white;
            transition: .3s;
            border-radius: 50%;
            z-index: 2;
        }

        input:checked + .toggle-slider {
            background-color: rgb(59, 165, 93);
        }

        input:checked + .toggle-slider:before {
            transform: translateX(18px);
        }

        .game-control-remove {
            width: 24px;
            height: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: transparent;
            color: var(--text-muted);
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 18px;
            transition: all 0.2s;
            padding: 0;
        }

        .game-control-remove:hover {
            background: var(--background-modifier-hover);
            color: var(--status-danger);
        }
    `;
    BdApi.DOM.addStyle("GameActivityControl", css);
  }

  getSettingsPanel() {
    // Create settings panel UI
    const panel = document.createElement("div");
    panel.className = "game-activity-control-panel";

    const gameList = document.createElement("div");
    gameList.className = "game-control-list";
    this.updateGameList(gameList);
    panel.appendChild(gameList);

    return panel;
  }

  updateGameList(gameList) {
    // Create UI elements for each game in settings
    gameList.innerHTML = "";

    Object.entries(this.gameSettings).forEach(([game, enabled]) => {
      const gameRow = document.createElement("div");
      gameRow.className = "game-control-item";

      const gameLabel = document.createElement("span");
      gameLabel.textContent = game;

      const toggleContainer = document.createElement("label");
      toggleContainer.className = "toggle-switch";

      const toggleSwitch = document.createElement("input");
      toggleSwitch.type = "checkbox";
      toggleSwitch.checked = enabled;
      toggleSwitch.onchange = () => {
        this.gameSettings[game] = toggleSwitch.checked;
        this.saveSettings();
      };

      const slider = document.createElement("span");
      slider.className = "toggle-slider";

      const removeButton = document.createElement("button");
      removeButton.textContent = "×";
      removeButton.className = "game-control-remove";
      removeButton.onclick = () => {
        delete this.gameSettings[game];
        this.saveSettings();
        this.updateGameList(gameList);
      };

      toggleContainer.appendChild(toggleSwitch);
      toggleContainer.appendChild(slider);
      gameRow.appendChild(gameLabel);
      gameRow.appendChild(toggleContainer);
      gameRow.appendChild(removeButton);
      gameList.appendChild(gameRow);
    });
  }

  saveSettings() {
    // Save settings to BetterDiscord storage
    BdApi.Data.save("GameActivityControl", "games", this.gameSettings);
  }
};
