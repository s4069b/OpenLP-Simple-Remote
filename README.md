# OpenLP Simple Remote

A lightweight, portrait-first web remote for OpenLP, designed to work well on older iPads and phones while keeping the controls deliberately simple.

**This is an unofficial community project and is not part of OpenLP itself.**

## Features

- Separate **Service** and **Slides** screens inspired by the older OpenLP iOS remote.
- Tap a service item to make it live.
- Optional automatic switch to **Slides** after selecting a service item.
- Tap any slide to make it live.
- Song/Bible text and image previews where OpenLP provides usable thumbnails.
- **Blank** and **Show** controls.
- Previous/next service-item controls.
- Sticky header and footer; only the content list scrolls.
- Current slide highlighting.
- One-second manual-scroll grace period before returning to the live slide.
- `-- END --` marker after the final slide in a service item.
- Font-size choices: **85%, 100%, 115%, 130%, 145%**.
- Default font size: **115%**.
- Larger image previews.
- Settings/help panel.
- Browser reload control.
- Plain HTML/CSS/ES5-style JavaScript for older Safari/WebKit compatibility.
- No framework and no build step.

## Requirements

- OpenLP 3.x with its built-in web/remote server enabled.
- Developed and tested against OpenLP **3.1.7**.

## Installation

1. In OpenLP choose **Tools → Open Data Folder**.
2. Open or create the `stages` folder.
3. Copy this entire `openlp-simple-remote` folder into `stages`. (you can choose to name this folder anything you like and it will change the URL in the next step)
4. Open:

   `http://OPENLP-IP:4316/stage/openlp-simple-remote/`

Replace `OPENLP-IP` with the IP address or hostname of the computer running OpenLP.

## Controls

### Header

- **Settings** — preferences and help.
- **Reload** — completely reloads the browser page.
- **Up / Down** — previous or next service item.

### Footer

- **Blank** — blank the presentation output.
- **Show** — return to the current presentation.
- **Service** — show the service-item list.
- **Slides** — show slides in the current service item.

## Settings

### Open Slides after selecting a service item

Default: **On**

When enabled, selecting a service item makes it live and moves directly to the Slides screen.

### List Font Size

Available sizes:

- 85%
- 100%
- 115% — default
- 130%
- 145%

This setting also scales the **Blank**, **Show**, **Service**, and **Slides** labels.

Preferences are stored in that browser/device.

## Slide scrolling

The Slides view is designed around live presentation use:

1. The current slide has first priority and is kept visible.
2. The next slide is kept visible where possible.
3. After the final real slide, `-- END --` is treated as the next slide.
4. You may manually scroll away to inspect or select another slide.
5. After about one second without further manual scrolling, the view gently returns to the current slide.
6. If OpenLP reports a different current slide, the new live slide becomes authoritative immediately.

## Windows note

On some Windows systems OpenLP's `live-image` endpoint can return the desktop instead of the presentation output. This remote does not depend on a full-screen confidence-monitor image, so Service/Slides operation remains usable.

## Project files

There are only three runtime files:

- `stage.html`
- `remote.css`
- `remote.js`

No package manager, transpiler, framework, or build command is required.

## License

MIT — see [LICENSE](LICENSE).
