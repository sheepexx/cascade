(function () {
  var WORKER = "https://mania-editor.noahcraft01.workers.dev";
  var MANIFEST = WORKER + "/desktop/latest.json";

  var shell = document.querySelector(".shell");
  if (!shell) return;
  var lang = document.documentElement.lang || "en";
  var messages = [];

  function say(key) {
    var text = shell.getAttribute("data-notice-" + key);
    if (text && messages.indexOf(text) === -1) messages.push(text);
  }

  function flush() {
    var box = document.querySelector("[data-notice]");
    if (!box || !messages.length) return;
    box.textContent = messages.join(" ");
    box.hidden = false;
  }

  function formatSize(bytes) {
    var mb = bytes / (1024 * 1024);
    try {
      return new Intl.NumberFormat(lang, {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }).format(mb) + " MB";
    } catch (err) {
      return mb.toFixed(1) + " MB";
    }
  }

  function formatDate(iso) {
    var date = new Date(iso);
    if (isNaN(date.getTime())) return null;
    try {
      return date.toLocaleDateString(lang, {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch (err) {
      return date.toISOString().slice(0, 10);
    }
  }

  function detect() {
    var data = navigator.userAgentData;
    var hint = (data && data.platform) || "";
    var raw = hint || navigator.platform || navigator.userAgent || "";
    if (/android/i.test(navigator.userAgent || "")) return null;
    if (/win/i.test(raw)) return "windows";
    if (/mac|darwin|iphone|ipad|ipod/i.test(raw)) return "macos";
    if (/linux|x11|cros|bsd/i.test(raw)) return "linux";
    return null;
  }

  function platformsOf(manifest) {
    if (manifest.platforms) return manifest.platforms;
    return manifest.files ? { windows: manifest.files } : {};
  }

  function fill(manifest) {
    var groups = platformsOf(manifest);
    var base = WORKER + "/desktop/" + manifest.version + "/";
    var found = 0;

    Object.keys(groups).forEach(function (os) {
      var files = groups[os] || {};
      Object.keys(files).forEach(function (id) {
        var file = files[id];
        if (!file || !file.name) return;
        found += 1;

        var href = base + encodeURIComponent(file.name);
        var key = os + "." + id;
        var links = document.querySelectorAll('[data-asset="' + key + '"]');
        for (var i = 0; i < links.length; i++) links[i].href = href;

        var sizes = document.querySelectorAll('[data-size="' + key + '"]');
        for (var j = 0; j < sizes.length; j++) {
          if (typeof file.size !== "number") continue;
          sizes[j].textContent = formatSize(file.size);
          sizes[j].hidden = false;
        }
      });
    });

    if (!found) {
      say("empty");
      return;
    }

    var cards = document.querySelectorAll(".download [data-asset]");
    for (var k = 0; k < cards.length; k++) {
      if (cards[k].getAttribute("href") !== "#") continue;
      var card = cards[k].closest(".download");
      if (card) card.hidden = true;
    }

    var sections = document.querySelectorAll("[data-platform]");
    for (var s = 0; s < sections.length; s++) {
      if (!sections[s].querySelector(".download:not([hidden])")) sections[s].hidden = true;
    }

    var version = document.querySelector("[data-version]");
    if (version && manifest.version) version.textContent = "v" + manifest.version;

    var released = formatDate(manifest.publishedAt);
    var slot = document.querySelector("[data-date]");
    var template = shell.getAttribute("data-released");
    if (slot && released && template) {
      slot.textContent = template.replace("{date}", released);
      slot.hidden = false;
    }
  }

  function promote(os) {
    var section = document.querySelector('[data-platform="' + os + '"]');
    var list = document.querySelector("[data-platforms]");
    if (!section || !list) return;
    section.setAttribute("data-detected", "");
    list.insertBefore(section, list.firstChild);

    var primary = section.querySelector("[data-asset]");
    var cta = document.querySelector("[data-asset-primary]");
    if (primary && cta) {
      cta.setAttribute("data-asset", primary.getAttribute("data-asset"));
      if (primary.getAttribute("href") !== "#") cta.href = primary.getAttribute("href");
    }
  }

  var detected = detect();
  if (!detected) say("other");

  fetch(MANIFEST)
    .then(function (res) {
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(String(res.status));
      return res.json();
    })
    .then(function (manifest) {
      if (!manifest) {
        say("empty");
        return;
      }
      fill(manifest);
      if (detected) promote(detected);
    })
    .catch(function () {
      say("error");
    })
    .then(flush, flush);
})();
