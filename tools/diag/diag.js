// Diagnóstico do motor web da TV. Sintaxe ES2019 (Chromium 76): sem ?. e sem ??.
(function () {
  var C = window.DIAG;
  var out = document.getElementById('log');
  var runId = Date.now();

  function send(obj) {
    obj.run = runId;
    try {
      // text/plain evita preflight CORS
      fetch(C.report, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(obj) }).catch(function () {});
    } catch (e) {}
  }
  function log(k, v) {
    out.textContent += k + ': ' + (typeof v === 'object' ? JSON.stringify(v) : v) + '\n';
    send({ k: k, v: v });
  }
  function api(action) {
    return C.host + '/player_api.php?username=' + encodeURIComponent(C.user) + '&password=' + encodeURIComponent(C.pass) + (action ? '&action=' + action : '');
  }
  function norm(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }

  // Monitor de travamento: maior intervalo entre frames durante cada fase
  var jank = { max: 0, last: 0 };
  function frame(t) {
    if (jank.last) jank.max = Math.max(jank.max, t - jank.last);
    jank.last = t;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  function jankReset() { jank.max = 0; }
  function jankRead() { return Math.round(jank.max); }

  var worker = new Worker('worker.js');
  var pending = {};
  var seq = 0;
  worker.onmessage = function (e) {
    var cb = pending[e.data.id];
    delete pending[e.data.id];
    e.data.transferMs = Date.now() - e.data.sentAt;
    cb(e.data);
  };
  function workerTask(msg) {
    return new Promise(function (resolve) {
      msg.id = ++seq;
      pending[msg.id] = resolve;
      worker.postMessage(msg);
    });
  }

  function sql(db, q, args) {
    return new Promise(function (resolve, reject) {
      db.transaction(function (tx) {
        tx.executeSql(q, args || [], function (_, rs) { resolve(rs); }, function (_, err) { reject(err); return true; });
      });
    });
  }
  function errMsg(e) { return e && e.message ? e.message : String(e); }

  async function webSqlBench(rows) {
    if (typeof window.openDatabase !== 'function') { log('websql', 'indisponível'); return; }
    var res = {};
    var db = window.openDatabase('diag_' + runId, '1.0', 'diag', 200 * 1024 * 1024);
    try { var v = await sql(db, 'SELECT sqlite_version() AS v'); res.sqliteVersion = v.rows.item(0).v; } catch (e) { res.sqliteVersion = 'erro: ' + errMsg(e); }
    await sql(db, 'CREATE TABLE movies (id INTEGER PRIMARY KEY, name TEXT, cat TEXT, icon TEXT, added INTEGER, rating REAL)');

    jankReset();
    var t = performance.now();
    await new Promise(function (resolve, reject) {
      db.transaction(function (tx) {
        for (var i = 0; i < rows.length; i++) tx.executeSql('INSERT OR REPLACE INTO movies VALUES (?,?,?,?,?,?)', rows[i]);
      }, reject, resolve);
    });
    res.insertMs = Math.round(performance.now() - t);
    res.insertJankMs = jankRead();

    t = performance.now();
    await sql(db, 'CREATE INDEX movies_cat_added ON movies (cat, added DESC, id DESC)');
    res.indexMs = Math.round(performance.now() - t);

    var cat = rows[0][2];
    t = performance.now();
    var page = await sql(db, 'SELECT id, name, icon FROM movies WHERE cat = ? ORDER BY added DESC, id DESC LIMIT 30', [cat]);
    res.firstPageMs = Math.round(performance.now() - t);
    var last = page.rows.item(page.rows.length - 1);
    var lastAdded = rows.filter(function (r) { return r[0] === last.id; })[0][4];
    t = performance.now();
    await sql(db, 'SELECT id, name, icon FROM movies WHERE cat = ? AND (added < ? OR (added = ? AND id < ?)) ORDER BY added DESC, id DESC LIMIT 30', [cat, lastAdded, lastAdded, last.id]);
    res.keysetPageMs = Math.round(performance.now() - t);

    // FTS: descobre qual módulo o WebSQL deixa criar
    var fts = null;
    var tries = ['fts5', 'fts4', 'fts3'];
    res.ftsErrors = {};
    for (var k = 0; k < tries.length; k++) {
      try { await sql(db, 'CREATE VIRTUAL TABLE movies_' + tries[k] + ' USING ' + tries[k] + '(name)'); fts = tries[k]; break; } catch (e) { res.ftsErrors[tries[k]] = errMsg(e); }
    }
    res.fts = fts || 'nenhum';
    if (fts) {
      jankReset();
      t = performance.now();
      await new Promise(function (resolve, reject) {
        db.transaction(function (tx) {
          for (var i = 0; i < rows.length; i++) tx.executeSql('INSERT INTO movies_' + fts + ' (rowid, name) VALUES (?, ?)', [rows[i][0], norm(rows[i][1])]);
        }, reject, resolve);
      });
      res.ftsInsertMs = Math.round(performance.now() - t);
      res.ftsInsertJankMs = jankRead();
      res.ftsSearch = {};
      var qs = ['matrix*', 'homem* aranha*', 'velozes*', 'a*'];
      for (var q = 0; q < qs.length; q++) {
        t = performance.now();
        var r = await sql(db, 'SELECT rowid FROM movies_' + fts + ' WHERE movies_' + fts + ' MATCH ? LIMIT 50', [qs[q]]);
        res.ftsSearch[qs[q]] = { ms: Math.round(performance.now() - t), hits: r.rows.length };
      }
    }
    t = performance.now();
    var like = await sql(db, "SELECT id FROM movies WHERE name LIKE ? LIMIT 50", ['%aranha%']);
    res.likeSearchMs = Math.round(performance.now() - t);
    res.likeHits = like.rows.length;
    log('websql', res);
  }

  function idbReq(r) {
    return new Promise(function (resolve, reject) { r.onsuccess = function () { resolve(r.result); }; r.onerror = function () { reject(r.error); }; });
  }
  async function idbBench(rows) {
    var res = {};
    var open = indexedDB.open('diag_' + runId, 1);
    open.onupgradeneeded = function () {
      var s = open.result.createObjectStore('movies', { keyPath: 'id' });
      s.createIndex('cat_added', ['cat', 'added']);
    };
    var db = await idbReq(open);
    jankReset();
    var t = performance.now();
    await new Promise(function (resolve, reject) {
      var tx = db.transaction('movies', 'readwrite');
      var s = tx.objectStore('movies');
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        s.put({ id: r[0], name: r[1], cat: r[2], icon: r[3], added: r[4], rating: r[5] });
      }
      tx.oncomplete = resolve;
      tx.onerror = function () { reject(tx.error); };
    });
    res.insertMs = Math.round(performance.now() - t);
    res.insertJankMs = jankRead();

    var cat = rows[0][2];
    t = performance.now();
    var items = await new Promise(function (resolve, reject) {
      var acc = [];
      var idx = db.transaction('movies').objectStore('movies').index('cat_added');
      var c = idx.openCursor(IDBKeyRange.bound([cat, 0], [cat, Infinity]), 'prev');
      c.onsuccess = function () {
        var cur = c.result;
        if (!cur || acc.length >= 30) return resolve(acc);
        acc.push(cur.value);
        cur.continue();
      };
      c.onerror = function () { reject(c.error); };
    });
    res.firstPageMs = Math.round(performance.now() - t);
    res.pageItems = items.length;
    log('indexeddb', res);
  }

  async function runOnly() {
    var vod = await workerTask({ type: 'json', url: api('get_vod_streams'), idbTest: true });
    log('worker_vod_idb', { stats: vod.stats, jankMs: jankRead() });
    log('done', true);
    document.getElementById('spin').style.display = 'none';
  }

  async function run() {
    if (C.only === 'idb') { jankReset(); return runOnly(); }
    log('ua', navigator.userAgent);
    log('features', {
      openDatabase: typeof window.openDatabase,
      WebAssembly: typeof WebAssembly,
      indexedDB: typeof indexedDB,
      Worker: typeof Worker,
      deviceMemory: navigator.deviceMemory || null,
      cores: navigator.hardwareConcurrency || null,
      screen: screen.width + 'x' + screen.height,
      viewport: innerWidth + 'x' + innerHeight,
      dpr: devicePixelRatio,
      origin: location.origin,
      flexGap: CSS.supports('gap', '1px'),
      aspectRatio: CSS.supports('aspect-ratio', '1/1'),
      intersectionObserver: typeof IntersectionObserver,
      abortController: typeof AbortController,
      tizen: typeof window.tizen,
      webapis: typeof window.webapis
    });

    try {
      var t = performance.now();
      var r = await fetch(api('get_live_categories'));
      var j = await r.json();
      log('fetch_provider', { ok: r.ok, status: r.status, items: j.length, ms: Math.round(performance.now() - t) });
    } catch (e) { log('fetch_provider', { error: errMsg(e) }); }

    try {
      await WebAssembly.instantiate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]));
      log('wasm', 'ok');
    } catch (e) { log('wasm', { error: errMsg(e) }); }

    jankReset();
    var live = await workerTask({ type: 'json', url: api('get_live_streams') });
    log('worker_live', { stats: live.stats, transferMs: live.transferMs, jankMs: jankRead() });

    jankReset();
    var series = await workerTask({ type: 'json', url: api('get_series') });
    log('worker_series', { stats: series.stats, transferMs: series.transferMs, jankMs: jankRead() });

    jankReset();
    var vod = await workerTask({ type: 'json', url: api('get_vod_streams'), returnRows: true });
    log('worker_vod', { stats: vod.stats, transferMs: vod.transferMs, jankMs: jankRead() });

    jankReset();
    var epg = await workerTask({ type: 'xmltv', url: C.host + '/xmltv.php?username=' + encodeURIComponent(C.user) + '&password=' + encodeURIComponent(C.pass) });
    log('worker_xmltv', { stats: epg.stats, transferMs: epg.transferMs, jankMs: jankRead() });

    if (vod.rows && vod.rows.length) {
      try { await webSqlBench(vod.rows); } catch (e) { log('websql', { error: errMsg(e) }); }
      try { await idbBench(vod.rows); } catch (e) { log('indexeddb', { error: errMsg(e) }); }
    }
    if (performance.memory) {
      log('memory', { usedMB: Math.round(performance.memory.usedJSHeapSize / 1048576), limitMB: Math.round(performance.memory.jsHeapSizeLimit / 1048576) });
    }
    log('done', true);
    document.getElementById('spin').style.display = 'none';
  }

  window.onerror = function (msg, src, line) { log('onerror', msg + ' @' + line); };
  run().catch(function (e) { log('fatal', errMsg(e)); });
})();
