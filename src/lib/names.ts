// Display names for demo textbooks and schools in the chosen language. Data keeps the original (Russian) ids.
type Lang = "ru" | "kk" | "en";
const DIST: Record<string, [string, string]> = { "Шуский": ["Шу ауд.", "Shu dist."], "Кордайский": ["Қордай ауд.", "Korday dist."], "Байзакский": ["Бәйзақ ауд.", "Baizak dist."] };

export function displayName(s: string, lang: Lang): string {
  if (lang === "ru" || !s) return s;
  const kk = lang === "kk";
  return s
    .replace(/Учебник ([АБВ]) \(демо\)/g, (_, l) => (kk ? `${l} оқулығы (демо)` : `Textbook ${l} (demo)`))
    .replace(/Школа №(\d+), (Шуский|Кордайский|Байзакский) р-н/g, (_, n, d) => (kk ? `№${n} мектеп, ${DIST[d][0]}` : `School #${n}, ${DIST[d][1]}`))
    .replace(/Школа №(\d+), Тараз/g, (_, n) => (kk ? `№${n} мектеп, Тараз` : `School #${n}, Taraz`));
}
