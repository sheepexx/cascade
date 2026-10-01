// The map viewer page's drop zone. A dropped or chosen map is parked in
// IndexedDB and the editor opens it on /?open=handoff. Keep the database,
// store and record shape in step with src/lib/fileHandoff.ts.
(function () {
  var MAP_FILE = /\.(osz|osu|sm|ssc|qua|mc|mcz)$/i;
  var zone = document.getElementById("drop-zone");
  var input = document.getElementById("drop-input");
  var note = document.getElementById("drop-note");
  if (!zone || !input || !note) return;

  function say(text) {
    note.textContent = text;
  }

  function park(files) {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open("cascade-handoff", 1);
      req.onupgradeneeded = function () {
        req.result.createObjectStore("files");
      };
      req.onerror = function () {
        reject(req.error);
      };
      req.onsuccess = function () {
        var db = req.result;
        var tx = db.transaction("files", "readwrite");
        tx.objectStore("files").put(
          {
            at: Date.now(),
            files: files.map(function (f) {
              return { name: f.name, type: f.type, blob: f };
            }),
          },
          "pending",
        );
        tx.oncomplete = function () {
          db.close();
          resolve();
        };
        tx.onerror = function () {
          db.close();
          reject(tx.error);
        };
      };
    });
  }

  function open(list) {
    var files = Array.prototype.filter.call(list || [], function (f) {
      return MAP_FILE.test(f.name);
    });
    if (!files.length) {
      say("That isn't a map file. Cascade opens .osz, .osu, .sm, .ssc, .qua, .mc and .mcz.");
      return;
    }
    say("Opening " + files[0].name + " in Cascade…");
    park(files)
      .then(function () {
        window.location.href = "/?open=handoff";
      })
      .catch(function () {
        say("Your browser didn't let this page pass the file on. Open Cascade and drop it onto the editor instead.");
      });
  }

  zone.addEventListener("click", function () {
    input.click();
  });
  zone.addEventListener("keydown", function (e) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      input.click();
    }
  });
  input.addEventListener("change", function () {
    open(input.files);
  });
  // The whole page takes the drop, not just the box.
  ["dragenter", "dragover"].forEach(function (type) {
    window.addEventListener(type, function (e) {
      e.preventDefault();
      zone.classList.add("over");
    });
  });
  window.addEventListener("dragleave", function (e) {
    if (!e.relatedTarget) zone.classList.remove("over");
  });
  window.addEventListener("drop", function (e) {
    e.preventDefault();
    zone.classList.remove("over");
    open(e.dataTransfer && e.dataTransfer.files);
  });
})();
