(function () {
  "use strict";

  var POLL_MS = 900;
  var COMMAND_GUARD_MS = 450;

  var state = {
    poll: null,
    serviceItems: [],
    currentServiceIndex: -1,
    slides: [],
    currentSlideIndex: -1,
    lastCommandAt: 0,
    manualScrollUntil: 0,
    scrollReturnTimer: null,
    programmaticScroll: false,
    listFontIndex: 2,
    lastServerSlideIndex: -1,
    soundcraftEnabled: false,
    soundcraftMixers: [],
    soundcraftActiveId: "",
    soundcraftEditingId: "",
    soundcraftModuleLoading: false,
    soundcraftModuleLoaded: false,
    lastTouchSelectionAt: 0,
    slideScrollAnimation: null,
    openSlidesOnServiceSelect: true
  };

  try {
    if (window.localStorage &&
        window.localStorage.getItem("openlp-v14-auto-slides") === "0") {
      state.openSlidesOnServiceSelect = false;
    }
  } catch (e) {
    state.openSlidesOnServiceSelect = true;
  }

  function byId(id) { return document.getElementById(id); }

  function setText(id, text) {
    var el = byId(id);
    if (!el) { return; }
    if (typeof el.textContent !== "undefined") { el.textContent = text; }
    else { el.innerText = text; }
  }

  function xhr(method, url, body, callback) {
    var req = new XMLHttpRequest();
    req.open(method, url, true);
    req.onreadystatechange = function () {
      var data = null;
      if (req.readyState !== 4) { return; }
      if (req.status >= 200 && req.status < 300) {
        if (req.responseText) {
          try { data = JSON.parse(req.responseText); }
          catch (e) { data = req.responseText; }
        }
        callback(null, data, req);
      } else {
        callback(new Error("HTTP " + req.status), null, req);
      }
    };
    if (body !== null && typeof body !== "undefined") {
      req.setRequestHeader("Content-Type", "application/json");
      req.send(JSON.stringify(body));
    } else {
      req.send(null);
    }
  }

  function getJSON(url, cb) { xhr("GET", url, null, cb); }

  function normaliseResults(data) {
    if (!data) { return {}; }
    return data.results || data.result || data;
  }

  function guardCommand(fn) {
    var now = new Date().getTime();
    if (now - state.lastCommandAt < COMMAND_GUARD_MS) { return; }
    state.lastCommandAt = now;
    fn();
  }

  function itemTitle(item) {
    if (!item) { return "Untitled"; }
    return item.title || item.name || item.text || "Untitled";
  }

  function slideText(slide) {
    var t, lines, cleaned, i, line;

    if (!slide) {
      return "";
    }

    t = slide.text || slide.title || slide.Title || "";
    t = String(t);

    /*
      Preserve the line structure supplied by OpenLP.

      Some API responses contain literal newlines, while others contain HTML
      such as <br>, <div> or <p>. Convert those structural breaks to newlines
      before removing the remaining markup.
    */
    t = t.replace(/\r\n/g, "\n");
    t = t.replace(/\r/g, "\n");
    t = t.replace(/<br\s*\/?>/gi, "\n");
    t = t.replace(/<\/div\s*>/gi, "\n");
    t = t.replace(/<\/p\s*>/gi, "\n");
    t = t.replace(/<[^>]+>/g, "");

    /*
      Clean each line independently so ordinary repeated spaces are tidied
      without destroying carriage returns between song/Bible lines.
    */
    lines = t.split("\n");
    cleaned = [];

    for (i = 0; i < lines.length; i += 1) {
      line = lines[i].replace(/[ \t]+/g, " ");
      line = line.replace(/^[ \t]+|[ \t]+$/g, "");

      /* Avoid huge runs of empty lines, but preserve intentional blank lines. */
      if (line !== "" || (cleaned.length && cleaned[cleaned.length - 1] !== "")) {
        cleaned.push(line);
      }
    }

    while (cleaned.length && cleaned[cleaned.length - 1] === "") {
      cleaned.pop();
    }

    return cleaned.join("\n");
  }

  function slideImage(slide) {
    if (!slide) { return ""; }
    return slide.img || slide.image || slide.thumbnail || "";
  }

  function switchScreen(name) {
    byId("service-screen").className = "screen" + (name === "service" ? " active-screen" : "");
    byId("slides-screen").className = "screen" + (name === "slides" ? " active-screen" : "");
    byId("service-tab").className = "tab" + (name === "service" ? " active-tab" : "");
    byId("slides-tab").className = "tab" + (name === "slides" ? " active-tab" : "");
    setText("screen-title", name === "service" ? "Service" : "Slides");
    if (name === "slides") {
      window.setTimeout(function () { normalSlidePosition(true, false); }, 50);
    }
  }

  function renderScreenState() {
    var p = state.poll || {};
    var blank = !!p.blank;
    var show = !blank && !p.display && !p.theme;

    byId("black-btn").className = "display-btn" + (blank ? " active-display" : "");
    byId("show-btn").className = "display-btn" + (show ? " active-display" : "");

    if (blank) { setText("state-text", "OpenLP reports: BLANK"); }
    else if (p.theme) { setText("state-text", "OpenLP reports: THEME"); }
    else if (p.display) { setText("state-text", "OpenLP reports: DESKTOP"); }
    else { setText("state-text", "OpenLP reports: SHOW"); }
  }

  function pollOpenLP(done) {
    getJSON("/api/poll?_=" + new Date().getTime(), function (err, data) {
      if (!err) {
        state.poll = normaliseResults(data);
        renderScreenState();
      }
      if (done) { done(); }
    });
  }

  function loadService(done) {
    getJSON("/api/v2/service/items?_=" + new Date().getTime(), function (err, data) {
      var items, i, selected = -1;
      if (err) { if (done) { done(); } return; }

      items = data || [];
      if (!(items instanceof Array)) {
        items = normaliseResults(data).items || [];
      }

      state.serviceItems = items;
      for (i = 0; i < items.length; i += 1) {
        if (items[i].selected) { selected = i; break; }
      }
      state.currentServiceIndex = selected;
      renderService();
      if (done) { done(); }
    });
  }

  function renderService() {
    var list = byId("service-list");
    var i, row;

    while (list.firstChild) { list.removeChild(list.firstChild); }

    for (i = 0; i < state.serviceItems.length; i += 1) {
      row = document.createElement("button");
      row.type = "button";
      row.className = "service-row" + (i === state.currentServiceIndex ? " current" : "");
      row.setAttribute("data-index", String(i));
      row.appendChild(document.createTextNode(itemTitle(state.serviceItems[i])));
      row.onclick = function () {
        var idx = parseInt(this.getAttribute("data-index"), 10);
        if (!isNaN(idx)) { selectServiceIndex(idx, true); }
      };
      list.appendChild(row);
    }
  }

  function loadSlides(done) {
    getJSON("/api/v2/controller/live-items?_=" + new Date().getTime(), function (err, data) {
      var slides, i, selected = -1;
      if (err) { if (done) { done(); } return; }

      data = data || {};
      slides = data.slides || [];
      state.slides = slides;

      for (i = 0; i < slides.length; i += 1) {
        if (slides[i].selected) { selected = i; break; }
      }
      if (selected !== state.lastServerSlideIndex) {
        state.lastServerSlideIndex = selected;
        cancelSlideScrollAnimation();
        state.programmaticScroll = false;
        state.manualScrollUntil = 0;

        if (state.scrollReturnTimer) {
          window.clearTimeout(state.scrollReturnTimer);
          state.scrollReturnTimer = null;
        }
      }

      state.currentSlideIndex = selected;
      renderSlides();
      if (done) { done(); }
    });
  }


  function cancelSlideScrollAnimation() {
    if (state.slideScrollAnimation !== null) {
      try {
        window.cancelAnimationFrame(state.slideScrollAnimation);
      } catch (e) {}
      state.slideScrollAnimation = null;
    }
  }

  function easeInOutCubic(t) {
    if (t < 0.5) {
      return 4 * t * t * t;
    }
    return 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function animateSlidesScroll(scroller, target, duration) {
    var startTop = scroller.scrollTop;
    var distance = target - startTop;
    var startTime = null;

    cancelSlideScrollAnimation();

    if (Math.abs(distance) < 2) {
      return;
    }

    state.programmaticScroll = true;

    function frame(timestamp) {
      var elapsed, progress, eased;

      if (startTime === null) {
        startTime = timestamp;
      }

      elapsed = timestamp - startTime;
      progress = elapsed / duration;

      if (progress > 1) {
        progress = 1;
      }

      eased = easeInOutCubic(progress);
      scroller.scrollTop = startTop + (distance * eased);

      if (progress < 1) {
        state.slideScrollAnimation = window.requestAnimationFrame(frame);
      } else {
        scroller.scrollTop = target;
        state.slideScrollAnimation = null;
        window.setTimeout(function () {
          state.programmaticScroll = false;
        }, 80);
      }
    }

    state.slideScrollAnimation = window.requestAnimationFrame(frame);
  }

  function setSlidesScrollTop(scroller, target, gentle) {
    var maxScroll;

    if (!scroller) {
      return;
    }

    maxScroll = Math.max(0, scroller.scrollHeight - scroller.clientHeight);

    if (target < 0) {
      target = 0;
    }
    if (target > maxScroll) {
      target = maxScroll;
    }

    if (Math.abs(scroller.scrollTop - target) < 2) {
      return;
    }

    if (gentle) {
      /*
        Do not rely on CSS smooth scrolling. iOS 10 does not support it.
        Animate manually so old iPads get the same gentle return.
      */
      animateSlidesScroll(scroller, target, 550);
    } else {
      cancelSlideScrollAnimation();
      state.programmaticScroll = true;
      scroller.scrollTop = target;

      window.setTimeout(function () {
        state.programmaticScroll = false;
      }, 80);
    }
  }

  
  function normalSlidePosition(force, gentle) {
    var scroller = byId("slides-screen");
    var rows, current, nextVisual, endMarkers;
    var sRect, cRect, nRect;
    var viewportHeight, currentHeight, nextHeight;
    var preferredGap, minimumGap, chosenGap;
    var targetTop, currentDocumentTop;
    var maxGapForCurrent, maxGapForFullNext;
    var now = new Date().getTime();

    if (!scroller || state.currentSlideIndex < 0) {
      return;
    }

    if (!force && now < state.manualScrollUntil) {
      return;
    }

    rows = scroller.getElementsByClassName("slide-row");
    current = rows[state.currentSlideIndex];

    if (!current) {
      return;
    }

    endMarkers = scroller.getElementsByClassName("slide-end-marker");

    if (state.currentSlideIndex + 1 < rows.length) {
      nextVisual = rows[state.currentSlideIndex + 1];
    } else {
      nextVisual = endMarkers.length ? endMarkers[0] : null;
    }

    sRect = scroller.getBoundingClientRect();
    cRect = current.getBoundingClientRect();

    viewportHeight = scroller.clientHeight;
    currentHeight = current.offsetHeight;

    preferredGap = Math.round(currentHeight / 3);
    if (preferredGap < 36) {
      preferredGap = 36;
    }
    if (preferredGap > 90) {
      preferredGap = 90;
    }

    minimumGap = 8;

    /* Priority 1: keep current fully visible where physically possible. */
    maxGapForCurrent = viewportHeight - currentHeight - 8;

    if (maxGapForCurrent < minimumGap) {
      chosenGap = Math.max(0, maxGapForCurrent);
    } else {
      chosenGap = Math.min(preferredGap, maxGapForCurrent);
    }

    /*
      Priority 2: treat the next real slide or -- END -- exactly the same.
      Reduce the top gap only as much as necessary to reveal the following row.
      There is still only ONE resulting target position.
    */
    if (nextVisual) {
      nRect = nextVisual.getBoundingClientRect();
      nextHeight = nextVisual.offsetHeight || (nRect.bottom - nRect.top);
      maxGapForFullNext = viewportHeight - currentHeight - nextHeight - 8;

      if (maxGapForFullNext >= minimumGap) {
        chosenGap = Math.min(chosenGap, maxGapForFullNext);
      } else {
        chosenGap = Math.min(chosenGap, minimumGap);
      }
    }

    if (chosenGap < 0) {
      chosenGap = 0;
    }

    /*
      Calculate one absolute resting position. No second corrective nudge is
      performed, so the 900ms poll cannot bounce between two "valid" positions.
    */
    currentDocumentTop = scroller.scrollTop + (cRect.top - sRect.top);
    targetTop = currentDocumentTop - chosenGap;

    setSlidesScrollTop(scroller, targetTop, !!gentle);
  }

  function beginManualSlideBrowse() {
    var now = new Date().getTime();

    cancelSlideScrollAnimation();
    state.programmaticScroll = false;

    state.manualScrollUntil = now + 1000;

    if (state.scrollReturnTimer) {
      window.clearTimeout(state.scrollReturnTimer);
    }

    state.scrollReturnTimer = window.setTimeout(function () {
      state.manualScrollUntil = 0;
      normalSlidePosition(true, true);
    }, 1000);
  }

  function noteManualSlideScroll() {
    if (state.programmaticScroll) {
      return;
    }
    beginManualSlideBrowse();
  }

  
  function renderSlides() {
    var list = byId("slide-list");
    var i, row, thumb, img, text, src;

    while (list.firstChild) { list.removeChild(list.firstChild); }

    for (i = 0; i < state.slides.length; i += 1) {
      row = document.createElement("button");
      row.type = "button";
      row.className = "slide-row" + (i === state.currentSlideIndex ? " current" : "");
      row.setAttribute("data-index", String(i));

      src = slideImage(state.slides[i]);

      thumb = document.createElement("span");
      thumb.className = "slide-thumb";

      text = document.createElement("span");
      text.className = "slide-text";
      text.appendChild(document.createTextNode(slideText(state.slides[i]) || ("Slide " + (i + 1))));

      if (src) {
        img = document.createElement("img");
        img.alt = "";
        img.src = src;
        img.onerror = function () {
          if (this && this.parentNode) {
            this.parentNode.style.display = "none";
            if (this.parentNode.parentNode) {
              this.parentNode.parentNode.className += " text-only";
            }
          }
        };
        thumb.appendChild(img);
        row.appendChild(thumb);
      } else {
        row.className += " text-only";
      }

      row.appendChild(text);
      row.onclick = function () {
        var idx = parseInt(this.getAttribute("data-index"), 10);
        if (!isNaN(idx)) { selectSlideIndex(idx); }
      };
      list.appendChild(row);
    }

    if (state.slides.length) {
      var endMarker = document.createElement("div");
      endMarker.className = "slide-end-marker";
      endMarker.setAttribute("aria-label", "End of service item");
      endMarker.appendChild(document.createTextNode("-- END --"));
      list.appendChild(endMarker);
    }

    window.setTimeout(function () { normalSlidePosition(false, false); }, 40);
  }

  function selectServiceIndex(index, fromServiceTap) {
    var item = state.serviceItems[index];
    if (!item) { return; }
    guardCommand(function () {
      xhr("POST", "/api/v2/service/show", {id: item.id}, function () {
        window.setTimeout(function () {
          refreshAll();
          if (fromServiceTap && state.openSlidesOnServiceSelect) {
            switchScreen("slides");
          }
        }, 150);
      });
    });
  }

  function selectSlideIndex(index) {
    guardCommand(function () {
      cancelSlideScrollAnimation();
      state.programmaticScroll = false;
      state.manualScrollUntil = 0;
      if (state.scrollReturnTimer) {
        window.clearTimeout(state.scrollReturnTimer);
        state.scrollReturnTimer = null;
      }

      xhr("POST", "/api/v2/controller/show", {id: index}, function () {
        window.setTimeout(function () {
          refreshAll();
          window.setTimeout(function () {
            normalSlidePosition(true, true);
          }, 80);
        }, 120);
      });
    });
  }

  function prevService() {
    if (state.currentServiceIndex > 0) {
      selectServiceIndex(state.currentServiceIndex - 1, false);
    }
  }

  function nextService() {
    if (state.currentServiceIndex < 0 && state.serviceItems.length) {
      selectServiceIndex(0, false);
    } else if (state.currentServiceIndex < state.serviceItems.length - 1) {
      selectServiceIndex(state.currentServiceIndex + 1, false);
    }
  }

  function refreshAll() {
    pollOpenLP(function () {
      loadService(function () {
        loadSlides();
      });
    });
  }

  function applyListFontSize(index, save) {
    var scales = [0.85, 1, 1.15, 1.30, 1.45];
    var labels = ["85%", "100%", "115%", "130%", "145%"];
    index = parseInt(index, 10);
    if (isNaN(index) || index < 0 || index > 4) { index = 2; }
    state.listFontIndex = index;
    document.documentElement.style.setProperty("--list-font-scale", String(scales[index]));
    setText("font-size-value", labels[index]);
    if (byId("font-size-slider")) { byId("font-size-slider").value = String(index); }
    if (save) {
      try { window.localStorage.setItem("openlp-list-font-size", String(index)); } catch (e) {}
    }
    window.setTimeout(function () { normalSlidePosition(true, false); }, 30);
  }

  function soundcraftStorageLoad() {
    var raw, data, i;

    try {
      raw = window.localStorage.getItem("openlp-soundcraft-settings");
      if (raw) {
        data = JSON.parse(raw);
        state.soundcraftEnabled = !!data.enabled;
        state.soundcraftMixers = data.mixers || [];
        state.soundcraftActiveId = data.activeId || "";
      }
    } catch (e) {
      state.soundcraftEnabled = false;
      state.soundcraftMixers = [];
      state.soundcraftActiveId = "";
    }

    if (state.soundcraftMixers.length && !findSoundcraftMixer(state.soundcraftActiveId)) {
      state.soundcraftActiveId = state.soundcraftMixers[0].id;
    }

    byId("soundcraft-enable-toggle").checked = state.soundcraftEnabled;
    renderSoundcraftSettings();
  }

  function soundcraftStorageSave() {
    try {
      window.localStorage.setItem("openlp-soundcraft-settings", JSON.stringify({
        enabled: state.soundcraftEnabled,
        mixers: state.soundcraftMixers,
        activeId: state.soundcraftActiveId
      }));
    } catch (e) {}
  }

  function findSoundcraftMixer(id) {
    var i;
    for (i = 0; i < state.soundcraftMixers.length; i += 1) {
      if (state.soundcraftMixers[i].id === id) {
        return state.soundcraftMixers[i];
      }
    }
    return null;
  }

  function makeSoundcraftId() {
    return "mixer-" + new Date().getTime() + "-" + Math.floor(Math.random() * 100000);
  }

  function renderSoundcraftSettings() {
    var config = byId("soundcraft-config");
    var select = byId("soundcraft-mixer-select");
    var recordBtn = byId("soundcraft-record-btn");
    var tabbar = byId("tabbar");
    var i, option, mixer;

    config.hidden = !state.soundcraftEnabled;
    recordBtn.hidden = !state.soundcraftEnabled;

    if (state.soundcraftEnabled) {
      tabbar.className = "soundcraft-enabled";
    } else {
      tabbar.className = "";
      setText("soundcraft-status", "Disabled");
      byId("soundcraft-status").className = "soundcraft-status";
      if (window.SoundcraftRecorderBridge) {
        window.SoundcraftRecorderBridge.disconnect();
      }
    }

    while (select.options.length) {
      select.remove(0);
    }

    if (!state.soundcraftMixers.length) {
      option = document.createElement("option");
      option.value = "";
      option.appendChild(document.createTextNode("No mixers saved"));
      select.appendChild(option);
    } else {
      for (i = 0; i < state.soundcraftMixers.length; i += 1) {
        mixer = state.soundcraftMixers[i];
        option = document.createElement("option");
        option.value = mixer.id;
        option.appendChild(document.createTextNode(mixer.name + " — " + mixer.host));
        if (mixer.id === state.soundcraftActiveId) {
          option.selected = true;
        }
        select.appendChild(option);
      }
    }

    if (state.soundcraftEnabled) {
      ensureSoundcraftModule();
    }
  }

  function ensureSoundcraftModule() {
    var script;

    if (!state.soundcraftEnabled) {
      return;
    }

    if (window.SoundcraftRecorderBridge) {
      state.soundcraftModuleLoaded = true;
      connectSelectedSoundcraft();
      return;
    }

    if (state.soundcraftModuleLoading) {
      return;
    }

    /*
      The ordinary OpenLP remote remains pure ES5 and does not load this
      modern module unless Soundcraft support is explicitly enabled.
    */
    state.soundcraftModuleLoading = true;
    setText("soundcraft-status", "Recorder module loading…");

    script = document.createElement("script");
    script.type = "module";
    script.src = "soundcraft.mjs";

    script.onload = function () {
      state.soundcraftModuleLoading = false;
      state.soundcraftModuleLoaded = true;
      if (state.soundcraftEnabled) {
        connectSelectedSoundcraft();
      }
    };

    script.onerror = function () {
      state.soundcraftModuleLoading = false;
      state.soundcraftModuleLoaded = false;
      setText("soundcraft-status", "Recorder module unavailable");
      byId("soundcraft-status").className = "soundcraft-status error";
      setSoundcraftButtonState(false, false, false, "Mixer Record");
    };

    document.getElementsByTagName("head")[0].appendChild(script);
  }

  function connectSelectedSoundcraft() {
    var mixer = findSoundcraftMixer(state.soundcraftActiveId);

    if (!state.soundcraftEnabled) {
      return;
    }

    if (!mixer) {
      setText("soundcraft-status", "No mixer");
      byId("soundcraft-status").className = "soundcraft-status";
      setSoundcraftButtonState(false, false, false, "No mixer");
      return;
    }

    if (!window.SoundcraftRecorderBridge) {
      setText("soundcraft-status", "Recorder module loading…");
      byId("soundcraft-status").className = "soundcraft-status";
      setSoundcraftButtonState(false, false, false, "Mixer Record");
      ensureSoundcraftModule();
      return;
    }

    setText("soundcraft-status", "Connecting…");
    byId("soundcraft-status").className = "soundcraft-status";
    window.SoundcraftRecorderBridge.connect(mixer.host);
  }

  function setSoundcraftButtonState(connected, recording, busy, label) {
    var btn = byId("soundcraft-record-btn");
    var labelEl = byId("soundcraft-record-label");

    btn.disabled = !connected || !!busy;
    btn.className = "tab recorder-tab";
    btn.className += connected ? " connected" : " disconnected";
    if (recording) { btn.className += " recording"; }
    if (busy) { btn.className += " busy"; }

    if (labelEl) {
      setText("soundcraft-record-label", recording ? "Stop Record" : "Mixer Record");
    }
  }


  window.OpenLPSoundcraftStatus = function (status) {
    var text = status && status.text ? status.text : "Disconnected";
    var cls = "soundcraft-status";

    if (status && status.recording) {
      cls += " recording";
    } else if (status && status.connected) {
      cls += " connected";
    } else if (status && status.error) {
      cls += " error";
    }

    setText("soundcraft-status", text);
    byId("soundcraft-status").className = cls;

    setSoundcraftButtonState(
      !!(status && status.connected),
      !!(status && status.recording),
      !!(status && status.busy),
      status && status.recording ? "Stop Rec" : "Record"
    );
  };

  window.OpenLPSoundcraftModuleReady = function () {
    if (state.soundcraftEnabled) {
      connectSelectedSoundcraft();
    }
  };

  function openSoundcraftEditor(mixer) {
    state.soundcraftEditingId = mixer ? mixer.id : "";
    byId("soundcraft-name-input").value = mixer ? mixer.name : "";
    byId("soundcraft-host-input").value = mixer ? mixer.host : "";
    byId("soundcraft-editor").hidden = false;
  }

  function closeSoundcraftEditor() {
    state.soundcraftEditingId = "";
    byId("soundcraft-editor").hidden = true;
  }

  function saveSoundcraftMixer() {
    var name = byId("soundcraft-name-input").value.replace(/^\s+|\s+$/g, "");
    var host = byId("soundcraft-host-input").value.replace(/^\s+|\s+$/g, "");
    var mixer = state.soundcraftEditingId ? findSoundcraftMixer(state.soundcraftEditingId) : null;

    host = host.replace(/^https?:\/\//i, "").replace(/\/.*$/, "");

    if (!name || !host) {
      return;
    }

    if (mixer) {
      mixer.name = name;
      mixer.host = host;
    } else {
      mixer = {id: makeSoundcraftId(), name: name, host: host};
      state.soundcraftMixers.push(mixer);
      state.soundcraftActiveId = mixer.id;
    }

    soundcraftStorageSave();
    closeSoundcraftEditor();
    renderSoundcraftSettings();
  }

  function removeSelectedSoundcraftMixer() {
    var i;
    if (!state.soundcraftActiveId) {
      return;
    }

    for (i = state.soundcraftMixers.length - 1; i >= 0; i -= 1) {
      if (state.soundcraftMixers[i].id === state.soundcraftActiveId) {
        state.soundcraftMixers.splice(i, 1);
      }
    }

    state.soundcraftActiveId = state.soundcraftMixers.length ? state.soundcraftMixers[0].id : "";
    soundcraftStorageSave();
    renderSoundcraftSettings();
  }

  function openSettings() {
    var overlay = byId("settings-overlay");
    var toggle = byId("auto-slides-toggle");
    if (toggle) {
      toggle.checked = !!state.openSlidesOnServiceSelect;
    }
    if (overlay) {
      overlay.className = "settings-overlay open";
    }
  }

  function closeSettings() {
    var overlay = byId("settings-overlay");
    if (overlay) {
      overlay.className = "settings-overlay";
    }
  }

  function saveAutoSlidesSetting() {
    var toggle = byId("auto-slides-toggle");
    state.openSlidesOnServiceSelect = !!(toggle && toggle.checked);
    try {
      if (window.localStorage) {
        window.localStorage.setItem(
          "openlp-v14-auto-slides",
          state.openSlidesOnServiceSelect ? "1" : "0"
        );
      }
    } catch (e) {
      /* Setting still applies for this session if storage is unavailable. */
    }
  }

  function bind() {
    var slidesScroller;
    try {
      var savedFont = parseInt(window.localStorage.getItem("openlp-list-font-size"), 10);
      if (!isNaN(savedFont) && savedFont >= 0 && savedFont <= 4) { state.listFontIndex = savedFont; }
    } catch (e) {}
    applyListFontSize(state.listFontIndex, false);
    soundcraftStorageLoad();
    slidesScroller = byId("slides-screen");

    if (slidesScroller) {
      slidesScroller.onscroll = noteManualSlideScroll;
      slidesScroller.ontouchstart = beginManualSlideBrowse;
      slidesScroller.onmousedown = beginManualSlideBrowse;
      slidesScroller.onwheel = beginManualSlideBrowse;
    }

    byId("settings-btn").onclick = openSettings;
    byId("settings-btn").ontouchstart = function (event) {
      if (event && event.preventDefault) { event.preventDefault(); }
      openSettings();
      return false;
    };
    byId("browser-refresh-btn").onclick = function () {
      window.location.reload();
    };
    byId("settings-done").onclick = closeSettings;
    byId("auto-slides-toggle").onchange = saveAutoSlidesSetting;
    byId("font-size-slider").oninput = function () { applyListFontSize(this.value, true); };
    byId("font-size-slider").onchange = function () { applyListFontSize(this.value, true); };

    byId("soundcraft-enable-toggle").onchange = function () {
      state.soundcraftEnabled = !!this.checked;
      soundcraftStorageSave();
      renderSoundcraftSettings();
    };

    byId("soundcraft-mixer-select").onchange = function () {
      state.soundcraftActiveId = this.value;
      soundcraftStorageSave();
      connectSelectedSoundcraft();
    };

    byId("soundcraft-add-btn").onclick = function () {
      openSoundcraftEditor(null);
    };

    byId("soundcraft-edit-btn").onclick = function () {
      openSoundcraftEditor(findSoundcraftMixer(state.soundcraftActiveId));
    };

    byId("soundcraft-remove-btn").onclick = removeSelectedSoundcraftMixer;
    byId("soundcraft-save-btn").onclick = saveSoundcraftMixer;
    byId("soundcraft-cancel-btn").onclick = closeSoundcraftEditor;

    byId("soundcraft-record-btn").onclick = function () {
      if (window.SoundcraftRecorderBridge) {
        window.SoundcraftRecorderBridge.toggleDesired();
      }
    };
    byId("settings-overlay").onclick = function (event) {
      if (event.target === byId("settings-overlay")) {
        closeSettings();
      }
    };

    byId("service-tab").onclick = function () { switchScreen("service"); };
    byId("slides-tab").onclick = function () { switchScreen("slides"); };

    byId("prev-item-top").onclick = prevService;
    byId("next-item-top").onclick = nextService;

    byId("black-btn").onclick = function () {
      guardCommand(function () {
        xhr("GET", "/api/display/hide", null, function () {
          window.setTimeout(pollOpenLP, 180);
        });
      });
    };

    byId("show-btn").onclick = function () {
      guardCommand(function () {
        xhr("GET", "/api/display/show", null, function () {
          window.setTimeout(pollOpenLP, 180);
        });
      });
    };
  }

  bind();
  refreshAll();
  window.setInterval(refreshAll, POLL_MS);
}());
