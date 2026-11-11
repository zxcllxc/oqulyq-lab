import type { ClassTopic, TopicStat } from "./analytics";
import { TARGET } from "./analytics";
import { getDb, scopeWhere } from "./db";

/** Class × topic aggregates for the requested scope, read from the materialized view. */
export async function scopedClassTopics(params: URLSearchParams): Promise<ClassTopic[]> {
  const db = await getDb();
  const r = await db.query<{ class_id: number; school: string; district: string; cls: string; textbook: string; topic: string; quarter: number; baseline: string; mean: string; n: number }>(`
    SELECT cts.class_id, s.name AS school, d.name_ru AS district, c.letter AS cls, tb.title AS textbook, tp.name_ru AS topic,
           cts.quarter, cts.baseline, cts.mean, cts.n
    FROM class_topic_stats cts JOIN class c ON c.id = cts.class_id JOIN school s ON s.id = cts.school_id
    JOIN district d ON d.id = cts.district_id JOIN textbook tb ON tb.id = cts.textbook_id JOIN topic tp ON tp.id = cts.topic_id
    ${scopeWhere(params)} ORDER BY tp.ord`);
  return r.rows.map((x) => ({ key: String(x.class_id), district: x.district, school: x.school, cls: x.cls, textbook: x.textbook, topic: x.topic, quarter: x.quarter, baseline: Number(x.baseline), mean: Number(x.mean), n: Number(x.n) }));
}

export async function scopedTopicStats(params: URLSearchParams): Promise<TopicStat[]> {
  const db = await getDb();
  const r = await db.query<{ topic: string; mean: string; mastery: string; n: number; classes: number }>(`
    SELECT tp.name_ru AS topic, SUM(cts.mean * cts.n) / SUM(cts.n) AS mean, SUM(cts.mastery * cts.n) / SUM(cts.n) * 100 AS mastery,
           SUM(cts.n) AS n, COUNT(*) AS classes
    FROM class_topic_stats cts JOIN topic tp ON tp.id = cts.topic_id ${scopeWhere(params)}
    GROUP BY tp.name_ru, tp.ord ORDER BY tp.ord`);
  return r.rows.map((x) => { const mean = Math.round(Number(x.mean) * 10) / 10; return { topic: x.topic, mean, mastery: Math.round(Number(x.mastery) * 10) / 10, n: Number(x.n), classes: Number(x.classes), difficult: mean < TARGET - 5 }; });
}
