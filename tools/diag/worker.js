// Worker de diagnóstico: download + parse + índice de busca em memória.
// Sintaxe ES2019 (motor Chromium 76 da TV): sem ?. e sem ??.
function norm(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
function ms(t) { return Math.round(performance.now() - t); }

async function jsonTask(d) {
  var stats = {};
  var t0 = performance.now();
  var r = await fetch(d.url);
  var txt = await r.text();
  stats.downloadMs = ms(t0);
  stats.chars = txt.length;

  var t1 = performance.now();
  var arr = JSON.parse(txt);
  txt = null;
  stats.parseMs = ms(t1);
  stats.items = arr.length;

  var t2 = performance.now();
  var rows = new Array(arr.length);
  for (var i = 0; i < arr.length; i++) {
    var x = arr[i];
    rows[i] = [
      Number(x.stream_id || x.series_id) || 0,
      x.name || '',
      String(x.category_id || ''),
      x.stream_icon || x.cover || '',
      Number(x.added || x.last_modified) || 0,
      Number(x.rating_5based) || 0
    ];
  }
  arr = null;
  stats.mapMs = ms(t2);

  var t3 = performance.now();
  var keys = new Array(rows.length);
  for (var k = 0; k < rows.length; k++) keys[k] = norm(rows[k][1]);
  stats.indexMs = ms(t3);

  stats.search = {};
  ['matrix', 'homem aranha', 'velozes', 'a', 'zzzz'].forEach(function (q) {
    var t = performance.now();
    var n = 0;
    for (var i = 0; i < keys.length; i++) if (keys[i].indexOf(q) !== -1) n++;
    stats.search[q] = { ms: Number((performance.now() - t).toFixed(2)), hits: n };
  });

  if (d.idbTest) stats.idb = await idbChunkTest(rows);

  return { stats: stats, rows: d.returnRows ? rows : null, sentAt: Date.now() };
}

function idbReq(r) {
  return new Promise(function (resolve, reject) { r.onsuccess = function () { resolve(r.result); }; r.onerror = function () { reject(r.error); }; });
}
function txDone(tx) {
  return new Promise(function (resolve, reject) { tx.oncomplete = resolve; tx.onerror = function () { reject(tx.error); }; tx.onabort = function () { reject(tx.error); }; });
}
// Snapshot em blocos: poucos registros grandes em vez de 1 registro por item
async function idbChunkTest(rows) {
  var res = {};
  var open = indexedDB.open('snap_' + Date.now(), 1);
  open.onupgradeneeded = function () { open.result.createObjectStore('chunks'); };
  var db = await idbReq(open);
  var sizes = [2000, rows.length];
  for (var s = 0; s < sizes.length; s++) {
    var size = sizes[s];
    var label = size === rows.length ? 'tudo' : 'blocos' + size;
    var t = performance.now();
    var tx = db.transaction('chunks', 'readwrite');
    var st = tx.objectStore('chunks');
    var n = 0;
    for (var i = 0; i < rows.length; i += size) { st.put(rows.slice(i, i + size), label + ':' + n); n++; }
    await txDone(tx);
    var writeMs = Math.round(performance.now() - t);
    t = performance.now();
    var rtx = db.transaction('chunks');
    var all = await idbReq(rtx.objectStore('chunks').getAll(IDBKeyRange.bound(label + ':', label + ':￿')));
    var total = 0;
    for (var j = 0; j < all.length; j++) total += all[j].length;
    res[label] = { chunks: n, writeMs: writeMs, readMs: Math.round(performance.now() - t), items: total };
  }
  db.close();
  return res;
}

async function xmltvTask(d) {
  var stats = {};
  var t0 = performance.now();
  var r = await fetch(d.url);
  var txt = await r.text();
  stats.downloadMs = ms(t0);
  stats.chars = txt.length;

  var t1 = performance.now();
  var re = /<programme\b[^>]*?start_timestamp="(\d+)"[^>]*?stop_timestamp="(\d+)"[^>]*?channel="([^"]*)"[^>]*>\s*<title[^>]*>([^<]*)<\/title>/g;
  var m;
  var n = 0;
  var channels = {};
  while ((m = re.exec(txt)) !== null) {
    n++;
    channels[m[3]] = (channels[m[3]] || 0) + 1;
  }
  stats.parseMs = ms(t1);
  stats.programmes = n;
  stats.channels = Object.keys(channels).length;
  return { stats: stats, sentAt: Date.now() };
}

self.onmessage = function (e) {
  var d = e.data;
  var p = d.type === 'xmltv' ? xmltvTask(d) : jsonTask(d);
  p.then(function (res) {
    res.id = d.id;
    self.postMessage(res);
  }).catch(function (err) {
    self.postMessage({ id: d.id, stats: { error: String(err) }, sentAt: Date.now() });
  });
};
