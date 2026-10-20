(function () {
  var root = document.documentElement;
  root.classList.remove("no-js");

  var pathEl = document.querySelector("[data-path]");
  if (pathEl) {
    var path = location.pathname;
    try {
      path = decodeURIComponent(path);
    } catch (err) {
      /* keep it encoded */
    }
    if (path.length > 48) path = path.slice(0, 47) + "…";
    pathEl.textContent = path;
  }

  var canvas = document.querySelector("[data-playfield]");
  var ctx = canvas && canvas.getContext && canvas.getContext("2d");
  if (!ctx) return;
  var bestEl = document.querySelector("[data-best]");

  var KEYS = ["KeyD", "KeyF", "KeyJ", "KeyK"];
  var LABELS = ["D", "F", "J", "K"];
  var LANE_COLOURS = ["#e9e9f0", "#5bc0ff", "#e9e9f0", "#5bc0ff"];
  var WELL = "#09090d";
  var DISPLAY = 'Quicksand, ui-sans-serif, system-ui, sans-serif';
  var MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

  // osu!mania hit windows at OD 8, in ms either side of the note.
  var WINDOWS = [
    { within: 16, label: "MAX", colour: "#5bc0ff" },
    { within: 40, label: "300", colour: "#5bc0ff" },
    { within: 73, label: "200", colour: "#6fcf5f" },
    { within: 103, label: "100", colour: "#6fcf5f" },
    { within: 127, label: "50", colour: "#e6a23c" },
  ];
  var MISS_WINDOW = 164;
  var MISS = { label: "MISS", colour: "#ff6b6b" };
  var SCROLL_MS = 700;
  var MISSES_TO_END = 5;

  // The autoplay run: a 1/4 stream at 140 BPM that carries the combo from
  // 388 to 404, then a fumbled note after a short gap.
  var INTRO_COMBO = 388;
  var INTRO_LANES = [0, 2, 1, 3, 1, 2, 0, 3, 1, 2, 0, 3, 2, 1, 3, 0];
  var INTRO_GAP = 107;
  var FUMBLE_LANE = 1;

  var reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var coarse = matchMedia("(pointer: coarse)").matches;

  var width = 0;
  var height = 0;
  var laneW = 0;
  var hitY = 0;
  var noteH = 14;
  var speed = 1;

  var mode = "intro";
  var notes = [];
  var combo = 0;
  var comboAt = -1e9;
  var judgement = null;
  var judgedAt = -1e9;
  var breakValue = 0;
  var breakAt = -1e9;
  var brokenAt = 0;
  var missStreak = 0;
  var runs = 0;
  var lastRun = 0;
  var runBest = 0;
  var nextTime = 0;
  var lastLane = -1;
  var held = [false, false, false, false];
  var releasedAt = [-1e9, -1e9, -1e9, -1e9];
  var autoUntil = [-1e9, -1e9, -1e9, -1e9];
  var bursts = [];
  var pointers = {};
  var frame = 0;

  var best = 0;
  try {
    best = parseInt(localStorage.getItem("cascade-404-best") || "0", 10) || 0;
  } catch (err) {
    /* storage blocked */
  }
  showBest();

  function now() {
    return performance.now();
  }

  function showBest() {
    if (!bestEl || best <= 0) return;
    bestEl.textContent =
      best > 404 ? "Best combo: " + best + "x, better than autoplay." : "Best combo: " + best + "x";
    bestEl.hidden = false;
  }

  function saveBest() {
    try {
      localStorage.setItem("cascade-404-best", String(best));
    } catch (err) {
      /* storage blocked */
    }
  }

  // Hitsounds load on the first key press, since browsers keep audio locked
  // until then anyway.
  var audio = null;
  var hitBuffer = null;
  function initAudio() {
    if (audio) {
      if (audio.state === "suspended") audio.resume();
      return;
    }
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    try {
      audio = new Ctx();
    } catch (err) {
      return;
    }
    fetch("/hitsounds/normal-hitnormal.wav")
      .then(function (res) {
        return res.arrayBuffer();
      })
      .then(function (data) {
        return new Promise(function (resolve, reject) {
          audio.decodeAudioData(data, resolve, reject);
        });
      })
      .then(function (buffer) {
        hitBuffer = buffer;
      })
      .catch(function () {});
  }

  function playHit() {
    if (!audio || !hitBuffer) return;
    var source = audio.createBufferSource();
    var gain = audio.createGain();
    gain.gain.value = 0.3;
    source.buffer = hitBuffer;
    source.connect(gain);
    gain.connect(audio.destination);
    source.start();
  }

  function resize() {
    var rect = canvas.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    laneW = width / 4;
    noteH = Math.max(10, Math.round(laneW * 0.24));
    hitY = height - (coarse ? 48 : 72);
    speed = (hitY + noteH) / SCROLL_MS;
    wake();
  }

  function startIntro(t) {
    mode = "intro";
    combo = INTRO_COMBO;
    var start = t + 1000;
    notes = INTRO_LANES.map(function (lane, i) {
      return { time: start + i * INTRO_GAP, lane: lane };
    });
    notes.push({
      time: start + (INTRO_LANES.length + 1) * INTRO_GAP,
      lane: FUMBLE_LANE,
      fumble: true,
    });
  }

  function startRun(t) {
    mode = "play";
    notes = [];
    combo = 0;
    runBest = 0;
    missStreak = 0;
    nextTime = t + 900;
    lastLane = -1;
    judgement = null;
  }

  function endRun() {
    mode = "idle";
    runs += 1;
    lastRun = runBest;
    notes.forEach(function (n) {
      if (!n.judged) {
        n.judged = true;
        n.dead = true;
      }
    });
    combo = 0;
    saveBest();
  }

  function pickLane() {
    var lane = Math.floor(Math.random() * 4);
    if (lane === lastLane && Math.random() < 0.85) lane = (lane + 1 + Math.floor(Math.random() * 3)) % 4;
    return lane;
  }

  function schedule(t) {
    while (nextTime < t + SCROLL_MS + 400) {
      var beat = 60000 / Math.min(200, 140 + combo * 0.4);
      var lane = pickLane();
      notes.push({ time: nextTime, lane: lane });
      if (Math.random() < 0.16) {
        var other = (lane + 1 + Math.floor(Math.random() * 3)) % 4;
        notes.push({ time: nextTime, lane: other });
      }
      lastLane = lane;
      nextTime += beat * (Math.random() < 0.25 ? 1 : 0.5);
    }
  }

  function setJudgement(j, t) {
    judgement = j;
    judgedAt = t;
  }

  function hit(n, j, t) {
    n.judged = true;
    n.hit = true;
    combo += 1;
    comboAt = t;
    missStreak = 0;
    setJudgement(j, t);
    bursts.push({ lane: n.lane, at: t });
    if (mode === "play") {
      runBest = Math.max(runBest, combo);
      if (combo > best) {
        best = combo;
        showBest();
      }
    }
  }

  function miss(n, t) {
    n.judged = true;
    n.missed = true;
    if (combo > 0) {
      breakValue = combo;
      breakAt = t;
    }
    combo = 0;
    missStreak += 1;
    setJudgement(MISS, t);
  }

  function judge(lane, t) {
    for (var i = 0; i < notes.length; i++) {
      var n = notes[i];
      if (n.judged || n.lane !== lane) continue;
      if (n.time - t > MISS_WINDOW) return;
      var off = Math.abs(t - n.time);
      for (var w = 0; w < WINDOWS.length; w++) {
        if (off <= WINDOWS[w].within) {
          hit(n, WINDOWS[w], t);
          return;
        }
      }
      miss(n, t);
      return;
    }
  }

  function press(lane) {
    var t = now();
    if (held[lane]) return;
    held[lane] = true;
    initAudio();
    playHit();
    if (mode === "idle" || mode === "broken") startRun(t);
    else if (mode === "play") judge(lane, t);
    wake();
  }

  function release(lane) {
    if (!held[lane]) return;
    held[lane] = false;
    releasedAt[lane] = now();
    wake();
  }

  function autoPress(lane, t) {
    autoUntil[lane] = t + 70;
  }

  function update(t) {
    if (mode === "intro") {
      notes.forEach(function (n) {
        if (n.judged || t < n.time) return;
        if (!n.fumble) {
          hit(n, WINDOWS[0], t);
          autoPress(n.lane, t);
          return;
        }
        // Autoplay finally slips: right timing, wrong lane.
        if (!n.slipped) {
          n.slipped = true;
          autoPress((n.lane + 2) % 4, t);
        }
        if (t - n.time > MISS_WINDOW) {
          miss(n, t);
          mode = "broken";
          brokenAt = t;
        }
      });
    } else if (mode === "broken") {
      if (t - brokenAt > 1300) mode = "idle";
    } else if (mode === "play") {
      schedule(t);
      for (var i = 0; i < notes.length; i++) {
        var n = notes[i];
        if (!n.judged && t - n.time > MISS_WINDOW) miss(n, t);
      }
      if (missStreak >= MISSES_TO_END) endRun();
    }

    // A note can leave the bottom edge before its miss window closes, so only
    // drop notes that have already been judged.
    var gone = (height - hitY + noteH) / speed;
    notes = notes.filter(function (n) {
      return !n.hit && !(n.judged && t - n.time >= gone);
    });
    bursts = bursts.filter(function (b) {
      return t - b.at < 200;
    });
  }

  function light(lane, t) {
    if (held[lane] || t < autoUntil[lane]) return 1;
    var last = Math.max(releasedAt[lane], autoUntil[lane]);
    return Math.max(0, 1 - (t - last) / 140);
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function text(str, x, y, font, colour, alpha, scale) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    if (scale !== 1) ctx.scale(scale, scale);
    ctx.font = font;
    ctx.fillStyle = colour;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(str, 0, 0);
    ctx.restore();
  }

  function draw(t) {
    ctx.fillStyle = WELL;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = "rgba(255, 255, 255, 0.045)";
    for (var d = 1; d < 4; d++) ctx.fillRect(Math.round(d * laneW), 0, 1, height);

    var inset = Math.max(3, Math.round(laneW * 0.07));
    var lit = [0, 0, 0, 0];
    for (var lane = 0; lane < 4; lane++) {
      lit[lane] = light(lane, t);
      if (!lit[lane]) continue;
      var beam = ctx.createLinearGradient(0, hitY, 0, hitY - height * 0.55);
      beam.addColorStop(0, hexAlpha(LANE_COLOURS[lane], 0.16 * lit[lane]));
      beam.addColorStop(1, hexAlpha(LANE_COLOURS[lane], 0));
      ctx.fillStyle = beam;
      ctx.fillRect(lane * laneW, hitY - height * 0.55, laneW, height * 0.55);
    }

    notes.forEach(function (n) {
      var y = hitY - (n.time - t) * speed;
      if (y < -noteH || y > height + noteH) return;
      ctx.globalAlpha = n.missed || n.dead ? 0.28 : 1;
      ctx.fillStyle = LANE_COLOURS[n.lane];
      roundRect(n.lane * laneW + inset, y - noteH / 2, laneW - inset * 2, noteH, 3);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    // Notes fade in from the top edge instead of popping in.
    var fade = ctx.createLinearGradient(0, 0, 0, 48);
    fade.addColorStop(0, WELL);
    fade.addColorStop(1, "rgba(9, 9, 13, 0)");
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, width, 48);

    for (lane = 0; lane < 4; lane++) {
      var x = lane * laneW + inset;
      var w = laneW - inset * 2;
      roundRect(x, hitY - noteH / 2, w, noteH, 3);
      if (lit[lane]) {
        ctx.save();
        ctx.globalAlpha = 0.85 * lit[lane];
        ctx.shadowColor = LANE_COLOURS[lane];
        ctx.shadowBlur = 14;
        ctx.fillStyle = LANE_COLOURS[lane];
        ctx.fill();
        ctx.restore();
      }
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
      ctx.stroke();
      if (!coarse) {
        text(
          LABELS[lane],
          lane * laneW + laneW / 2,
          hitY + 34,
          "600 11px " + MONO,
          lit[lane] ? LANE_COLOURS[lane] : "#5e5d70",
          1,
          1,
        );
      }
    }

    bursts.forEach(function (b) {
      var k = (t - b.at) / 200;
      var grow = k * 10;
      ctx.save();
      ctx.globalAlpha = (1 - k) * 0.55;
      ctx.strokeStyle = LANE_COLOURS[b.lane];
      ctx.lineWidth = 2;
      roundRect(
        b.lane * laneW + inset - grow / 2,
        hitY - noteH / 2 - grow,
        laneW - inset * 2 + grow,
        noteH + grow * 2,
        4,
      );
      ctx.stroke();
      ctx.restore();
    });

    var comboY = height * 0.26;
    if (combo > 0 && mode !== "idle") {
      var bump = reduceMotion ? 1 : 1 + 0.14 * Math.max(0, 1 - (t - comboAt) / 120);
      text(String(combo), width / 2, comboY, "700 34px " + DISPLAY, "#f2f2f6", 1, bump);
    }

    var sinceBreak = t - breakAt;
    if (sinceBreak < 900 && !reduceMotion) {
      var k = sinceBreak / 900;
      text(
        String(breakValue),
        width / 2,
        comboY + k * k * 40,
        "700 34px " + DISPLAY,
        MISS.colour,
        1 - k,
        1 + k * 0.15,
      );
    }

    var sinceJudge = t - judgedAt;
    if (judgement && sinceJudge < 600) {
      var pop = reduceMotion ? 1 : 1 + 0.3 * Math.max(0, 1 - sinceJudge / 90);
      var alpha = sinceJudge < 400 ? 1 : 1 - (sinceJudge - 400) / 200;
      var drop = judgement === MISS && !reduceMotion ? (sinceJudge / 600) * 10 : 0;
      text(
        judgement.label,
        width / 2,
        hitY - height * 0.23 + drop,
        "700 22px " + DISPLAY,
        judgement.colour,
        alpha,
        pop,
      );
    }

    if (mode === "intro" || mode === "broken") {
      text("AUTOPLAY", width / 2, 22, "600 10px " + MONO, "#6b7180", 1, 1);
    }

    if (mode === "idle") overlay();
  }

  function overlay() {
    var cy = height * 0.42;
    var band = ctx.createLinearGradient(0, cy - 80, 0, cy + 80);
    band.addColorStop(0, "rgba(9, 9, 13, 0)");
    band.addColorStop(0.3, "rgba(9, 9, 13, 0.88)");
    band.addColorStop(0.7, "rgba(9, 9, 13, 0.88)");
    band.addColorStop(1, "rgba(9, 9, 13, 0)");
    ctx.fillStyle = band;
    ctx.fillRect(0, cy - 80, width, 160);

    var action = coarse ? "Tap a lane" : "Press D F J K";
    if (runs === 0 && reduceMotion) {
      text("autoplay broke at", width / 2, cy - 30, "600 12px " + DISPLAY, "#9aa0ad", 1, 1);
      text("404x", width / 2, cy + 2, "700 30px " + DISPLAY, MISS.colour, 1, 1);
      text(action + " to play", width / 2, cy + 34, "600 12px " + DISPLAY, "#9aa0ad", 1, 1);
    } else if (runs === 0) {
      text("Your turn", width / 2, cy - 10, "700 22px " + DISPLAY, "#f2f2f6", 1, 1);
      text(action + " to play", width / 2, cy + 20, "600 12px " + DISPLAY, "#9aa0ad", 1, 1);
    } else {
      var beat = lastRun > 404;
      text(beat ? "you beat autoplay" : "max combo", width / 2, cy - 30, "600 12px " + DISPLAY, "#9aa0ad", 1, 1);
      text(lastRun + "x", width / 2, cy + 2, "700 30px " + DISPLAY, beat ? "#6fcf5f" : "#f2f2f6", 1, 1);
      text(action + " to retry", width / 2, cy + 34, "600 12px " + DISPLAY, "#9aa0ad", 1, 1);
    }
  }

  function hexAlpha(hex, alpha) {
    var n = parseInt(hex.slice(1), 16);
    return "rgba(" + (n >> 16) + ", " + ((n >> 8) & 255) + ", " + (n & 255) + ", " + alpha + ")";
  }

  function busy(t) {
    if (mode !== "idle") return true;
    if (notes.length || bursts.length) return true;
    if (t - judgedAt < 600 || t - breakAt < 900) return true;
    for (var lane = 0; lane < 4; lane++) if (light(lane, t) > 0) return true;
    return false;
  }

  function tick() {
    frame = 0;
    var t = now();
    update(t);
    draw(t);
    if (busy(t)) wake();
  }

  function wake() {
    if (!frame) frame = requestAnimationFrame(tick);
  }

  window.addEventListener("keydown", function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var lane = KEYS.indexOf(e.code);
    if (lane < 0) return;
    e.preventDefault();
    if (!e.repeat) press(lane);
  });
  window.addEventListener("keyup", function (e) {
    var lane = KEYS.indexOf(e.code);
    if (lane >= 0) release(lane);
  });
  window.addEventListener("blur", function () {
    for (var lane = 0; lane < 4; lane++) release(lane);
  });

  canvas.addEventListener("pointerdown", function (e) {
    var rect = canvas.getBoundingClientRect();
    var lane = Math.min(3, Math.max(0, Math.floor(((e.clientX - rect.left) / rect.width) * 4)));
    pointers[e.pointerId] = lane;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch (err) {
      /* not capturable */
    }
    e.preventDefault();
    press(lane);
  });
  function lift(e) {
    if (!(e.pointerId in pointers)) return;
    release(pointers[e.pointerId]);
    delete pointers[e.pointerId];
  }
  canvas.addEventListener("pointerup", lift);
  canvas.addEventListener("pointercancel", lift);

  document.addEventListener("visibilitychange", function () {
    if (document.hidden && mode === "play") endRun();
  });

  if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas);
  else window.addEventListener("resize", resize);
  if (document.fonts && document.fonts.load) {
    document.fonts.load("700 20px Quicksand").then(wake, function () {});
  }

  resize();
  if (reduceMotion) mode = "idle";
  else startIntro(now());
  wake();
})();
