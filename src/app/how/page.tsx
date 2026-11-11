import Link from "next/link";

export const metadata = { title: "Как мы считаем — Oqulyq Lab" };

const ink = "currentColor";

function Step({ n, title, kk, children, text }: { n: number; title: string; kk: string; children: React.ReactNode; text: string }) {
  return (
    <section className="grid gap-4 border-t border-ink py-8 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:gap-10">
      <div>
        <div className="font-mono text-sm text-accent">0{n}</div>
        <h2 className="font-display mt-1 text-2xl">{title}</h2>
        <p className="mt-1 text-sm text-muted">{kk}</p>
        <p className="mt-3 text-[15px] leading-relaxed">{text}</p>
      </div>
      <div className="rounded-md border border-line bg-card p-4">{children}</div>
    </section>
  );
}

export default function How() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-8">
      <Link href="/" className="text-sm text-accent underline underline-offset-2">← Oqulyq Lab</Link>
      <h1 className="font-display mt-4 text-4xl">Как мы считаем</h1>
      <p className="mt-2 max-w-2xl text-muted">Пять картинок вместо формул. Все числа считает код с тестами; ИИ только объясняет готовые цифры. Барлық сандарды код есептейді, ЖИ тек түсіндіреді.</p>

      <Step n={1} title="Сравниваем класс с ожиданием, а не со средним" kk="Сыныпты орташамен емес, күтілген нәтижемен салыстырамыз"
        text="Сильный класс и так покажет высокий балл. Поэтому для каждого класса считаем, сколько он должен был набрать при его уровне на входе (линия). Важно не сам балл, а насколько класс выше или ниже линии.">
        <svg viewBox="0 0 320 200" className="w-full" role="img" aria-label="Точки классов вокруг линии ожидания">
          <line x1="30" y1="180" x2="310" y2="180" stroke={ink} strokeWidth="1" />
          <line x1="30" y1="10" x2="30" y2="180" stroke={ink} strokeWidth="1" />
          <line x1="40" y1="160" x2="300" y2="40" stroke="#1f4e79" strokeWidth="2" />
          {[[70, 150, 1], [100, 120, 0], [130, 138, 1], [170, 100, 0], [200, 95, 1], [230, 62, 0], [260, 80, 1], [285, 40, 0]].map(([x, y, b], i) => (
            <circle key={i} cx={x} cy={y} r="5" fill={b ? "#b4442c" : "#2f6b4f"} />
          ))}
          <line x1="200" y1="95" x2="200" y2="91" stroke="#b4442c" strokeWidth="2" />
          <text x="34" y="22" fontSize="10" fill={ink}>балл класса</text>
          <text x="210" y="195" fontSize="10" fill={ink}>уровень на входе</text>
          <text x="230" y="35" fontSize="10" fill="#1f4e79">ожидание</text>
        </svg>
      </Step>

      <Step n={2} title="Интервал: не путаем шум с разницей" kk="Аралық: шуды айырмамен шатастырмаймыз"
        text="У каждого вывода есть 95% интервал. Если он задевает ноль или разница меньше 3 баллов — пишем «разница не доказана». Меньше 3 классов — «мало данных». Мы скорее скажем «не знаем», чем ошибёмся.">
        <svg viewBox="0 0 320 170" className="w-full" role="img" aria-label="Три интервала относительно нуля">
          <line x1="160" y1="10" x2="160" y2="160" stroke={ink} strokeDasharray="4 3" />
          <text x="164" y="20" fontSize="10" fill={ink}>0</text>
          {[[40, 120, 220, "учебник В: +0,7 — не доказано", ink], [80, 60, 120, "учебник Б, ФСУ: −6,2 — ниже", "#b4442c"], [120, 175, 270, "учебник В, ФСУ: +6,3 — выше", "#2f6b4f"]].map(([y, a, b, t, c]) => (
            <g key={String(y)}>
              <line x1={a as number} y1={y as number} x2={b as number} y2={y as number} stroke={c as string} strokeWidth="4" strokeLinecap="round" />
              <text x="10" y={(y as number) + 22} fontSize="10" fill={ink}>{t as string}</text>
            </g>
          ))}
        </svg>
      </Step>

      <Step n={3} title="Где причина: класс, школа, учебник или часы" kk="Себеп қайда: сынып, мектеп, оқулық не сағат"
        text="Разброс результатов раскладываем на части. Если проседает один класс — это не учебник. Учебник виноват, только если слабы многие его классы, и вывод держится, даже когда убираем двух самых слабых. Если тема проседает у всех учебников — не хватает часов.">
        <svg viewBox="0 0 320 150" className="w-full" role="img" aria-label="Доли разброса: учебник, школа, класс">
          {[["Формулы сокр. умн.", 64, 20, 16, 20], ["Алгебр. дроби", 7, 48, 45, 70], ["Одночлены", 3, 48, 49, 120]].map(([t, a, b, c, y]) => (
            <g key={String(t)}>
              <text x="0" y={(y as number) - 4} fontSize="10" fill={ink}>{t as string}</text>
              <rect x="0" y={y as number} width={(a as number) * 3} height="14" fill="#b4442c" />
              <rect x={(a as number) * 3} y={y as number} width={(b as number) * 3} height="14" fill="#1f4e79" />
              <rect x={((a as number) + (b as number)) * 3} y={y as number} width={(c as number) * 3} height="14" fill="#8a8577" />
            </g>
          ))}
          {[["учебник", "#b4442c", 0], ["школа", "#1f4e79", 80], ["класс", "#8a8577", 150]].map(([t, c, x]) => (
            <g key={String(t)}>
              <rect x={x as number} y="140" width="10" height="10" fill={c as string} />
              <text x={(x as number) + 14} y="149" fontSize="10" fill={ink}>{t as string}</text>
            </g>
          ))}
        </svg>
      </Step>

      <Step n={4} title="Часы: переносим, не добавляя нагрузку" kk="Сағат: жүктемені арттырмай ауыстырамыз"
        text="Годовой объём не меняется. Часы получают темы, где отстают все учебники, отдают темы, где цель уже достигнута. Прогноз «что если» строим по данным: как результат зависел от реальных часов в разных школах. Каждый следующий час даёт меньше.">
        <svg viewBox="0 0 320 150" className="w-full" role="img" aria-label="Часы до и после переноса">
          {[["Дроби", 13, 15], ["ФСУ", 13, 15], ["Одночлены", 8, 6], ["Статистика", 8, 6]].map(([t, a, b], i) => (
            <g key={String(t)}>
              <text x="0" y={22 + i * 32} fontSize="10" fill={ink}>{t as string}</text>
              <rect x="80" y={12 + i * 32} width={(a as number) * 10} height="8" fill="#8a8577" />
              <rect x="80" y={22 + i * 32} width={(b as number) * 10} height="8" fill={(b as number) > (a as number) ? "#2f6b4f" : "#b4442c"} />
              <text x={90 + (b as number) * 10} y={30 + i * 32} fontSize="10" fill={ink}>{a as number}→{b as number} ч</text>
            </g>
          ))}
          <text x="0" y="146" fontSize="10" fill={ink}>Итого: 102 → 102 ч</text>
        </svg>
      </Step>

      <Step n={5} title="Проверка честности" kk="Адалдықты тексеру"
        text="В демо-данные мы заранее заложили известные эффекты глав. Метод их не знает — и находит со средней ошибкой 0,6 балла; настоящее значение попадает в 95% интервал во всех 30 случаях. Кнопка «Показать заложенную правду» — во вкладке «Данные».">
        <svg viewBox="0 0 320 150" className="w-full" role="img" aria-label="Заложенное против найденного">
          <line x1="20" y1="130" x2="300" y2="10" stroke={ink} strokeDasharray="4 3" />
          {[[-10, -9.8], [-9, -8.6], [-6, -6.2], [-4, -3.5], [0, 0.3], [1, 0.7], [3, 3.3], [5, 4.7], [6, 6.3]].map(([tr, es], i) => (
            <circle key={i} cx={160 + tr * 12} cy={70 - es * 5.5} r="4" fill="#1f4e79" />
          ))}
          <text x="200" y="145" fontSize="10" fill={ink}>заложено →</text>
          <text x="4" y="14" fontSize="10" fill={ink}>найдено</text>
        </svg>
      </Step>
      <p className="border-t border-ink pt-6 text-sm text-muted">Подробные формулы: <a className="text-accent underline" href="https://github.com/zxcllxc/oqulyq-lab/blob/main/docs/method.md">docs/method.md</a> · открытый API: <a className="text-accent underline" href="/api">/api</a></p>
    </main>
  );
}
