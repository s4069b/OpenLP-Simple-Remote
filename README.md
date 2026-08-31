# OpenLP Simple Remote

A lightweight, portrait-first web remote for OpenLP. It is designed to stay simple, work well on older Safari/WebKit devices, and provide the presentation controls needed during a service without trying to reproduce the full OpenLP web interface.

**This is an unofficial community project and is not part of or endorsed by OpenLP.**

## Features

- Separate **Service** and **Slides** screens.
- Tap a service item or slide to make it live.
- Optional automatic move to **Slides** after selecting a service item.
- Preserves song and Bible-reading line breaks supplied by OpenLP.
- Uses image thumbnails where OpenLP supplies a usable image.
- **Blank** and **Show** controls.
- Previous/next service-item controls.
- Sticky header/footer with a scrollable service/slide area.
- Current-slide highlighting with gentle return after manual browsing.
- `-- END --` marker after the final slide.
- List font sizes: **85%, 100%, 115%, 130%, 145%**; default **115%**.
- Portrait-first layout; landscape keeps a centred narrow remote rather than stretching full-width.
- Optional offline Soundcraft Ui12/Ui16 2-track USB recorder control.
- Multiple saved mixers, footer mixer cycling, and a 3-second confirmation before stopping a recording.
- Plain HTML, CSS and ES5-style JavaScript; no framework, package manager or build step.

## Requirements

- OpenLP 3.x with its built-in web/remote server enabled.
- Developed against OpenLP 3.1.7.
- Core remote behaviour has also been exercised on older Safari/WebKit, including iOS 10.3.4.

## Installation

1. In OpenLP choose **Tools → Open Data Folder**.
2. Open or create the `stages` folder.
3. Copy the included `remote` folder into `stages`.
4. Browse to:

   `http://OPENLP-IP:4316/stage/remote/`

Replace `OPENLP-IP` with the address of the computer running OpenLP.

## Controls and settings

The header contains **Settings**, **Refresh**, and previous/next service-item controls.

The footer contains **Blank**, **Show**, **Service**, **Slides**, and—when enabled—the **Record** control.

**Open Slides after selecting a service item** is enabled by default. **List Font Size** changes service-item and slide text. Preferences are stored in the browser/device.

Slide taps are sent serially to OpenLP so a quick second selection is retained instead of being silently discarded while a previous slide request is still in flight.

## Soundcraft recorder

The optional Soundcraft recorder is disabled by default. It talks directly to a Soundcraft Ui12/Ui16 on the local network and does not require an internet connection.

When enabled, Settings can add, edit and remove mixers. Only the selected mixer is controlled at a time. **Change Mixer** in the footer steps through the saved mixer list and loops back to the first.

The Record control shows recorder state visually and in the footer status. Stopping is deliberately two-step: the first tap shows **CONFIRM** for three seconds; a second tap within that window stops the recording.

Built-in defaults are defined in `window.OPENLP_DEFAULT_MIXERS` near the bottom of `stage.html`. The GitHub build ships with an empty default list; add your own defaults there if desired. Mixer changes made in Settings are saved in the browser and take precedence.

## Theme

Edit `theme.css` to change the main interface colours:

```css
--theme-header
--theme-accent
--theme-soft
--theme-background
```

Current-slide emphasis is controlled by:

```css
--current-slide-fill
--current-slide-text
--current-slide-border
--current-slide-border-width
```

The opening `<html>` line in `stage.html` chooses either `current-border-left` or `current-border-all`.

## Files

Runtime files:

- `stage.html`
- `theme.css`
- `remote.css`
- `remote.js`
- `soundcraft.js`
- `favicon.png`
- `apple-touch-icon.png`

There is no compilation or build command.

## License

MIT — see `LICENSE`.
