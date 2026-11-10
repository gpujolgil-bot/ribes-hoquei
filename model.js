/* Model de predicció: rating de Massey regularitzat + simulació Montecarlo.
   El fa servir la pàgina (classificacions) i un Web Worker (simulacions). */
(function (root) {
  "use strict";
  var LAM = 1.0;

  function table(n, res) {
    var t = [];
    for (var i = 0; i < n; i++) t.push({ pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, pts: 0 });
    for (var k = 0; k < res.length; k++) {
      var r = res[k], a = t[r[0]], b = t[r[1]], x = r[2], y = r[3];
      a.pj++; b.pj++; a.gf += x; a.gc += y; b.gf += y; b.gc += x;
      if (x > y) { a.pg++; b.pp++; a.pts += 3; }
      else if (x < y) { b.pg++; a.pp++; b.pts += 3; }
      else { a.pe++; b.pe++; a.pts++; b.pts++; }
    }
    return t;
  }

  // Ordre: punts, enfrontament directe (punts i gols entre els empatats), diferència de gols, gols a favor
  function rankOrder(n, res, t, tieRand) {
    var groups = {}, i;
    for (i = 0; i < n; i++) (groups[t[i].pts] = groups[t[i].pts] || []).push(i);
    var pts = Object.keys(groups).map(Number).sort(function (a, b) { return b - a; });
    var order = [];
    pts.forEach(function (p) {
      var g = groups[p];
      if (g.length > 1) {
        var inG = {}, h = {}, hg = {}, tb = {};
        g.forEach(function (i) { inG[i] = 1; h[i] = 0; hg[i] = 0; tb[i] = tieRand ? tieRand() : i / 1000; });
        for (var k = 0; k < res.length; k++) {
          var r = res[k];
          if (inG[r[0]] && inG[r[1]]) {
            hg[r[0]] += r[2] - r[3]; hg[r[1]] += r[3] - r[2];
            if (r[2] > r[3]) h[r[0]] += 3; else if (r[2] < r[3]) h[r[1]] += 3; else { h[r[0]]++; h[r[1]]++; }
          }
        }
        g.sort(function (a, b) {
          return (h[b] - h[a]) || (hg[b] - hg[a]) || ((t[b].gf - t[b].gc) - (t[a].gf - t[a].gc)) || (t[b].gf - t[a].gf) || (tb[a] - tb[b]);
        });
      }
      order.push.apply(order, g);
    });
    return order;
  }

  function inv(M) {
    var m = M.length, A = M.map(function (r, i) { var e = []; for (var j = 0; j < m; j++) e.push(i === j ? 1 : 0); return r.concat(e); });
    for (var c = 0; c < m; c++) {
      var p = c; for (var r = c + 1; r < m; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      var tmp = A[c]; A[c] = A[p]; A[p] = tmp;
      var d = A[c][c]; for (var j = 0; j < 2 * m; j++) A[c][j] /= d;
      for (r = 0; r < m; r++) if (r !== c) { var f = A[r][c]; if (f) for (j = 0; j < 2 * m; j++) A[r][j] -= f * A[c][j]; }
    }
    return A.map(function (r) { return r.slice(m); });
  }

  function chol(M) {
    var m = M.length, L = M.map(function () { var z = []; for (var i = 0; i < m; i++) z.push(0); return z; });
    for (var i = 0; i < m; i++) for (var j = 0; j <= i; j++) {
      var s = M[i][j]; for (var k = 0; k < j; k++) s -= L[i][k] * L[j][k];
      L[i][j] = i === j ? Math.sqrt(Math.max(s, 1e-12)) : s / L[j][j];
    }
    return L;
  }

  function fit(n, res) {
    var A = [], b = [], i, j;
    for (i = 0; i < n; i++) { A.push([]); b.push(0); for (j = 0; j < n; j++) A[i].push(i === j ? LAM : 0); }
    res.forEach(function (r) { var y = r[2] - r[3]; A[r[0]][r[0]]++; A[r[1]][r[1]]++; A[r[0]][r[1]]--; A[r[1]][r[0]]--; b[r[0]] += y; b[r[1]] -= y; });
    var Ai = inv(A);
    var beta = Ai.map(function (row) { var s = 0; for (var k = 0; k < n; k++) s += row[k] * b[k]; return s; });
    var mean = beta.reduce(function (s, v) { return s + v; }, 0) / n;
    beta = beta.map(function (v) { return v - mean; });
    var ss = 0;
    res.forEach(function (r) { var e = (r[2] - r[3]) - (beta[r[0]] - beta[r[1]]); ss += e * e; });
    var s2 = res.length ? ss / res.length : 4;
    return { beta: beta, L: chol(Ai.map(function (row) { return row.map(function (v) { return v * s2; }); })), sd: Math.sqrt(s2) };
  }

  function rng(seed) {
    var a = seed >>> 0, spare = null;
    function u() { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
    function g() {
      if (spare !== null) { var s = spare; spare = null; return s; }
      var x, y, r; do { x = u() * 2 - 1; y = u() * 2 - 1; r = x * x + y * y; } while (!r || r >= 1);
      var f = Math.sqrt(-2 * Math.log(r) / r); spare = y * f; return x * f;
    }
    return { u: u, g: g };
  }

  /* args: {n, us, played:[[i,j,x,y]], pending:[[i,j]], forced:[null|'H'|'D'|'A'], N, cap, top} */
  function simulate(args) {
    var n = args.n, played = args.played, pend = args.pending, N = args.N, cap = args.cap || 20;
    var forced = args.forced || [], us = args.us;
    var F = fit(n, played), beta = F.beta, L = F.L;
    var SIG = Math.max(1.0, 1.18 * F.sd), small = cap <= 4;
    var R = rng(20261110);
    var pos = [], ptsSum = [], i, m;
    for (i = 0; i < n; i++) { pos.push(new Array(n).fill(0)); ptsSum.push(0); }
    var mres = pend.map(function () { return [0, 0, 0]; });
    var ribPts = new Int16Array(N), ribPos = new Int8Array(N);
    var z = new Array(n), r = new Array(n);
    for (var t = 0; t < N; t++) {
      for (i = 0; i < n; i++) z[i] = R.g();
      for (i = 0; i < n; i++) { var s = beta[i]; for (var k = 0; k <= i; k++) s += L[i][k] * z[k]; r[i] = s; }
      var sim = played.slice();
      for (m = 0; m < pend.length; m++) {
        var hi = pend[m][0], ai = pend[m][1], fo = forced[m] || null, d, tries = 0, ok;
        do {
          d = Math.round(r[hi] - r[ai] + SIG * R.g()); d = Math.max(-cap, Math.min(cap, d)); tries++;
          ok = !fo || (fo === "H" && d > 0) || (fo === "D" && d === 0) || (fo === "A" && d < 0);
        } while (!ok && tries < 30);
        if (!ok) d = fo === "H" ? 1 : fo === "A" ? -1 : 0;
        var g1, g2;
        if (d === 0) { var kk = small ? 1 + Math.floor(R.u() * 3) : Math.floor(R.u() * 5); g1 = g2 = kk; mres[m][1]++; }
        else {
          var ad = Math.abs(d), l = small ? Math.floor(R.u() * (5 - ad)) : Math.floor(R.u() * 4), w = ad + l;
          if (d > 0) { g1 = w; g2 = l; mres[m][0]++; } else { g1 = l; g2 = w; mres[m][2]++; }
        }
        sim.push([hi, ai, g1, g2]);
      }
      var tb = table(n, sim), ord = rankOrder(n, sim, tb, R.u);
      for (var p = 0; p < n; p++) { pos[ord[p]][p]++; if (ord[p] === us) ribPos[t] = p + 1; }
      for (i = 0; i < n; i++) ptsSum[i] += tb[i].pts;
      ribPts[t] = tb[us].pts;
    }
    return {
      pos: pos.map(function (row) { return row.map(function (v) { return 100 * v / N; }); }),
      expPts: ptsSum.map(function (v) { return v / N; }),
      mres: mres.map(function (x) { return x.map(function (v) { return 100 * v / N; }); }),
      ribPts: Array.prototype.slice.call(ribPts), ribPos: Array.prototype.slice.call(ribPos), N: N, beta: beta
    };
  }

  var Model = { table: table, rankOrder: rankOrder, simulate: simulate };
  root.Model = Model;
  if (typeof document === "undefined" && typeof root.postMessage === "function") {
    root.onmessage = function (e) { root.postMessage({ id: e.data.id, out: simulate(e.data.args) }); };
  }
})(typeof self !== "undefined" ? self : this);
