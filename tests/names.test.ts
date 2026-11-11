import { test } from "node:test";
import assert from "node:assert/strict";
import { displayName } from "../src/lib/names";

test("demo names are translated for display; Russian stays as is", () => {
  const s = "«Учебник Б (демо)»: Школа №34, Кордайский р-н и Школа №4, Тараз";
  assert.equal(displayName(s, "ru"), s);
  assert.equal(displayName(s, "kk"), "«Б оқулығы (демо)»: №34 мектеп, Қордай ауд. и №4 мектеп, Тараз");
  assert.equal(displayName(s, "en"), "«Textbook Б (demo)»: School #34, Korday dist. и School #4, Taraz");
});
