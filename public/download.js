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

  function fill(manifest) {
    var files = manifest.files || {};
    var found = 0;

    Object.keys(files).forEach(function (id) {
      var file = files[id];
      if (!file || !file.name) return;
      found += 1;

      var href = MANIFEST.replace(/latest\.json$/, "") + manifest.version + "/" + file.name;
      var links = document.querySelectorAll('[data-asset="' + id + '"]');
      for (var i = 0; i < links.length; i++) links[i].href = href;

      var size = document.querySelector('[data-size="' + id + '"]');
      if (size && typeof file.size === "number") {
        size.textContent = formatSize(file.size);
        size.hidden = false;
      }
    });

    if (!found) {
      say("empty");
      return;
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

  var platform =
    (navigator.userAgentData && navigator.userAgentData.platform) ||
    navigator.platform ||
    navigator.userAgent ||
    "";
  if (!/win/i.test(platform)) say("other");

  fetch(MANIFEST)
    .then(function (res) {
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(String(res.status));
      return res.json();
    })
    .then(function (manifest) {
      if (manifest) fill(manifest);
      else say("empty");
    })
    .catch(function () {
      say("error");
    })
    .then(flush, flush);
})();
