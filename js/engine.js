// Решка — чистая логика игры (без DOM). UMD: браузер (window.ENGINE) + Node (require).
(function (root, factory) {
  const TOP = (typeof module !== 'undefined' && module.exports)
    ? require('./topology') : root;
  const api = factory(TOP);
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.createEngine = api.createEngine;
    root.ENGINE = api.createEngine();
  }
})(typeof self !== 'undefined' ? self : this, function (TOP) {
  const {
    TRACK, ENTRY, HOME_LANE, TRACK_MAIN, maxProgressFor,
    SAFE, BM_BY_TRACK, EXPRESS_NEXT, EXPRESS_ACROSS,
  } = TOP;

  const expressMapFor = (die) =>
    die === 1 ? EXPRESS_NEXT : die === 3 ? EXPRESS_ACROSS : null;

  const SEATS    = 4;
  const PER_SEAT = 5;

  // Клетка по прогрессу: 0 = X (стоит на TRACK[ENTRY[seat]]), 1-56 = петля, 57-61 = дом
  function cellForProgress(seat, progress) {
    if (progress < 0) return null;
    if (progress <= TRACK_MAIN) return TRACK[(ENTRY[seat] + progress) % TRACK.length];
    const lane = HOME_LANE[seat];
    const laneIdx = progress - TRACK_MAIN - 1;
    return laneIdx < lane.length ? lane[laneIdx] : null;
  }

  function createEngine() {
    const E = {
      SEATS,
      PER_SEAT,
      // pieces[seat][i] = { where, progress, bm, captor }
      // where: 'prison' | 'track' | 'lane' | 'karzer'
      // progress=0 на track означает стоит на X-кружке
      pieces: [],
      karzer: [],  // очередь [{seat, i}]

      newGame() {
        this.pieces = [];
        this.karzer = [];
        for (let s = 0; s < SEATS; s++) {
          const row = [];
          for (let i = 0; i < PER_SEAT; i++)
            row.push({ where: 'prison', progress: 0, bm: false, captor: -1 });
          this.pieces.push(row);
        }
      },

      cellOf(seat, i) {
        const p = this.pieces[seat][i];
        if (p.where === 'prison' || p.where === 'karzer') return null;
        if (p.bm) {
          const b = BM_BY_TRACK[(ENTRY[seat] + p.progress) % TRACK.length];
          if (b) return [b.r, b.c];
        }
        return cellForProgress(seat, p.progress);
      },

      trackIndex(seat, i) {
        const p = this.pieces[seat][i];
        if (p.where !== 'track') return -1;
        return (ENTRY[seat] + p.progress) % TRACK.length;
      },

      occupantsAt(r, c, exceptSeat, exceptI) {
        const out = [];
        for (let s = 0; s < SEATS; s++)
          for (let i = 0; i < PER_SEAT; i++) {
            if (s === exceptSeat && i === exceptI) continue;
            const cell = this.cellOf(s, i);
            if (cell && cell[0] === r && cell[1] === c) out.push({ seat: s, i });
          }
        return out;
      },

      isSafeCell(r, c) { return SAFE.has(`${r},${c}`); },

      opponentAdjacentOnTrack(seat, trackIdx) {
        const L = TRACK.length;
        for (const ni of [(trackIdx + 1) % L, (trackIdx - 1 + L) % L]) {
          const [r, c] = TRACK[ni];
          if (this.occupantsAt(r, c, seat, -1).some((o) => o.seat !== seat)) return true;
        }
        return false;
      },

      ownProgressSet(seat, exceptI) {
        const s = new Set();
        const row = this.pieces[seat];
        for (let j = 0; j < PER_SEAT; j++) {
          if (j === exceptI) continue;
          const p = row[j];
          // progress=0 (X) блокирует выход следующей из тюрьмы
          if ((p.where === 'track' && !p.bm) || p.where === 'lane') s.add(p.progress);
        }
        return s;
      },

      // Список индексов фишек, которые могут ходить кубиком die
      legalForDie(seat, die, ctx) {
        ctx = ctx || {};
        const out = [];
        const row = this.pieces[seat];
        for (let i = 0; i < PER_SEAT; i++) {
          const p = row[i];
          if (p.where === 'prison') {
            if (p.captor >= 0) continue; // пленную сначала выкупить
            if (die === 6 && !this.ownProgressSet(seat, i).has(0)) out.push(i);
            continue;
          }
          const expressOk = !!expressMapFor(die) && this.onExpress(seat, i) >= 0;
          if (this.canMove(seat, i, die, ctx) || expressOk) out.push(i);
        }
        return out;
      },

      // Применить кубик к фишке i (выход или ход). Возвращает { captured, finished }.
      applyDie(seat, i, die) {
        const p = this.pieces[seat][i];
        const res = { captured: [], finished: false };
        if (p.where === 'prison') {
          p.where = 'track';
          p.progress = 0;
          p.bm = false;
        } else {
          const from = p.progress;
          p.progress += die;
          p.bm = false;
          res.captured = this.captureAlongPath(seat, i, from, p.progress);
        }
        p.where = p.progress <= TRACK_MAIN ? 'track' : 'lane';
        res.finished = p.where === 'lane';
        return res;
      },

      _capture(o, captorSeat, out) {
        const t = this.pieces[o.seat][o.i];
        t.where = 'prison'; t.progress = 0; t.bm = false; t.captor = captorSeat;
        out.push(o);
      },

      // Фишка на X (progress=0) защищена от срубания
      _standsOnX(o) {
        const t = this.pieces[o.seat][o.i];
        return t.where === 'track' && t.progress === 0;
      },

      captureAt(seat, i) {
        const captured = [];
        const p = this.pieces[seat][i];
        if (p.where !== 'track' || p.bm) return captured;
        const cell = this.cellOf(seat, i);
        if (cell && !this.isSafeCell(cell[0], cell[1])) {
          for (const o of this.occupantsAt(cell[0], cell[1], seat, i))
            if (o.seat !== seat && !this._standsOnX(o)) this._capture(o, seat, captured);
        }
        return captured;
      },

      captureAlongPath(seat, i, from, to) {
        const captured = [];
        for (let q = from + 1; q <= to; q++) {
          const cell = cellForProgress(seat, q);
          if (!cell || this.isSafeCell(cell[0], cell[1])) continue;
          for (const o of this.occupantsAt(cell[0], cell[1], seat, i))
            if (o.seat !== seat && !this._standsOnX(o)) this._capture(o, seat, captured);
        }
        return captured;
      },

      // ── Карцер ─────────────────────────────────────────────────────────────

      sendToKarzer(seat, i) {
        const p = this.pieces[seat][i];
        p.where = 'karzer'; p.progress = 0; p.bm = false; p.captor = -1;
        this.karzer.push({ seat, i });
      },

      karzerEligible(seat) {
        this.karzer = this.karzer.filter((k) => this.pieces[k.seat][k.i].where === 'karzer');
        return this.karzer.find((k) => k.seat === seat) || this.karzer[0] || null;
      },

      karzerOnDoubleOne(seat) {
        const k = this.karzerEligible(seat);
        if (!k) return null;
        this.karzer.splice(this.karzer.indexOf(k), 1);
        const own = k.seat === seat;
        const p = this.pieces[k.seat][k.i];
        p.where = 'prison'; p.progress = 0; p.bm = false;
        p.captor = own ? -1 : seat;
        return { kind: own ? 'home' : 'capture', seat: k.seat, i: k.i };
      },

      // ── captureChances — для правила карцера ───────────────────────────────

      moveWouldCapture(seat, i, die, ctx) {
        if (!this.canMove(seat, i, die, ctx)) return false;
        const p = this.pieces[seat][i];
        for (let q = p.progress + 1; q <= p.progress + die; q++) {
          const cell = cellForProgress(seat, q);
          if (!cell || this.isSafeCell(cell[0], cell[1])) continue;
          for (const o of this.occupantsAt(cell[0], cell[1], seat, i))
            if (o.seat !== seat && !this._standsOnX(o)) return true;
        }
        return false;
      },

      captureChances(seat, dice, used, ctx) {
        const out = [];
        const avail = dice.filter((_, k) => !(used && used[k]));
        for (let i = 0; i < PER_SEAT; i++) {
          const p = this.pieces[seat][i];
          if (p.where !== 'track' && p.where !== 'lane') continue;
          let can = false;
          for (const d of avail) {
            if (this.moveWouldCapture(seat, i, d, ctx)) { can = true; break; }
            const ti = this.expressTarget(seat, i, d);
            if (ti >= 0) {
              const [r, c] = TRACK[ti];
              if (!this.isSafeCell(r, c) &&
                  this.occupantsAt(r, c, seat, i).some((o) => o.seat !== seat && !this._standsOnX(o))) {
                can = true; break;
              }
            }
          }
          if (!can && dice.length >= 2 && !(used && (used[0] || used[1])))
            can = this.moveWouldCapture(seat, i, dice[0] + dice[1], ctx);
          if (can) out.push(i);
        }
        return out;
      },

      // ── Выкуп пленной фишки ────────────────────────────────────────────────

      canRedeem(seat, i) {
        const p = this.pieces[seat][i];
        return p.where === 'prison' && p.captor >= 0;
      },
      hasRedeemable(seat) {
        return this.pieces[seat].some((p) => p.where === 'prison' && p.captor >= 0);
      },
      redeem(seat, i) {
        const p = this.pieces[seat][i];
        const captor = p.captor;
        p.captor = -1;
        return captor;
      },

      // ── Экспресс ───────────────────────────────────────────────────────────

      onExpress(seat, i) {
        const p = this.pieces[seat][i];
        if (p.where !== 'track' || p.bm || p.progress === 0) return -1;
        const ti = (ENTRY[seat] + p.progress) % TRACK.length;
        return (EXPRESS_NEXT[ti] !== undefined) ? ti : -1;
      },

      expressJump(seat, i, die) {
        const p = this.pieces[seat][i];
        const ti = (ENTRY[seat] + p.progress) % TRACK.length;
        const map = expressMapFor(die) || EXPRESS_NEXT;
        const target = map[ti];
        p.progress = (target - ENTRY[seat] + TRACK.length) % TRACK.length;
        p.bm = false;
        return { captured: this.captureAt(seat, i) };
      },

      expressTarget(seat, i, die) {
        const map = expressMapFor(die);
        const ti = this.onExpress(seat, i);
        return (map && ti >= 0) ? map[ti] : -1;
      },

      // ── Ход ────────────────────────────────────────────────────────────────

      canMove(seat, i, die, ctx) {
        ctx = ctx || {};
        const p = this.pieces[seat][i];
        if (p.where !== 'track' && p.where !== 'lane') return false;
        const dest = p.progress + die;
        if (dest > maxProgressFor(seat)) return false;
        // Обязательная остановка перед домом
        if (p.progress < TRACK_MAIN && dest > TRACK_MAIN) return false;
        if (p.bm) {
          const ti = (ENTRY[seat] + p.progress) % TRACK.length;
          if (this.opponentAdjacentOnTrack(seat, ti) && !ctx.doubleOne) return false;
        }
        const own = this.ownProgressSet(seat, i);
        for (const q of own) if (q > p.progress && q <= dest) return false;
        return true;
      },

      canOfferBM(seat, i) {
        const p = this.pieces[seat][i];
        if (p.where !== 'track' || p.bm) return false;
        return !!BM_BY_TRACK[(ENTRY[seat] + p.progress) % TRACK.length];
      },

      divertToBM(seat, i) { this.pieces[seat][i].bm = true; },

      bmAfterMove(seat, i, die) {
        const p = this.pieces[seat][i];
        if (p.where !== 'track' && p.where !== 'lane') return null;
        const np = p.progress + die;
        if (np < 1 || np >= TRACK_MAIN) return null;
        return BM_BY_TRACK[(ENTRY[seat] + np) % TRACK.length] || null;
      },

      hasAnyMove(seat, dice, ctx) {
        return dice.some((d) => this.legalForDie(seat, d, ctx).length > 0);
      },

      winner() {
        for (let s = 0; s < SEATS; s++) {
          const max = maxProgressFor(s);
          if (this.pieces[s].every((p) => p.where === 'lane' && p.progress === max)) return s;
        }
        return -1;
      },

      // ── UI-метод: все допустимые ходы для фишки i ─────────────────────────
      // Возвращает move-объекты для рендера маркеров.
      // dice: [d1, d2], used: [bool, bool], ctx: { doubleOne }
      movesForPiece(seat, i, dice, used, ctx) {
        ctx = ctx || {};
        const p = this.pieces[seat][i];
        const moves = [];
        const bothFree = !used[0] && !used[1];

        for (let dIdx = 0; dIdx < dice.length; dIdx++) {
          if (used[dIdx]) continue;
          const dv = dice[dIdx];

          if (p.where === 'prison') {
            if (p.captor >= 0) {
              if (dv === 6) moves.push({ dieIdx: dIdx, dieVal: dv, kind: 'redeem' });
              continue;
            }
            if (dv === 6 && !this.ownProgressSet(seat, i).has(0))
              moves.push({ dieIdx: dIdx, dieVal: dv, kind: 'exit', destProg: 0 });
            continue;
          }

          if (p.where === 'karzer') continue;

          // Экспресс
          const exTi = this.expressTarget(seat, i, dv);
          if (exTi >= 0) {
            const exProg = (exTi - ENTRY[seat] + TRACK.length) % TRACK.length;
            if (!this.ownProgressSet(seat, i).has(exProg))
              moves.push({ dieIdx: dIdx, dieVal: dv, kind: 'express', destProg: exProg, expressTrackIdx: exTi });
          }

          // Обычный ход
          if (this.canMove(seat, i, dv, ctx)) {
            const newProg = p.progress + dv;
            moves.push({ dieIdx: dIdx, dieVal: dv, kind: 'move', destProg: newProg });
            const bm = newProg < TRACK_MAIN ? BM_BY_TRACK[(ENTRY[seat] + newProg) % TRACK.length] : null;
            if (bm) moves.push({ dieIdx: dIdx, dieVal: dv, kind: 'moveBM', destProg: newProg, bmData: bm });
          }
        }

        // Ход суммой двух кубиков
        if (bothFree && (p.where === 'track' || p.where === 'lane')) {
          const sum = dice[0] + dice[1];
          if (this.canMove(seat, i, sum, ctx)) {
            const newProg = p.progress + sum;
            moves.push({ dieIdx: -1, dieVal: sum, kind: 'sum', destProg: newProg });
            const bm = newProg < TRACK_MAIN ? BM_BY_TRACK[(ENTRY[seat] + newProg) % TRACK.length] : null;
            if (bm) moves.push({ dieIdx: -1, dieVal: sum, kind: 'moveBM', destProg: newProg, bmData: bm });
          }
        }

        return moves;
      },
    };

    E.newGame();
    return E;
  }

  return { createEngine };
});
