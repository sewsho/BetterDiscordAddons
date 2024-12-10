/**
 * @name GameActivityControl
 * @author Sewsho
 * @description Selectively control which games show up in your Discord activity status
 * @version 1.0.0
 */

module.exports = (meta) => {
  // -- Destructure -- //
  const { Data, Webpack, Patcher, DOM } = BdApi;

  // -- Settings -- //
  const settings = {
    newGamesHidden: false,
    gameList: {},
  };

  // -- Functions -- //
  function addNewGamesToSettings(settings, activities) {
    activities.forEach((activity) => {
      const gameName = activity.name;
      if (gameName && !(gameName in settings.gameList)) {
        settings.gameList[gameName] = !settings.newGamesHidden;
      }
    });
  }

  function patchSelfPresenceStore() {
    const selfPresenceStore = Webpack.getByKeys("getLocalPresence", "getActivities");

    BdApi.Patcher.after(meta.name, selfPresenceStore, "getActivities", (_, args, activities) => {
      if (settings.newGamesHidden !== undefined) {
        addNewGamesToSettings(settings, activities);
        Data.save(meta.name, "settings", settings);
      }

      const filteredActivities = activities.filter((activity) => {
        const gameName = activity.name;
        const isHidden = settings.gameList[gameName] === false;

        return !isHidden;
      });

      return filteredActivities;
    });
  }

  function sortGameList(entries) {
    return entries.sort((a, b) => {
      if (a[1] === b[1]) {
        return a[0].localeCompare(b[0]);
      }
      return a[1] ? 1 : -1;
    });
  }

  function filterGames(searchTerm) {
    searchTerm = searchTerm.toLowerCase();

    const filteredGames = Object.entries(settings.gameList).filter(([gameName, enabled]) => {
      return gameName.toLowerCase().includes(searchTerm);
    });

    return sortGameList(filteredGames);
  }

  // -- UI -- //
  function createSearchInput(type, id, name, placeholder, parent) {
    const searchInput = document.createElement("input");
    searchInput.type = type;
    searchInput.id = id;
    searchInput.name = name;
    searchInput.placeholder = placeholder;
    searchInput.className = "gac-search";
    parent.appendChild(searchInput);
    return searchInput;
  }

  function createGameRow(gameLabel, gameSwitch, parent) {
    const row = document.createElement("div");
    row.appendChild(gameLabel);
    row.appendChild(gameSwitch);
    row.className = "gac-game-row";
    parent.appendChild(row);
    return row;
  }

  function createGameLabel(gameName) {
    const label = document.createElement("span");
    label.textContent = gameName;
    label.className = "gac-game-label";
    return label;
  }

  function createGameSwitch(gameName, checked) {
    const label = document.createElement("label");
    label.className = "switch";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = checked;
    input.addEventListener("change", () => {
      settings.gameList[gameName] = input.checked;
      Data.save(meta.name, "settings", settings);
    });
    const slider = document.createElement("span");
    slider.className = "slider round";
    label.appendChild(input);
    label.appendChild(slider);
    return label;
  }

  function createGameList(gameList, parent) {
    const gameListContainer = document.createElement("div");
    gameListContainer.className = "gac-game-list";
    parent.appendChild(gameListContainer);

    const entries = Object.entries(gameList);
    const sortedEntries = sortGameList(entries);

    if (sortedEntries.length === 0) {
      const noGamesFound = document.createElement("div");
      noGamesFound.textContent = "No games found.";
      noGamesFound.className = "gac-no-games-found";
      gameListContainer.appendChild(noGamesFound);
    } else {
      sortedEntries.forEach(([gameName, enabled]) => {
        createGameRow(
          createGameLabel(gameName),
          createGameSwitch(gameName, enabled),
          gameListContainer
        );
      });
    }
  }

  function injectStyles() {
    DOM.addStyle(
      "gac-styles",
      `
      .gac-settings-panel {
        display: box;
      }

      .gac-search {
        padding: 0 8px;
        margin-bottom: 16px;
        width: 97%;
        height: 32px;
        color: #fff;
        font-size: 14px;
        background-color: #2b2d31;
        border: solid 1px #282828;
        border-radius: 8px;
      }

      .gac-no-games-found {
        color: #e2e2e2;
        font-weight: 500;
      }

      .gac-game-row {
        width: 97%;
        height: 40px;
        background-color: #2b2d31;
        border: solid 1px #282828;
        border-radius: 8px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0 8px;
        margin-bottom: 8px;
      }

      .gac-game-label {
        color: #e2e2e2;
        font-weight: 500;
      }

      .switch {
        position: relative;
        display: inline-block;
        width: 40px;
        height: 24px;
      }


      .switch input {
        opacity: 0;
        width: 0;
        height: 0;
      }

      .slider {
        position: absolute;
        cursor: pointer;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-color: #73767c;
        -webkit-transition: .4s;
        transition: .4s;
      }

      .slider:before {
        position: absolute;
        content: "";
        height: 18px;
        width: 18px;
        left: 3px;
        bottom: 3px;
        background-color: white;
        -webkit-transition: .4s;
        transition: .4s;
      }

      input:checked + .slider {
        background-color: #43b480;
      }

      input:focus + .slider {
        box-shadow: 0 0 1px #43b480;
      }

      input:checked + .slider:before {
        -webkit-transform: translateX(16px);
        -ms-transform: translateX(16px);
        transform: translateX(16px);
      }

      .slider.round {
        border-radius: 24px;
      }

      .slider.round:before {
        border-radius: 50%;
      }
      `
    );
  }

  return {
    start: () => {
      Object.assign(settings, Data.load(meta.name, "settings"));
      patchSelfPresenceStore();
      injectStyles("gac-styles");
    },
    stop: () => {
      Patcher.unpatchAll(meta.name);
      DOM.removeStyle("gac-styles");
    },
    getSettingsPanel: () => {
      const panel = document.createElement("div");
      panel.className = "gac-settings-panel";

      createSearchInput(
        "text",
        "gac-search",
        "gac-search",
        "Search games...",
        panel
      ).addEventListener("input", (e) => {
        const searchTerm = e.target.value;

        const filteredGames = filterGames(searchTerm);

        const gameListContainer = panel.querySelector(".gac-game-list");
        gameListContainer.innerHTML = "";

        if (filteredGames.length === 0) {
          const noGamesFound = document.createElement("div");
          noGamesFound.textContent = "No games found.";
          noGamesFound.className = "gac-no-games-found";
          gameListContainer.appendChild(noGamesFound);
        } else {
          filteredGames.forEach(([gameName, enabled]) => {
            createGameRow(
              createGameLabel(gameName),
              createGameSwitch(gameName, enabled),
              gameListContainer
            );
          });
        }
      });

      createGameList(settings.gameList, panel);

      return panel;
    },
  };
};
