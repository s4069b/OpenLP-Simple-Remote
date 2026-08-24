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
    var t;
    if (!slide) { return ""; }
    t = slide.text || slide.title || slide.Title || "";
    return String(t).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
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

    state.programmaticScroll = true;

    if (gentle && typeof scroller.scrollTo === "function") {
      try {
        scroller.scrollTo({
          top: target,
          behavior: "smooth"
        });
      } catch (e) {
        scroller.scrollTop = target;
      }
    } else {
      scroller.scrollTop = target;
    }

    window.setTimeout(function () {
      state.programmaticScroll = false;
    }, gentle ? 500 : 80);
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
    slidesScroller = byId("slides-screen");

    if (slidesScroller) {
      slidesScroller.onscroll = noteManualSlideScroll;
      slidesScroller.ontouchstart = beginManualSlideBrowse;
      slidesScroller.onmousedown = beginManualSlideBrowse;
      slidesScroller.onwheel = beginManualSlideBrowse;
    }

    byId("settings-btn").onclick = openSettings;
    byId("browser-refresh-btn").onclick = function () {
      window.location.reload();
    };
    byId("settings-done").onclick = closeSettings;
    byId("auto-slides-toggle").onchange = saveAutoSlidesSetting;
    byId("font-size-slider").oninput = function () { applyListFontSize(this.value, true); };
    byId("font-size-slider").onchange = function () { applyListFontSize(this.value, true); };
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
