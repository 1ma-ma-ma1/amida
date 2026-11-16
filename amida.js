(function (root) {
  "use strict";
  const COUNT = 5;
  function randomInt(max) {
    // Rejection sampling avoids modulo bias.
    const limit = Math.floor(4294967296 / max) * max;
    const buffer = new Uint32Array(1);
    do { root.crypto.getRandomValues(buffer); } while (buffer[0] >= limit);
    return buffer[0] % max;
  }
  function createBoard() {
    const bridges = Array.from({ length: 12 }, (_, i) => ({ col: randomInt(COUNT - 1), y: 24 + i * 23 }));
    return { bridges, prizes: shuffleSlots(), icons: shuffleSlots() };
  }
  function shuffleSlots() {
    const prizes = [0, 1, 2, 3, 4];
    for (let i = prizes.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [prizes[i], prizes[j]] = [prizes[j], prizes[i]];
    }
    return prizes;
  }
  function route(start, bridges) {
    if (!Number.isInteger(start) || start < 0 || start >= COUNT) throw new RangeError("Invalid start");
    let column = start;
    const points = [[50 + column * 100, 0]];
    for (const bridge of bridges) {
      if (column === bridge.col || column === bridge.col + 1) {
        points.push([50 + column * 100, bridge.y]);
        column = column === bridge.col ? column + 1 : column - 1;
        points.push([50 + column * 100, bridge.y]);
      }
    }
    points.push([50 + column * 100, 300]);
    return { end: column, path: points.map((p, i) => `${i ? "L" : "M"}${p[0]},${p[1]}`).join(" ") };
  }
  root.Amida = Object.freeze({ createBoard, route });
})(globalThis);
