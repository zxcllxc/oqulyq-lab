// DEMO: synthetic dataset. Not real schools, students or publishers.
export type Row = {
  district: string;
  school: string;
  cls: string;
  textbook: string;
  topic: string;
  quarter: number; // 1..4
  score: number; // 0..100, one student's result on a topic test
  baseline: number; // class result on last year's final test, 0..100
};

export type Response = { school: string; cls: string; student: number; item: number; answer: string; correct: boolean; total: number };

export type Topic = { name: string; kk: string; en: string; hours: number; quarter: number };

export const TOPICS: Topic[] = [
  { name: "Степень с натуральным показателем", kk: "Натурал көрсеткішті дәреже", en: "Powers with natural exponents", hours: 8, quarter: 1 },
  { name: "Одночлены", kk: "Бірмүшелер", en: "Monomials", hours: 6, quarter: 1 },
  { name: "Многочлены", kk: "Көпмүшелер", en: "Polynomials", hours: 10, quarter: 1 },
  { name: "Формулы сокращённого умножения", kk: "Қысқаша көбейту формулалары", en: "Special products", hours: 10, quarter: 2 },
  { name: "Разложение на множители", kk: "Көбейткіштерге жіктеу", en: "Factoring", hours: 8, quarter: 2 },
  { name: "Алгебраические дроби", kk: "Алгебралық бөлшектер", en: "Algebraic fractions", hours: 10, quarter: 3 },
  { name: "Линейная функция", kk: "Сызықтық функция", en: "Linear function", hours: 8, quarter: 3 },
  { name: "Линейные уравнения", kk: "Сызықтық теңдеулер", en: "Linear equations", hours: 6, quarter: 4 },
  { name: "Системы линейных уравнений", kk: "Сызықтық теңдеулер жүйесі", en: "Systems of linear equations", hours: 8, quarter: 4 },
  { name: "Элементы статистики", kk: "Статистика элементтері", en: "Elements of statistics", hours: 6, quarter: 4 },
];

export const BOOKS = ["Учебник А (демо)", "Учебник Б (демо)", "Учебник В (демо)"] as const;

// Which program topics each textbook covers (pages per chapter, 0 = gap). Demo assumption.
export const COVERAGE: Record<string, number[]> = {
  "Учебник А (демо)": [14, 10, 18, 16, 14, 18, 14, 10, 14, 8],
  "Учебник Б (демо)": [12, 10, 16, 8, 12, 16, 16, 10, 14, 0],
  "Учебник В (демо)": [14, 12, 18, 18, 14, 20, 14, 12, 6, 10],
};

// Topic base difficulty (expected mean for an average class) and textbook-specific chapter effects.
const BASE = [74, 78, 68, 57, 55, 52, 61, 80, 64, 76];
// DEMO TRUTH: effects injected into the generator; the honesty check compares the method against them
export const BOOK_EFFECT: Record<string, number[]> = {
  "Учебник А (демо)": [0, 0, 1, 0, 1, 0, -1, 0, 0, 1],
  "Учебник Б (демо)": [0, 1, 0, -9, -2, -1, 3, 0, 1, -3],
  "Учебник В (демо)": [1, 0, 0, 1, 0, 1, 0, 0, -10, 2],
};

export const DISTRICTS = [
  { name: "г. Тараз", kk: "Тараз қ.", level: 72, urban: true, schools: 18, books: [0.12, 0.08, 0.8] },
  { name: "Шуский район", kk: "Шу ауданы", level: 58, urban: false, schools: 12, books: [0.55, 0.35, 0.1] },
  { name: "Кордайский район", kk: "Қордай ауданы", level: 56, urban: false, schools: 12, books: [0.45, 0.45, 0.1] },
  { name: "Байзакский район", kk: "Бәйзақ ауданы", level: 50, urban: false, schools: 12, books: [0.25, 0.7, 0.05] },
];

// Item-level test for one topic (the Q3 "Алгебраические дроби" СОР): a = discrimination, b = difficulty.
export const ITEM_TOPIC = "Алгебраические дроби";
export const ITEMS = [
  { a: 1.2, b: -1.2, key: "A" }, { a: 1.0, b: -0.6, key: "C" }, { a: 1.4, b: -0.2, key: "B" },
  { a: 1.1, b: 0.1, key: "D" }, { a: 1.3, b: 0.4, key: "A" }, { a: 0.9, b: 0.7, key: "B" },
  { a: -0.3, b: 0.2, key: "C" }, // broken item: wrong key / ambiguous wording → negative discrimination
  { a: 1.2, b: 1.0, key: "D" }, { a: 0.2, b: 2.6, key: "A" }, // too hard and not discriminating
  { a: 1.0, b: -0.9, key: "B" },
];
const TRAP_ITEM = 4; // strong students pick distractor "C" on item 5 (index 4) — a misconception signal

