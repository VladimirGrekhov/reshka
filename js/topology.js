// Решка — топология поля. UMD: браузер (глобальные имена) + Node (module.exports).
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof self !== 'undefined' ? self : this, function () {

  // Главная петля (56 клеток, против часовой стрелки)
  const TRACK = [
    [3,9],[4,9],[5,9],[6,9],[7,9],[8,9],[9,9],
    [9,8],[9,7],[9,6],[9,5],[9,4],[9,3],[10,3],
    [11,3],[11,4],[11,5],[11,6],[11,7],[11,8],[11,9],
    [12,9],[13,9],[14,9],[15,9],[16,9],[17,9],[17,10],
    [17,11],[16,11],[15,11],[14,11],[13,11],[12,11],[11,11],
    [11,12],[11,13],[11,14],[11,15],[11,16],[11,17],[10,17],
    [9,17],[9,16],[9,15],[9,14],[9,13],[9,12],[9,11],
    [8,11],[7,11],[6,11],[5,11],[4,11],[3,11],[3,10],
  ];
  const TRACK_KEY = TRACK.map(([r, c]) => `${r},${c}`);
  const trackIndexOf = (r, c) => TRACK_KEY.indexOf(`${r},${c}`);

  // ENTRY[seat] — трек-индекс X-клетки (progress=0 стоит здесь визуально).
  //   Красный (0): idx 55 → [3,10]
  //   Синий   (1): idx 41 → [10,17]
  //   Зелёный (2): idx 13 → [10,3]
  //   Жёлтый  (3): idx 27 → [17,10]
  const ENTRY = [55, 41, 13, 27];

  // Домашняя дорожка (I→V), 5 клеток к центру
  const HOME_LANE = [
    [[4,10],[5,10],[6,10],[7,10],[8,10]],         // 0 Красный  — верхний столбец
    [[10,16],[10,15],[10,14],[10,13],[10,12]],    // 1 Синий    — правая строка
    [[10,4],[10,5],[10,6],[10,7],[10,8]],          // 2 Зелёный  — левая строка
    [[16,10],[15,10],[14,10],[13,10],[12,10]],    // 3 Жёлтый   — нижний столбец
  ];

  const TRACK_MAIN = TRACK.length;           // 56
  const LANE_LEN   = HOME_LANE[0].length;    // 5
  const HOME_END   = [4, 4, 4, 4];          // lane-индекс клетки V (финиш)
  const maxProgressFor = (seat) => TRACK_MAIN + 1 + HOME_END[seat]; // 61

  // Кружки X — визуальные позиции (вне сетки трека, смещаются наружу при рендеринге)
  const X_GRID = [[2,9],[9,18],[11,2],[18,11]];

  // Безопасные клетки: X-кружки + карманы БМ (добавляются ниже)
  const SAFE = new Set(['2,9','9,18','11,2','18,11']);

  const BM_CELLS = [
    {r:8, c:6,  nx:0,  ny:-1}, {r:12, c:6,  nx:0,  ny:1},
    {r:8, c:14, nx:0,  ny:-1}, {r:12, c:14, nx:0,  ny:1},
    {r:6, c:8,  nx:-1, ny:0},  {r:6,  c:12, nx:1,  ny:0},
    {r:14,c:8,  nx:-1, ny:0},  {r:14, c:12, nx:1,  ny:0},
  ];
  const BM_BY_TRACK = {};
  BM_CELLS.forEach((b) => {
    [[b.r-1,b.c],[b.r+1,b.c],[b.r,b.c-1],[b.r,b.c+1]].forEach(([r, c]) => {
      const idx = trackIndexOf(r, c);
      if (idx >= 0) BM_BY_TRACK[idx] = b;
    });
    SAFE.add(`${b.r},${b.c}`);
  });

  // Экспресс-клетки
  const EXPRESS_IDX    = [6, 20, 34, 48];
  const EXPRESS_NEXT   = {6:20, 20:34, 34:48, 48:6};
  const EXPRESS_ACROSS = {6:34, 34:6, 20:48, 48:20};

  return {
    TRACK, TRACK_KEY, trackIndexOf,
    ENTRY, HOME_LANE, TRACK_MAIN, LANE_LEN, HOME_END, maxProgressFor,
    X_GRID, SAFE, BM_CELLS, BM_BY_TRACK,
    EXPRESS_IDX, EXPRESS_NEXT, EXPRESS_ACROSS,
  };
});
