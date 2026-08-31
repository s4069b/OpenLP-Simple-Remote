
(function () {
  "use strict";

  var socket = null;
  var keepaliveTimer = null;
  var reconnectTimer = null;
  var activeHost = "";
  var connected = false;
  var recording = false;
  var busy = false;
  var deliberateClose = false;
  var sawRecordingFeedback = false;
  var usbMissing = false;
  var startCheckTimer = null;
  var disconnectNoticeTimer = null;

  function notify(text, error) {
    if (window.OpenLPSoundcraftStatus) {
      window.OpenLPSoundcraftStatus({
        text: text,
        error: !!error,
        connected: connected,
        recording: recording,
        busy: busy,
        usbMissing: usbMissing
      });
    }
  }

  function cleanHost(host) {
    host = String(host || "").replace(/^\s+|\s+$/g, "");
    host = host.replace(/^https?:\/\//i, "");
    host = host.replace(/^wss?:\/\//i, "");
    host = host.replace(/\/.*$/, "");
    return host;
  }

  function clearTimers() {
    if (keepaliveTimer) {
      window.clearInterval(keepaliveTimer);
      keepaliveTimer = null;
    }
    if (reconnectTimer) {
      window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (startCheckTimer) {
      window.clearTimeout(startCheckTimer);
      startCheckTimer = null;
    }
    if (disconnectNoticeTimer) {
      window.clearTimeout(disconnectNoticeTimer);
      disconnectNoticeTimer = null;
    }
  }

  function sendCommand(command) {
    if (!socket || socket.readyState !== 1) {
      return false;
    }
    try {
      /*
       * Soundcraft Ui protocol framing used by soundcraft-ui-connection:
       * the mixer command is carried inside a "3:::" WebSocket message.
       */
      socket.send("3:::" + command);
      return true;
    } catch (e) {
      notify("Recorder command failed", true);
      return false;
    }
  }

  function parseOne(message) {
    var body, parts, key, value;

    if (typeof message !== "string") {
      return;
    }

    /* The Ui library only consumes messages framed with 3:::. */
    if (message.indexOf("3:::") === 0) {
      body = message.substring(4);
    } else {
      body = message;
    }

    if (body.indexOf("SETD^") !== 0 && body.indexOf("SETS^") !== 0) {
      return;
    }

    parts = body.split("^");
    if (parts.length < 3) {
      return;
    }

    key = parts[1];
    value = parts.slice(2).join("^");

    if (key === "var.isRecording") {
      sawRecordingFeedback = true;
      recording = Number(value) !== 0;
      if (recording) {
        usbMissing = false;
        if (startCheckTimer) {
          window.clearTimeout(startCheckTimer);
          startCheckTimer = null;
        }
      }
      notify(recording ? "Recording" : (usbMissing ? "USB not present or not ready" : "Ready"));
    } else if (key === "var.recBusy") {
      busy = Number(value) !== 0;
      /*
       * On the tested Ui recorder, recBusy is the practical signal that the
       * 2-track recorder is unavailable, including the no-USB case.
       */
      if (busy && !recording) {
        usbMissing = true;
      } else if (!busy && !recording) {
        usbMissing = false;
      }
      notify(recording ? "Recording" : ((busy || usbMissing) ? "No USB" : "Ready"));
    }
  }

  function parseIncoming(data) {
    var lines, i;
    if (typeof data !== "string") {
      return;
    }
    lines = data.split(/\r?\n/);
    for (i = 0; i < lines.length; i += 1) {
      parseOne(lines[i]);
    }
  }

  function openSocket(host) {
    var url;

    host = cleanHost(host);
    if (!host) {
      notify("No mixer");
      return;
    }

    activeHost = host;
    deliberateClose = false;
    notify("Connecting…");

    url = "ws://" + host;

    try {
      socket = new WebSocket(url);
    } catch (e) {
      connected = false;
      notify("Connection error", true);
      return;
    }

    socket.onopen = function () {
      connected = true;
      if (disconnectNoticeTimer) {
        window.clearTimeout(disconnectNoticeTimer);
        disconnectNoticeTimer = null;
      }
      notify(recording ? "Recording" : ((busy || usbMissing) ? "No USB" : "Ready"));

      if (keepaliveTimer) {
        window.clearInterval(keepaliveTimer);
      }
      keepaliveTimer = window.setInterval(function () {
        sendCommand("ALIVE");
      }, 1000);
    };

    socket.onmessage = function (event) {
      parseIncoming(event.data);
    };

    socket.onerror = function () {
      /*
       * Do not change visible state here. Some browsers emit transient
       * WebSocket errors even though the Ui connection remains usable.
       * A genuine loss is handled by onclose.
       */
    };

    socket.onclose = function () {
      connected = false;
      if (keepaliveTimer) {
        window.clearInterval(keepaliveTimer);
        keepaliveTimer = null;
      }

      if (!deliberateClose && activeHost) {
        /*
         * Ui connections can briefly recycle. Reconnect promptly but do not
         * flash "Not connected" for a short interruption.
         */
        reconnectTimer = window.setTimeout(function () {
          openSocket(activeHost);
        }, 350);

        if (disconnectNoticeTimer) {
          window.clearTimeout(disconnectNoticeTimer);
        }
        disconnectNoticeTimer = window.setTimeout(function () {
          disconnectNoticeTimer = null;
          if (!connected) {
            notify("Disconnected", false);
          }
        }, 5000);
      } else {
        notify("Disconnected", false);
      }
    };
  }

  function disconnect() {
    deliberateClose = true;
    clearTimers();
    connected = false;
    busy = false;
    sawRecordingFeedback = false;
    usbMissing = false;
    if (startCheckTimer) { window.clearTimeout(startCheckTimer); startCheckTimer = null; }
    if (socket) {
      try { socket.close(); } catch (e) {}
    }
    socket = null;
    activeHost = "";
    notify("Disconnected");
  }

  function connect(host) {
    host = cleanHost(host);
    if (!host) {
      disconnect();
      notify("No mixer");
      return;
    }

    if (socket && connected && host === activeHost) {
      return;
    }

    deliberateClose = true;
    clearTimers();
    if (socket) {
      try { socket.close(); } catch (e) {}
    }
    socket = null;
    connected = false;
    recording = false;
    busy = false;
    sawRecordingFeedback = false;
    usbMissing = false;
    if (startCheckTimer) { window.clearTimeout(startCheckTimer); startCheckTimer = null; }
    activeHost = host;
    deliberateClose = false;
    openSocket(host);
  }


  function toggleDesired() {
    var wasRecording;

    if (!connected) {
      return;
    }
    if (busy && !recording) {
      usbMissing = true;
      notify("No USB", true);
      return;
    }

    wasRecording = recording;
    if (sendCommand("RECTOGGLE")) {
      if (wasRecording) {
        notify("Stopping…");
        return;
      }

      /*
       * The Ui protocol/library exposes recording and busy state but does not
       * provide a documented USB-present flag. Therefore a failed transition
       * into recording is treated as USB absent/not ready. A retry remains
       * available so plugging a drive in does not require reloading the page.
       */
      usbMissing = false;
      notify("Starting…");
      if (startCheckTimer) {
        window.clearTimeout(startCheckTimer);
      }
      startCheckTimer = window.setTimeout(function () {
        startCheckTimer = null;
        if (connected && !recording) {
          usbMissing = true;
          notify("USB not present or not ready", true);
        }
      }, 3500);
    }
  }


  window.SoundcraftRecorderBridge = {
    connect: connect,
    disconnect: disconnect,
    toggleDesired: toggleDesired
  };

  if (window.OpenLPSoundcraftModuleReady) {
    window.OpenLPSoundcraftModuleReady();
  }
}());
