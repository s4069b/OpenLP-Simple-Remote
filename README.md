# OpenLP Simple Remote

A lightweight, portrait-first web remote for OpenLP, designed to work well on older iPads and phones while keeping presentation controls deliberately simple.

**This is an unofficial community project and is not part of OpenLP itself.**

## Features

- Separate **Service** and **Slides** screens inspired by the older OpenLP iOS remote.
- Tap a service item to make it live.
- Optional automatic switch to **Slides** after selecting a service item.
- Tap any slide to make it live.
- Preserves song and Bible-reading line breaks supplied by OpenLP.
- Shows image previews where OpenLP provides usable thumbnails.
- **Blank** and **Show** presentation controls.
- Previous/next service-item controls.
- Sticky app header and footer with a scrollable service/slide area.
- Highlights the current slide and gently returns it to view after manual browsing.
- `-- END --` marker after the final slide.
- Font-size choices: **85%, 100%, 115%, 130%, 145%**; default **115%**.
- Portrait-first layout; landscape uses a centred narrow app window rather than stretching across the screen.
- Optional experimental Soundcraft Ui12/Ui16 recorder control, disabled by default.
- Plain HTML, CSS and ES5-style JavaScript for compatibility with older Safari/WebKit.
- No framework or build step.

## Requirements

- OpenLP 3.x with its built-in web/remote server enabled.
- Developed and tested against OpenLP 3.1.7.
- Core remote functionality has been tested on an iPad 4 running iOS 10.3.4.

## Installation

1. In OpenLP choose **Tools → Open Data Folder**.
2. Open or create the `stages` folder.
3. Copy the entire `openlp-simple-remote` folder into `stages`.
4. Open the remote in a browser at:

   `http://OPENLP-IP:4316/stage/openlp-simple-remote/`

Replace `OPENLP-IP` with the IP address or hostname of the computer running OpenLP.

## Controls

The header contains **Settings**, browser **Reload**, and previous/next service-item controls.

The footer contains **Blank**, **Show**, **Service**, and **Slides**.

### Settings

**Open Slides after selecting a service item** is ON by default. When enabled, selecting a service item makes it live and moves directly to its Slides screen.

**List Font Size** offers 85%, 100%, 115%, 130% and 145%. The default is 115%. This also scales the main footer labels.

Preferences are stored in that browser/device.

## Slide scrolling

The Slides view is designed for live presentation use. The current slide has first priority and is kept fully visible where possible. The next slide is also kept visible where space permits, with `-- END --` treated as the next slide after the final real slide.

You can manually scroll away from the live slide to inspect or select another slide. After about one second without further manual scrolling, the view gently returns to the current slide. Selecting another slide or receiving a new current-slide state from OpenLP immediately takes priority.

## Optional Soundcraft recorder

Settings contains an optional **Soundcraft Recorder** extension for Ui12 and Ui16 mixers. It is disabled by default.

When enabled you can save multiple mixer names and IP addresses/hostnames, select the active mixer, and the browser remembers the last-used mixer. A **Mixer Record** control then appears beside Service and Slides.

The recorder integration should currently be considered **experimental until verified against physical Ui12/Ui16 hardware**. The optional Soundcraft module is not loaded while the feature is disabled, preserving compatibility with older browsers for normal OpenLP use.

The current experimental recorder module uses the MIT-licensed `soundcraft-ui-connection` browser module and therefore requires internet access as well as LAN access to the mixer.

## Project files

Runtime files:

- `stage.html`
- `remote.css`
- `remote.js`
- `soundcraft.mjs`

There is no package manager, transpiler, framework or build command.

## License

MIT — see `LICENSE`.
