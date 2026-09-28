// The six works of the album, in its order: Yaobian, from the kiln, and then Plates, in the day. The door's structured data, the rooms' heads, the
// sitemap and llms.txt are all made from this; the page itself sets the same names by hand.

export const NAME = 'Daykiln';
export const MARK = '照';

/** What a work comes from, as structured data has it. */
export type Source = { name: string; by?: string; date?: string; place?: string };

export type Work = {
  id: string; // the leaf's id, and its card's file name
  numeral: string;
  name: string;
  series: 'Plates' | 'Yaobian';
  path: string; // the room, with its trailing slash
  page: string; // the page the room is made from, a folder of this repository (Yaobian's three share one)
  credit: string; // as the colophon sets it
  source: Source;
  /** The room's description: the work and what it comes from, nothing of how it is made. The album's name follows it. */
  description: string;
};

export const WORKS: Work[] = [
  {
    id: 'kiln', numeral: '一', name: 'KILN', series: 'Yaobian', path: '/yaobian/kiln/', page: 'yaobian',
    credit: 'after the celadons of the Song',
    source: { name: 'Celadon wares of the Song dynasty' },
    description: 'KILN, Yaobian 一. After the celadons of the Song.',
  },
  {
    id: 'rule', numeral: '二', name: 'RULE', series: 'Yaobian', path: '/yaobian/rule/', page: 'yaobian',
    credit: 'the Hall of the Two Sisters, the Alhambra',
    source: { name: 'Hall of the Two Sisters', place: 'The Alhambra, Granada' },
    description: 'RULE, Yaobian 二. The Hall of the Two Sisters, in the Alhambra at Granada.',
  },
  {
    id: 'plumb', numeral: '三', name: 'PLUMB', series: 'Yaobian', path: '/yaobian/plumb/', page: 'yaobian',
    credit: 'Antoni Gaudí’s hanging model',
    source: { name: 'Hanging model for the church of the Colònia Güell', by: 'Antoni Gaudí', date: '1898' },
    description: 'PLUMB, Yaobian 三. Antoni Gaudí’s hanging model for the church of the Colònia Güell.',
  },
  {
    id: 'unfold', numeral: 'I', name: 'UNFOLD', series: 'Plates', path: '/plates/unfold/', page: 'plates/lab/unfold-lookdev',
    credit: 'Vincenzo Coronelli’s globe, 1688',
    source: { name: 'Terrestrial globe gores', by: 'Vincenzo Coronelli', date: '1688' },
    description: 'UNFOLD, Plates I. From the gores of Vincenzo Coronelli’s terrestrial globe, 1688.',
  },
  {
    id: 'wake', numeral: 'II', name: 'WAKE', series: 'Plates', path: '/plates/wake/', page: 'plates/lab/wake-still',
    credit: 'Étienne-Jules Marey’s gull, 1887',
    source: { name: 'Flight of a gull', by: 'Étienne-Jules Marey', date: '1887' },
    description: 'WAKE, Plates II. After Étienne-Jules Marey’s gull, 1887.',
  },
  {
    id: 'same-sky', numeral: 'III', name: 'SAME SKY', series: 'Plates', path: '/plates/same-sky/', page: 'plates/lab/same-sky-room',
    credit: 'after James Turrell’s Skyspaces',
    source: { name: 'Skyspaces', by: 'James Turrell' },
    description: 'SAME SKY, Plates III. After James Turrell’s Skyspaces.',
  },
];
