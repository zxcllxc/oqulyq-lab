import { test } from "node:test";
import assert from "node:assert/strict";
import { smartMap } from "../src/lib/smartImport";
import { parseImport } from "../src/lib/importer";

test("Russian headers, merged cells and names: mapped, filled down, anonymised", () => {
  const raw = [
    { "Школа": "Школа №1", "Класс": "7А", "Учебник": "А", "Тема": "Дроби", "ФИО ученика": "Иванов Иван", "Балл": 55, "Итог прошлого года": 60 },
    { "Школа": "", "Класс": "", "Учебник": "", "Тема": "Дроби", "ФИО ученика": "Петрова Анна", "Балл": 70, "Итог прошлого года": 60 },
  ];
  const r = smartMap(raw);
  assert.deepEqual(r.missing, []);
  assert.equal(r.filled, 3);
  assert.equal(r.anonymized, 2);
  assert.ok(!JSON.stringify(r.records).includes("Иванов"));
  assert.equal(r.records[1].school, "Школа №1");
  const { rows, quality } = parseImport(r.records);
  assert.equal(quality.ok, 2);
  assert.equal(rows[1].cls, "7А");
});

test("wide journal (topics as columns) is melted and marked uncertain", () => {
  const raw = [
    { "Мектеп": "№5", "Сынып": "7Б", "Оқулық": "Б", "Дәреже": 60, "Бірмүшелер": 75 },
    { "Мектеп": "№5", "Сынып": "7Б", "Оқулық": "Б", "Дәреже": 40, "Бірмүшелер": 80 },
  ];
  const r = smartMap(raw);
  assert.equal(r.wide, true);
  assert.equal(r.records.length, 4);
  assert.ok(r.mapping.filter((m) => m.field === "topicColumn").every((m) => !m.sure));
  assert.deepEqual(r.missing, []);
});

test("unknown layout reports the missing required fields", () => {
  const r = smartMap([{ foo: "x", bar: "y" }]);
  assert.ok(r.missing.includes("school") && r.missing.includes("score"));
});

test("fill-down does not leak class/textbook from the previous school; textbook stays within a school", () => {
  const raw = [
    { "Школа": "№1", "Класс": "7А", "Учебник": "А", "Тема": "Т", "Балл": 50 },
    { "Школа": "", "Класс": "7Б", "Учебник": "", "Тема": "Т", "Балл": 60 },
    { "Школа": "№2", "Класс": "", "Учебник": "", "Тема": "Т", "Балл": 70 },
  ];
  const r = smartMap(raw);
  assert.equal(r.records[1].textbook, "А"); // same school, new class keeps the school's textbook
  assert.equal(r.records[2].class, ""); // new school: previous class must not leak
  assert.equal(r.records[2].textbook, "");
});
