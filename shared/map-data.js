export const MAP_GRID = [
  "###############################",
  "#..........c.......c..........#",
  "#.....c...............c.......#",
  "#.....c....P.........P..c.....#",
  "#..........................o..#",
  "#..BB...cc......P.....cc......#",
  "#..BB.......................BB#",
  "#....o.....###..###.....o.....#",
  "#..........#......#...........#",
  "#1.c...P...#......#...P...c..2#",
  "#1.c.......#......#.......c..2#",
  "#1.c...P...#......#...P...c..2#",
  "#..........#......#...........#",
  "#....o.....###..###.....o.....#",
  "#..BB.......................BB#",
  "#..BB...cc......P.....cc......#",
  "#..o..........................#",
  "#.....c....P.........P..c.....#",
  "#.....c...............c.......#",
  "#..........c.......c..........#",
  "###############################",
];

export const CELL_SIZE = 2;
export const CELL_HEIGHTS = Object.freeze({ "#": 4, P: 4, B: 2.2, o: 1.2, c: 1.1 });
export const GRID_H = MAP_GRID.length;
export const GRID_W = MAP_GRID[0].length;
export const WORLD_W = GRID_W * CELL_SIZE;
export const WORLD_H = GRID_H * CELL_SIZE;
export const MAP_AABB = Object.freeze({
  minX: -WORLD_W / 2,
  maxX: WORLD_W / 2,
  minY: 0,
  maxY: 8,
  minZ: -WORLD_H / 2,
  maxZ: WORLD_H / 2,
});

function collectCells(marker) {
  const cells = [];
  for (let r = 0; r < GRID_H; r += 1) {
    for (let c = 0; c < GRID_W; c += 1) {
      if (MAP_GRID[r][c] === marker) cells.push(Object.freeze({ r, c }));
    }
  }
  return Object.freeze(cells);
}

export const SPAWN_CELLS = Object.freeze({
  blue: collectCells("1"),
  red: collectCells("2"),
});
