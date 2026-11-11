import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

test("db/schema.sql applies on Postgres and the aggregate view works", async () => {
  const db = new PGlite();
  await db.exec(readFileSync("db/schema.sql", "utf8"));
  await db.exec(`
    INSERT INTO region(name_ru,name_kk) VALUES ('Жамбылская','Жамбыл');
    INSERT INTO district(region_id,name_ru,name_kk) VALUES (1,'Тараз','Тараз');
    INSERT INTO school(district_id,name) VALUES (1,'Школа 1');
    INSERT INTO subject(name_ru,name_kk,grade,annual_hours) VALUES ('Алгебра','Алгебра',7,80);
    INSERT INTO topic(subject_id,ord,name_ru,name_kk,planned_hours) VALUES (1,1,'Дроби','Бөлшектер',10);
    INSERT INTO textbook(subject_id,title) VALUES (1,'А (демо)');
    INSERT INTO class(school_id,grade,letter,year,textbook_id,baseline) VALUES (1,7,'А',2026,1,60);
    INSERT INTO student(class_id,pseudo_id) VALUES (1,'h1'),(1,'h2');
    INSERT INTO test(topic_id,quarter,year) VALUES (1,1,2026);
    INSERT INTO result VALUES (1,1,50),(1,2,70);
    REFRESH MATERIALIZED VIEW class_topic_stats;`);
  const r = await db.query<{ mean: string; n: number }>("SELECT mean, n FROM class_topic_stats");
  assert.equal(Number(r.rows[0].mean), 60);
  assert.equal(Number(r.rows[0].n), 2);
  await assert.rejects(db.exec("INSERT INTO result VALUES (1,1,150)")); // score out of range rejected by DB
});
