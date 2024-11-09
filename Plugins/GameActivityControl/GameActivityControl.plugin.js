/**
 * @name GameActivityControl
 * @author Sewsho
 * @description Selectively control which games show up in your Discord activity status
 * @version 1.1.0
 * @source https://github.com/sewsho/BetterDiscordAddons/blob/main/Plugins/GameActivityControl/GameActivityControl.plugin.js
 */

module.exports = class GameActivityControl {
  constructor() {
    /**
     * Initialize plugin state
     * gameSettings: Stores game visibility preferences {gameName: boolean}
     * initialized: Tracks if the plugin has completed initial setup
     * checkInterval: Reference to the initialization retry interval
     * gameModule: Reference to Discord's internal game detection module
     * unsubscribe: Cleanup function for event subscriptions
     */
    this.gameSettings = BdApi.Data.load("GameActivityControl", "games") || {};
    this.initialized = false;
    this.checkInterval = null;
    this.gameModule = null;
    this.unsubscribe = null;
  }

  /**
   * Starts the plugin and sets up game activity monitoring
   * Attempts to initialize and will retry if initial setup fails
   */
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
    } catch (error) {
      BdApi.showToast("GameActivityControl: Failed to start - " + error.message, { type: "error" });
    }
  }

  /**
   * Performs complete cleanup of plugin resources
   * - Removes custom styles
   * - Unpatches all modifications
   * - Clears intervals and event subscriptions
   * - Resets plugin state
   */
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
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  /**
   * Sets up game detection and monitoring
   * - Locates and patches Discord's game detection module
   * - Sets up activity monitoring
   * - Subscribes to game detection events
   * @throws {Error} When required Discord modules cannot be found
   */
  initializeGameModule() {
    try {
      const gameModule = BdApi.Webpack.getModule((m) => m?.getName?.() === "GameStore");
      if (!gameModule) {
        throw new Error("Could not find GameStore module");
      }

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
            this.unsubscribe = DispatchModule.subscribe("GAME_DETECTION_CHANGE", () => {
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
    } catch (error) {
      console.error("GameActivityControl: Failed to initialize -", error);
      BdApi.showToast("Failed to initialize game detection. Retrying...", { type: "error" });
    }
  }

  /**
   * Filters activities based on user preferences and updates settings for new games
   * @param {Object} activity Discord activity object
   * @returns {boolean} Whether the activity should be shown
   */
  filterActivity(activity) {
    const name = activity?.name || activity?.applicationName;
    if (!name) return true;

    if (!(name in this.gameSettings)) {
      this.gameSettings[name] = true;
      this.saveSettings();
    }
    return this.gameSettings[name];
  }

  /**
   * Patches Discord's internal methods to filter game activities
   * - Modifies getGame to filter individual games
   * - Patches presence and activity methods to respect user preferences
   */
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
          return activities.filter((activity) => this.filterActivity(activity));
        }
      );
    }
  }

  /**
   * Creates UI components for managing game visibility settings
   * @returns {HTMLElement} Settings panel container
   */
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

  /**
   * Updates the game list UI with current settings
   * @param {HTMLElement} gameList - The list element to update
   */
  updateGameList(gameList) {
    gameList.innerHTML = "";
    Object.entries(this.gameSettings).forEach(([game, enabled]) => {
      gameList.appendChild(this.createGameRow(game, enabled, gameList));
    });
  }

  /**
   * Persists current settings to BetterDiscord storage
   */
  saveSettings() {
    // Save settings to BetterDiscord storage
    BdApi.Data.save("GameActivityControl", "games", this.gameSettings);
  }

  /**
   * Extracts the game name from various possible sources
   * @param {Object} game - The game object
   * @returns {string|undefined} The game name if found
   */
  getGameName(game) {
    return game?.name || game?.applicationName || game?.exeName;
  }

  /**
   * Creates a label element for a game in the settings panel
   * @param {string} game - The name of the game
   * @returns {HTMLElement} The created label element
   */
  createGameLabel(game) {
    const gameLabel = document.createElement("span");
    gameLabel.textContent = game;
    return gameLabel;
  }

  /**
   * Creates a toggle switch element for a game in the settings panel
   * @param {string} game - The name of the game
   * @param {boolean} enabled - Whether the game is visible
   * @returns {HTMLElement} The created toggle switch element
   */
  createToggleSwitch(game, enabled) {
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

    toggleContainer.appendChild(toggleSwitch);
    toggleContainer.appendChild(slider);
    return toggleContainer;
  }

  /**
   * Creates a remove button element for a game in the settings panel
   * @param {string} game - The name of the game
   * @param {HTMLElement} gameList - The parent list element
   * @returns {HTMLElement} The created remove button element
   */
  createRemoveButton(game, gameList) {
    const removeButton = document.createElement("button");
    removeButton.textContent = "×";
    removeButton.className = "game-control-remove";
    removeButton.onclick = () => {
      delete this.gameSettings[game];
      this.saveSettings();
      this.updateGameList(gameList);
    };
    return removeButton;
  }

  /**
   * Creates a row element for a game in the settings panel
   * @param {string} game - The name of the game
   * @param {boolean} enabled - Whether the game is visible
   * @param {HTMLElement} gameList - The parent list element
   * @returns {HTMLElement} The created row element
   */
  createGameRow(game, enabled, gameList) {
    const gameRow = document.createElement("div");
    gameRow.className = "game-control-item";

    gameRow.appendChild(this.createGameLabel(game));
    gameRow.appendChild(this.createToggleSwitch(game, enabled));
    gameRow.appendChild(this.createRemoveButton(game, gameList));

    return gameRow;
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
};
