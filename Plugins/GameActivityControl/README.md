<div align="center">

# Game Activity Control Plugin

![Version](https://img.shields.io/badge/version-1.0.1-blue.svg)

## Description

This plugin allows users to selectively control which games show up in their Discord activity status. It provides a simple interface to manage game visibility, enhancing user experience by allowing them to customize their online presence.

## Preview

![Game Activity Control Preview](https://i.imgur.com/HvgWTaU.png)

</div>

## Installation

1. Download the `GameActivityControl.plugin.js`.
2. Place the `GameActivityControl.plugin.js` file into your BetterDiscord plugins folder.
3. Enable the plugin through the BetterDiscord settings.

## Usage

1. **Open Settings**: Navigate to the BetterDiscord settings and find the Game Activity Control plugin.
2. **Select Games**: Toggle the switches next to games to show or hide them in your activity status.
3. **Apply Changes**: Click "Done" to save your preferences.
4. **Check Status**: Open Discord to ensure your selected games are displayed.

You can update your game visibility settings anytime through the plugin settings.

## Changelog

### Version 1.0.1

- Updated to match new BdApi version for improved compatibility.
- Temporarily removed search functionality; will be re-added later.
- Introduced automatic hiding of newly added games via a configurable setting.
- Enhanced settings panel with collapsible categories for better navigation.
- Added changelog for version updates and ongoing improvements.

### Version 1.0.0

- Initial release.
- Adds functionality to selectively control which games show up in Discord activity status.
- Introduces a settings panel to toggle visibility of individual games.
- Implements search and filter features for quick game lookup.
- Saves game visibility settings locally and applies them across sessions.
- Includes custom styles for the settings UI, with a modern toggle switch for each game.
- Patches Discord's self-presence store to filter out hidden games from the activity list.

## Support

If you have any questions or need support, feel free to reach out to me on Discord: **Sewsho**.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
