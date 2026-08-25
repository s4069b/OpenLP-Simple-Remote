import { SoundcraftUI } from 'https://cdn.jsdelivr.net/npm/soundcraft-ui-connection@7.0.2/index.mjs';

let conn = null;
let activeHost = '';
let connected = false;
let recording = false;
let busy = false;
let subscriptions = [];

function notify(text, error) {
  if (window.OpenLPSoundcraftStatus) {
    window.OpenLPSoundcraftStatus({
      text,
      error: !!error,
      connected,
      recording,
      busy
    });
  }
}

function clearSubscriptions() {
  subscriptions.forEach((sub) => {
    try { sub.unsubscribe(); } catch (_) {}
  });
  subscriptions = [];
}

async function disconnect() {
  clearSubscriptions();
  if (conn) {
    try { await conn.disconnect(); } catch (_) {}
  }
  conn = null;
  activeHost = '';
  connected = false;
  recording = false;
  busy = false;
  notify('Disconnected');
}

async function connect(host) {
  host = String(host || '').trim();
  if (!host) {
    await disconnect();
    notify('No mixer');
    return;
  }

  if (conn && host === activeHost && connected) {
    return;
  }

  await disconnect();
  activeHost = host;
  notify('Connecting…');

  try {
    conn = new SoundcraftUI(host);

    subscriptions.push(conn.status$.subscribe((status) => {
      const type = status && status.type ? String(status.type).toLowerCase() : '';
      if (type.indexOf('open') >= 0 || type.indexOf('connect') >= 0) {
        connected = true;
        notify(recording ? 'Recording' : 'Ready');
      } else if (type.indexOf('close') >= 0 || type.indexOf('error') >= 0) {
        connected = false;
        notify(type.indexOf('error') >= 0 ? 'Connection error' : 'Disconnected', type.indexOf('error') >= 0);
      }
    }));

    subscriptions.push(conn.recorderDualTrack.recording$.subscribe((value) => {
      recording = !!value;
      notify(recording ? 'Recording' : (connected ? 'Ready' : 'Connecting…'));
    }));

    subscriptions.push(conn.recorderDualTrack.busy$.subscribe((value) => {
      busy = !!value;
      notify(recording ? 'Recording' : (busy ? 'Recorder busy' : (connected ? 'Ready' : 'Connecting…')));
    }));

    await conn.connect();
    connected = true;
    notify(recording ? 'Recording' : 'Ready');
  } catch (err) {
    connected = false;
    notify('Connection error', true);
  }
}

function toggleDesired() {
  if (!conn || !connected || busy) {
    return;
  }

  /*
    The Ui dual-track API provides a toggle command and a reported recording
    state. Because the UI button label is derived from actual recording$ state,
    this behaves as explicit Record/Stop rather than a blind local toggle.
  */
  try {
    conn.recorderDualTrack.recordToggle();
  } catch (err) {
    notify('Recorder command failed', true);
  }
}

window.SoundcraftRecorderBridge = {
  connect,
  disconnect,
  toggleDesired
};

if (window.OpenLPSoundcraftModuleReady) {
  window.OpenLPSoundcraftModuleReady();
}
