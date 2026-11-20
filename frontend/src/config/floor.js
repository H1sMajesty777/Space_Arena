// План клуба из map.svg. Ряды мест идут сверху вниз и слева направо.
export const floors = [
  {
    name: '1 этаж',
    width: 720,
    minWidth: 625,
    corridors: 'M25 240H635 M279 215V240 M450 215V240 M510 240V349H380 M640 240V280',
    rooms: [
      { name: 'Bootcamp 2', box: [12, 12, 110, 212], rows: [[15], [13], [14], [12], [11]] },
      { name: 'Quad 1', box: [130, 12, 102, 212], rows: [[19], [18], [17], [16]] },
      { name: 'Space VIP 1', box: [240, 12, 116, 212], rows: [[25], [24], [23], [22], [21], [20]] },
      { name: 'Space VIP 2', box: [364, 12, 116, 212], rows: [[31], [30], [29], [28], [27], [26]] },
      { name: 'PS Open', box: [488, 12, 98, 212], rows: [[44], [43], [42]] },
      { name: 'Бар', box: [594, 12, 114, 84], landmark: true, icon: 'bar' },
      { name: 'Лаунж-зона', box: [594, 104, 114, 120], landmark: true, icon: 'lounge' },
      { name: 'Duo', box: [12, 258, 155, 62], rows: [[9, 10]] },
      { name: 'Trio', box: [12, 328, 155, 62], rows: [[6, 7, 8]] },
      {
        name: 'Bootcamp 1',
        box: [12, 398, 181, 92],
        rows: [
          [4, 5],
          [3, 2, 1],
        ],
      },
      { name: 'Space Room', box: [204, 366, 142, 124], rows: [[64]], zone: true },
      { name: 'Стойка администратора', box: [356, 366, 180, 71], landmark: true },
      { name: 'Вход', box: [356, 450, 180, 40], landmark: true, icon: 'entrance' },
      { name: 'PS VIP', box: [547, 283, 161, 207], rows: [[45], [46]] },
    ],
  },
  {
    name: '2 этаж',
    width: 520,
    minWidth: 427,
    corridors: 'M267 27V378H318 M267 116H318 M267 255H318',
    rooms: [
      {
        name: 'Open Space',
        box: [12, 12, 235, 478],
        rows: [
          [58, 59],
          [57, 60],
          [56, 61],
          [55, 62],
          [54, 63],
          [53, null],
          [52, null],
          [51, null],
          [50, null],
          [49, null],
          [48, null],
          [47, null],
        ],
      },
      {
        name: 'Bootcamp 3',
        box: [290, 12, 218, 100],
        rows: [
          [34, 35, 36],
          [33, 32],
        ],
      },
      { name: 'Quad 2', box: [322, 148, 186, 178], rows: [[37], [38], [39], [40]] },
      { name: 'Stream Room', box: [302, 409, 206, 81], rows: [[41]] },
    ],
  },
];

export const FLOOR_HEIGHT = 502;
export const tableAliases = {
  42: 'TV1',
  43: 'TV2',
  44: 'TV3',
  45: 'TV4',
  46: 'TV5',
  64: 'Space Room',
};

export const placeName = (number) => tableAliases[number] ?? `Стол ${number ?? '—'}`;

export const tableRooms = new Map(
  floors.flatMap((floor) =>
    floor.rooms.flatMap((room) =>
      (room.rows || [])
        .flat()
        .filter(Boolean)
        .map((number) => [number, room.name]),
    ),
  ),
);
