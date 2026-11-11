// DEMO: synthetic dataset. Not real schools, students or publishers.
export type Row = {
  school: string;
  cls: string;
  textbook: string;
  topic: string;
  score: number; // 0..100, one student's result on a topic test
  baseline: number; // class result on last year's final test, 0..100
};

export type Topic = { name: string; kk: string; hours: number };

export const TOPICS: Topic[] = [
  { name: "Степень с натуральным показателем", kk: "Натурал көрсеткішті дәреже", hours: 8 },
  { name: "Одночлены", kk: "Бірмүшелер", hours: 6 },
  { name: "Многочлены", kk: "Көпмүшелер", hours: 10 },
  { name: "Формулы сокращённого умножения", kk: "Қысқаша көбейту формулалары", hours: 10 },
  { name: "Разложение на множители", kk: "Көбейткіштерге жіктеу", hours: 8 },
  { name: "Алгебраические дроби", kk: "Алгебралық бөлшектер", hours: 10 },
  { name: "Линейная функция", kk: "Сызықтық функция", hours: 8 },
  { name: "Линейные уравнения", kk: "Сызықтық теңдеулер", hours: 6 },
  { name: "Системы линейных уравнений", kk: "Сызықтық теңдеулер жүйесі", hours: 8 },
  { name: "Элементы статистики", kk: "Статистика элементтері", hours: 6 },
];

// Topic base difficulty (expected mean for an average class) and textbook-specific chapter effects.
const BASE = [74, 78, 68, 57, 55, 52, 61, 80, 64, 76];
const BOOK_EFFECT: Record<string, number[]> = {
  "Учебник А (демо)": [0, 0, 1, 0, 1, 0, -1, 0, 0, 1],
  "Учебник Б (демо)": [0, 1, 0, -9, -2, -1, 3, 0, 1, 0],
  "Учебник В (демо)": [1, 0, 0, 1, 0, 1, 0, 0, -7, 2],
};

const SCHOOLS: { name: string; book: keyof typeof BOOK_EFFECT; level: number }[] = [
  { name: "Школа-гимназия №1, Тараз", book: "Учебник В (демо)", level: 74 },
  { name: "Лицей №7, Тараз", book: "Учебник В (демо)", level: 78 },
  { name: "Школа №12, Тараз", book: "Учебник В (демо)", level: 70 },
  { name: "Школа №25, Тараз", book: "Учебник А (демо)", level: 63 },
  { name: "Школа №40, Тараз", book: "Учебник А (демо)", level: 60 },
  { name: "Школа №3, Шу", book: "Учебник А (демо)", level: 58 },
  { name: "Школа №9, Каратау", book: "Учебник А (демо)", level: 56 },
  { name: "Школа им. Абая, Кордай", book: "Учебник Б (демо)", level: 55 },
  { name: "Школа №2, Мерке", book: "Учебник Б (демо)", level: 52 },
  { name: "Школа №5, Жанатас", book: "Учебник Б (демо)", level: 50 },
  { name: "Сельская школа, Т. Рыскулов р-н", book: "Учебник Б (демо)", level: 48 },
  { name: "Школа №18, Тараз", book: "Учебник Б (демо)", level: 62 },
];

function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateDemo(): Row[] {
  const rnd = mulberry32(2026);
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd());
  const rows: Row[] = [];
  const letters = ["А", "Б", "В"];
  for (const s of SCHOOLS) {
    const nClasses = 2 + Math.floor(rnd() * 2);
    for (let c = 0; c < nClasses; c++) {
      const cls = `7${letters[c]}`;
      const baseline = Math.round(s.level + gauss() * 5);
      const size = 18 + Math.floor(rnd() * 12);
      const classNoise = TOPICS.map(() => gauss() * 3);
      for (let st = 0; st < size; st++) {
        const ability = gauss() * 9;
        TOPICS.forEach((t, i) => {
          const mean = BASE[i] + 0.7 * (baseline - 62) + BOOK_EFFECT[s.book][i] + classNoise[i];
          const score = Math.max(0, Math.min(100, Math.round(mean + ability + gauss() * 10)));
          rows.push({ school: s.name, cls, textbook: s.book, topic: t.name, score, baseline });
        });
      }
    }
  }
  return rows;
}