function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateDemo(): { rows: Row[]; responses: Response[] } {
  const rnd = mulberry32(2026);
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd());
  const pick = (w: number[]) => { let x = rnd(), i = 0; while (i < w.length - 1 && (x -= w[i]) > 0) i++; return i; };
  const rows: Row[] = [];
  const responses: Response[] = [];
  const letters = ["А", "Б", "В"];
  let schoolNo = 1;
  for (const d of DISTRICTS) {
    for (let k = 0; k < d.schools; k++) {
      const level = d.level + gauss() * 6;
      // stronger schools lean towards textbook В inside the district (selection bias the fair comparison must remove)
      const w = d.books.map((p, i) => p * (i === 2 ? Math.exp((level - d.level) / 4) : 1));
      const sum = w.reduce((s, x) => s + x, 0);
      const book = BOOKS[pick(w.map((x) => x / sum))];
      const school = d.urban ? `Школа №${schoolNo}, Тараз` : `Школа №${schoolNo}, ${d.name.replace(" район", " р-н")}`;
      schoolNo++;
      const nClasses = 1 + Math.floor(rnd() * 3);
      for (let c = 0; c < nClasses; c++) {
        const cls = `7${letters[c]}`;
        const baseline = Math.round(Math.max(25, Math.min(95, level + gauss() * 5)));
        const size = 16 + Math.floor(rnd() * 14);
        const classNoise = TOPICS.map(() => gauss() * 3);
        // ~8% of classes slide in Q3–Q4 (teacher change, long sick leave) — the early-warning signal
        const slide = rnd() < 0.08 ? -9 : 0;
        for (let st = 0; st < size; st++) {
          const ability = gauss() * 9;
          TOPICS.forEach((t, i) => {
            const drift = t.quarter >= 3 ? slide : 0;
            const mean = BASE[i] + 0.7 * (baseline - 62) + BOOK_EFFECT[book][i] + classNoise[i] + drift;
            const score = Math.max(0, Math.min(100, Math.round(mean + ability + gauss() * 10)));
            rows.push({ district: d.name, school, cls, textbook: book, topic: t.name, quarter: t.quarter, score, baseline });
          });
          const theta = (0.7 * (baseline - 62) + ability) / 12;
          const answers = ITEMS.map((it, j) => {
            // misconception: confident mid/strong students pick the trap distractor before even weighing the key
            if (j === TRAP_ITEM && theta > -0.2 && rnd() < 0.45) return "C";
            const p = 1 / (1 + Math.exp(-1.7 * it.a * (theta - it.b)));
            if (rnd() < p) return it.key;
            const others = ["A", "B", "C", "D"].filter((x) => x !== it.key);
            return others[Math.floor(rnd() * 3)];
          });
          const total = answers.filter((a, j) => a === ITEMS[j].key).length;
          answers.forEach((answer, j) => responses.push({ school, cls, student: st, item: j, answer, correct: answer === ITEMS[j].key, total }));
        }
      }
    }
  }
  // DEMO: one class with a purely local problem on "Линейная функция" (teacher change), its textbook is fine elsewhere.
  // Added after generation so no random draw moves; the "where is the cause" card must blame the class, not the book.
  const local = rows.find((r) => r.school.startsWith("Школа №22,"));
  if (local) for (const r of rows) if (r.school === local.school && r.cls === local.cls && r.topic === TOPICS[6].name) r.score = Math.max(0, r.score - 16);
  return { rows, responses };
}

/**
 * DEMO: last year's school × topic means (separate seed, so this year's numbers do not move).
 * About a third of schools now on textbook В used Б last year — the "natural experiment" for difference-in-differences.
 */
export function generatePrevYear(rows: Row[]): { school: string; textbook: string; topic: string; mean: number }[] {
  const rnd = mulberry32(777);
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd());
  const schools = new Map<string, { book: string; base: number[] }>();
  for (const r of rows) {
    const s = schools.get(r.school) ?? { book: r.textbook, base: [] };
    s.base.push(r.baseline);
    schools.set(r.school, s);
  }
  const out: { school: string; textbook: string; topic: string; mean: number }[] = [];
  for (const [school, s] of schools) {
    const level = s.base.reduce((a, b) => a + b, 0) / s.base.length;
    const prevBook = s.book === "Учебник В (демо)" && rnd() < 0.4 ? "Учебник Б (демо)" : s.book;
    TOPICS.forEach((t, i) => {
      // same model as this year: base + level + chapter effect; −1 p.p. year shift, school noise
      const mean = BASE[i] + 0.7 * (level - 62) + BOOK_EFFECT[prevBook][i] - 1 + gauss() * 2.5;
      out.push({ school, textbook: prevBook, topic: t.name, mean: Math.round(mean * 10) / 10 });
    });
  }
  return out;
}
