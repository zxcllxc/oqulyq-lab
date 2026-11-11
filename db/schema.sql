-- Oqulyq Lab schema (PostgreSQL 15+, runs unchanged in PGlite for the demo and in Neon for production).
-- Students are stored only as a salted hash (no names): see student.pseudo_id.

CREATE TABLE region   (id SERIAL PRIMARY KEY, name_ru TEXT NOT NULL, name_kk TEXT NOT NULL);
CREATE TABLE district (id SERIAL PRIMARY KEY, region_id INT NOT NULL REFERENCES region(id), name_ru TEXT NOT NULL, name_kk TEXT NOT NULL);
CREATE TABLE school   (id SERIAL PRIMARY KEY, district_id INT NOT NULL REFERENCES district(id), name TEXT NOT NULL, urban BOOLEAN NOT NULL DEFAULT true);
CREATE INDEX school_district_idx ON school(district_id);

CREATE TABLE subject  (id SERIAL PRIMARY KEY, name_ru TEXT NOT NULL, name_kk TEXT NOT NULL, grade SMALLINT NOT NULL,
                       annual_hours SMALLINT NOT NULL); -- fixed yearly volume the hours optimizer keeps
CREATE TABLE topic    (id SERIAL PRIMARY KEY, subject_id INT NOT NULL REFERENCES subject(id), ord SMALLINT NOT NULL,
                       name_ru TEXT NOT NULL, name_kk TEXT NOT NULL, planned_hours SMALLINT NOT NULL,
                       UNIQUE (subject_id, ord));

CREATE TABLE textbook (id SERIAL PRIMARY KEY, subject_id INT NOT NULL REFERENCES subject(id), title TEXT NOT NULL,
                       publisher TEXT, year SMALLINT);
-- which program topics the textbook covers and how many pages (coverage gaps = topics with no row)
CREATE TABLE textbook_chapter (textbook_id INT NOT NULL REFERENCES textbook(id), topic_id INT NOT NULL REFERENCES topic(id),
                       pages SMALLINT NOT NULL, exercises SMALLINT NOT NULL, PRIMARY KEY (textbook_id, topic_id));

CREATE TABLE class    (id SERIAL PRIMARY KEY, school_id INT NOT NULL REFERENCES school(id), grade SMALLINT NOT NULL,
                       letter TEXT NOT NULL, year SMALLINT NOT NULL, textbook_id INT REFERENCES textbook(id),
                       baseline NUMERIC(5,2)); -- last year's final result, used for the fair comparison
CREATE INDEX class_school_idx ON class(school_id);
CREATE INDEX class_textbook_idx ON class(textbook_id);

CREATE TABLE student  (id SERIAL PRIMARY KEY, class_id INT NOT NULL REFERENCES class(id), pseudo_id TEXT NOT NULL UNIQUE);

CREATE TABLE test     (id SERIAL PRIMARY KEY, topic_id INT NOT NULL REFERENCES topic(id), quarter SMALLINT NOT NULL CHECK (quarter BETWEEN 1 AND 4),
                       year SMALLINT NOT NULL, kind TEXT NOT NULL DEFAULT 'topic'); -- any topic test: СОР, diagnostic, mock exam
CREATE TABLE item     (id SERIAL PRIMARY KEY, test_id INT NOT NULL REFERENCES test(id), ord SMALLINT NOT NULL,
                       correct CHAR(1) NOT NULL, max_score SMALLINT NOT NULL DEFAULT 1);

CREATE TABLE result   (test_id INT NOT NULL REFERENCES test(id), student_id INT NOT NULL REFERENCES student(id),
                       score NUMERIC(5,2) NOT NULL CHECK (score BETWEEN 0 AND 100), PRIMARY KEY (test_id, student_id));
CREATE INDEX result_student_idx ON result(student_id);

CREATE TABLE response (item_id INT NOT NULL REFERENCES item(id), student_id INT NOT NULL REFERENCES student(id),
                       answer CHAR(1), points SMALLINT NOT NULL, PRIMARY KEY (item_id, student_id));

-- Roles: who sees which slice. scope_id points to region / district / school depending on role.
CREATE TABLE app_user (id SERIAL PRIMARY KEY, email TEXT UNIQUE NOT NULL,
                       role TEXT NOT NULL CHECK (role IN ('school_methodist','district_methodist','region_methodist','admin')),
                       scope_id INT);

-- Aggregate the dashboards read: one row per class × topic × quarter. Refreshed after each import.
CREATE MATERIALIZED VIEW class_topic_stats AS
SELECT c.id AS class_id, c.school_id, s.district_id, c.textbook_id, c.baseline, t.topic_id, t.quarter, t.year,
       AVG(r.score) AS mean, COUNT(*) AS n, AVG((r.score >= 60)::int) AS mastery
FROM result r JOIN student st ON st.id = r.student_id JOIN class c ON c.id = st.class_id
JOIN school s ON s.id = c.school_id JOIN test t ON t.id = r.test_id
GROUP BY c.id, c.school_id, s.district_id, c.textbook_id, c.baseline, t.topic_id, t.quarter, t.year;
CREATE INDEX cts_district_topic_idx ON class_topic_stats(district_id, topic_id, quarter);
CREATE INDEX cts_textbook_topic_idx ON class_topic_stats(textbook_id, topic_id);
