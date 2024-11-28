/**
 * @name GameActivityControl
 * @author Sewsho
 * @description Selectively control which games show up in your Discord activity status
 * @version 1.2.0
 * @source https://github.com/sewsho/BetterDiscordAddons/blob/main/Plugins/GameActivityControl/GameActivityControl.plugin.js
 */

module.exports = class GameActivityControl {
  /**
   * Creates a new GameActivityControl instance
   */
  constructor() {
    this.gameSettings = BdApi.Data.load("GameActivityControl", "games") || {};
    this.gameMetadata = BdApi.Data.load("GameActivityControl", "metadata") || {};
    this.initialized = false;
    this.checkInterval = null;
    this.gameModule = null;
    this.unsubscribe = null;
  }

  /**
   * Starts the plugin and sets up game activity monitoring
   */
  start() {
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
   */
  stop() {
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
   * @param {Object} activity - The activity object from Discord
   * @returns {string|undefined} The game name if found
   */
  getGameName(activity) {
    return activity?.name;
  }

  /**
   * @param {string} gameName - The name of the game
   * @returns {boolean} Whether the game should be visible
   */
  ensureGameInSettings(gameName) {
    if (!gameName) return true;
    
    if (!(gameName in this.gameSettings)) {
      this.gameSettings[gameName] = true;
      this.saveSettings();
    }
    this.updateGameMetadata(gameName);
    return this.gameSettings[gameName];
  }

  /**
   * @param {string} gameName - The name of the game
   */
  updateGameMetadata(gameName) {
    if (!gameName) return;
    
    if (!this.gameMetadata[gameName]) {
      this.gameMetadata[gameName] = {};
    }
    this.gameMetadata[gameName].lastPlayed = Date.now();
    this.saveMetadata();
  }

  /**
   * Saves the game metadata to storage
   */
  saveMetadata() {
    BdApi.Data.save("GameActivityControl", "metadata", this.gameMetadata);
  }

  /**
   * Saves the game settings to storage
   */
  saveSettings() {
    BdApi.Data.save("GameActivityControl", "games", this.gameSettings);
  }

  /**
   * Initializes the game module and sets up game detection
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
        if (DispatchModule?.subscribe) {
          this.unsubscribe = DispatchModule.subscribe("GAME_DETECTION_CHANGE", () => {
            const currentActivities = ActivityStore.getActivities();
            currentActivities.forEach((activity) => {
              const name = this.getGameName(activity);
              this.ensureGameInSettings(name);
            });
          });

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
   * Patches the game module to filter out unwanted games
   */
  patchGameModule() {
    const ActivityStore = BdApi.Webpack.getModule(
      BdApi.Webpack.Filters.byProps("getActivities", "getLocalPresence")
    );

    BdApi.Patcher.after("GameActivityControl", this.gameModule, "getGame", (_, args, game) => {
      if (!game) return game;
      const gameName = this.getGameName(game);
      return this.ensureGameInSettings(gameName) ? game : null;
    });

    if (ActivityStore) {
      BdApi.Patcher.after(
        "GameActivityControl",
        ActivityStore,
        "getLocalPresence",
        (_, args, presence) => {
          if (presence?.activities) {
            presence.activities = presence.activities.filter(activity => 
              this.ensureGameInSettings(this.getGameName(activity))
            );
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
          return activities.filter(activity => 
            this.ensureGameInSettings(this.getGameName(activity))
          );
        }
      );
    }
  }

  /**
   * Creates the settings panel for the plugin
   * @returns {HTMLElement} The settings panel
   */
  getSettingsPanel() {
    const container = document.createElement("div");
    container.className = "gac-settings";

    const filterContainer = document.createElement("div");
    filterContainer.className = "gac-filter-container";

    const searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.placeholder = "Search games...";
    searchInput.className = "gac-search";
    
    const sortSelect = document.createElement("select");
    sortSelect.className = "gac-sort";
    const sortOptions = [
      ["last-played", "Last Played"],
      ["name-asc", "Name (A-Z)"],
      ["name-desc", "Name (Z-A)"],
    ];
    sortOptions.forEach(([value, text]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = text;
      sortSelect.appendChild(option);
    });

    const viewSelect = document.createElement("select");
    viewSelect.className = "gac-view";
    const viewOptions = [
      ["all", "Show All"],
      ["visible", "Visible Only"],
      ["hidden", "Hidden Only"],
    ];
    viewOptions.forEach(([value, text]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = text;
      viewSelect.appendChild(option);
    });

    filterContainer.appendChild(searchInput);
    filterContainer.appendChild(sortSelect);
    filterContainer.appendChild(viewSelect);
    container.appendChild(filterContainer);

    const gameList = document.createElement("div");
    gameList.className = "gac-game-list";
    container.appendChild(gameList);

    const updateList = () => {
      const searchTerm = searchInput.value.toLowerCase();
      const sortBy = sortSelect.value;
      const viewFilter = viewSelect.value;

      this.updateGameList(gameList, {
        searchTerm,
        sortBy,
        viewFilter,
      });
    };

    searchInput.addEventListener("input", updateList);
    sortSelect.addEventListener("change", updateList);
    viewSelect.addEventListener("change", updateList);
    updateList();

    return container;
  }

  /**
   * Updates the game list based on the current filters
   * @param {HTMLElement} gameList - The game list element
   * @param {Object} filters - The current filters
   */
  updateGameList(gameList, filters = {}) {
    const { searchTerm = "", sortBy = "last-played", viewFilter = "all" } = filters;
    gameList.innerHTML = "";

    let games = Object.keys(this.gameSettings)
      .filter(game => {
        const matchesSearch = game.toLowerCase().includes(searchTerm);
        const matchesFilter = viewFilter === "all" 
          || (viewFilter === "visible" && this.gameSettings[game])
          || (viewFilter === "hidden" && !this.gameSettings[game]);
        return matchesSearch && matchesFilter;
      })
      .sort((a, b) => {
        if (this.gameSettings[a] !== this.gameSettings[b]) {
          return this.gameSettings[a] ? 1 : -1; 
        }

        switch (sortBy) {
          case "name-desc":
            return b.localeCompare(a);
          case "last-played":
            const aTime = this.gameMetadata[a]?.lastPlayed || 0;
            const bTime = this.gameMetadata[b]?.lastPlayed || 0;
            return bTime - aTime;
          default: 
            return a.localeCompare(b);
        }
      });

    if (games.length === 0) {
      const emptyMessage = document.createElement("div");
      emptyMessage.className = "gac-empty-message";
      emptyMessage.textContent = searchTerm 
        ? "No games found matching your search"
        : "No games found";
      gameList.appendChild(emptyMessage);
      return;
    }

    games.forEach(game => {
      const row = this.createGameRow(game, this.gameSettings[game], gameList);
      gameList.appendChild(row);
    });
  }

  /**
   * Creates a game row for the game list
   * @param {string} game - The game name
   * @param {boolean} enabled - Whether the game is enabled
   * @param {HTMLElement} gameList - The game list element
   * @returns {HTMLElement} The game row
   */
  createGameRow(game, enabled, gameList) {
    const row = document.createElement("div");
    row.className = "gac-game-row";

    const nameContainer = document.createElement("div");
    nameContainer.className = "gac-name-container";
    
    const label = this.createGameLabel(game);
    nameContainer.appendChild(label);

    const lastPlayed = this.gameMetadata[game]?.lastPlayed;
    if (lastPlayed) {
      const timeInfo = document.createElement("div");
      timeInfo.className = "gac-last-played";
      timeInfo.textContent = `Last played: ${this.formatLastPlayed(lastPlayed)}`;
      nameContainer.appendChild(timeInfo);
    }

    const toggle = this.createToggleSwitch(game, enabled);
    const removeBtn = this.createRemoveButton(game, gameList);
    
    row.appendChild(nameContainer);
    row.appendChild(toggle);
    row.appendChild(removeBtn);
    return row;
  }

  /**
   * Formats the last played timestamp
   * @param {number} timestamp - The timestamp
   * @returns {string} The formatted timestamp
   */
  formatLastPlayed(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days} day${days === 1 ? '' : 's'} ago`;
    if (hours > 0) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    if (minutes > 0) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
    return 'Just now';
  }

  /**
   * Creates a game label
   * @param {string} game - The game name
   * @returns {HTMLElement} The game label
   */
  createGameLabel(game) {
    const label = document.createElement("span");
    label.textContent = game;
    label.className = "gac-game-label";
    return label;
  }

  /**
   * Creates a toggle switch for the game
   * @param {string} game - The game name
   * @param {boolean} enabled - Whether the game is enabled
   * @returns {HTMLElement} The toggle switch
   */
  createToggleSwitch(game, enabled) {
    const toggleContainer = document.createElement("label");
    toggleContainer.className = "gac-toggle";

    const toggleSwitch = document.createElement("input");
    toggleSwitch.type = "checkbox";
    toggleSwitch.checked = enabled;
    toggleSwitch.onchange = () => {
      this.gameSettings[game] = toggleSwitch.checked;
      this.saveSettings();
    };

    const slider = document.createElement("span");
    slider.className = "gac-toggle-slider";

    toggleContainer.appendChild(toggleSwitch);
    toggleContainer.appendChild(slider);
    return toggleContainer;
  }

  /**
   * Creates a remove button for the game
   * @param {string} game - The game name
   * @param {HTMLElement} gameList - The game list element
   * @returns {HTMLElement} The remove button
   */
  createRemoveButton(game, gameList) {
    const removeButton = document.createElement("button");
    removeButton.textContent = "×";
    removeButton.className = "gac-remove-btn";
    removeButton.onclick = () => {
      delete this.gameSettings[game];
      this.saveSettings();
      this.updateGameList(gameList);
    };
    return removeButton;
  }

  /**
   * Loads the plugin styles
   */
  loadStyles() {
    BdApi.DOM.addStyle(
      "GameActivityControl",
      `
        .gac-settings {
          padding: 20px;
          color: var(--text-normal);
          max-width: 800px;
          margin: 0 auto;
        }
        .gac-filter-container {
          display: flex;
          gap: 8px;
          margin-bottom: 20px;
        }
        .gac-search {
          flex: 1;
          background-color: var(--input-background);
          border: none;
          border-radius: 4px;
          color: var(--text-normal);
          padding: 8px 12px;
          font-size: 14px;
        }
        .gac-search::placeholder {
          color: var(--text-muted);
        }
        .gac-sort,
        .gac-view {
          background-color: var(--input-background);
          border: none;
          border-radius: 4px;
          color: var(--text-normal);
          padding: 8px 28px 8px 12px;
          font-size: 14px;
          cursor: pointer;
          appearance: none;
          -webkit-appearance: none;
          background-image: url('data:image/svg+xml;charset=US-ASCII,<svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2.23001 4.5L6.00001 8.27L9.77001 4.5" stroke="rgb(148, 155, 164)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>');
          background-repeat: no-repeat;
          background-position: right 12px center;
        }
        .gac-game-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .gac-game-row {
          display: flex;
          align-items: center;
          padding: 16px;
          background: var(--background-secondary);
          border-radius: 8px;
          transition: background 0.2s;
        }
        .gac-game-row:hover {
          background: var(--background-secondary-alt);
        }
        .gac-name-container {
          flex: 1;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .gac-game-label {
          font-size: 14px;
        }
        .gac-last-played {
          font-size: 12px;
          color: var(--text-muted);
          white-space: nowrap;
        }
        .gac-empty-message {
          text-align: center;
          padding: 20px;
          color: var(--text-muted);
          font-size: 14px;
        }
        .gac-toggle {
          position: relative;
          width: 40px;
          height: 22px;
          margin: 0 12px;
        }
        .gac-toggle input {
          opacity: 0;
          width: 0;
          height: 0;
          position: absolute;
        }
        .gac-toggle-slider {
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
        .gac-toggle-slider:before {
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
        .gac-toggle input:checked + .gac-toggle-slider {
          background-color: rgb(59, 165, 93);
        }
        .gac-toggle input:checked + .gac-toggle-slider:before {
          transform: translateX(18px);
        }
        .gac-remove-btn {
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
        .gac-remove-btn:hover {
          background: var(--background-modifier-hover);
          color: var(--status-danger);
        }
      `
    );
  }
};