const scope = [
  { name: "district", in: "query", required: false, schema: { type: "integer" }, description: "District id (see /districts)" },
  { name: "school", in: "query", required: false, schema: { type: "integer" }, description: "School id (see /schools)" },
];
export const openapi = {
  openapi: "3.1.0",
  info: { title: "Oqulyq Lab API", version: "1.0.0", description: "Read-only analytics for methodologists. Demo data is synthetic. All responses are JSON, cached for 1 hour." },
  servers: [{ url: "/api/v1" }],
  paths: {
    "/districts": { get: { summary: "Region → districts with school and class counts", responses: { "200": { description: "OK" } } } },
    "/schools": { get: { summary: "Schools, paginated", parameters: [{ name: "district", in: "query", schema: { type: "integer" } }, { name: "page", in: "query", schema: { type: "integer", minimum: 1 } }, { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } }], responses: { "200": { description: "{ page, limit, total, items[] }" } } } },
    "/topics": { get: { summary: "Topic difficulty: mean score and mastery share (≥60)", parameters: scope, responses: { "200": { description: "{ target, pass, topics[] }" } } } },
    "/textbooks": { get: { summary: "Fair textbook comparison: class residual vs expected from entry level, 95% CI", parameters: scope, responses: { "200": { description: "{ slope_b, overall[], by_topic[] }" } } } },
    "/hours": { get: { summary: "Hours reallocation within the fixed yearly volume, with a reason per topic", parameters: [...scope, { name: "lang", in: "query", schema: { type: "string", enum: ["ru", "kk", "en"] } }], responses: { "200": { description: "{ total_plan, total_recommended, topics[] }" } } } },
  },
};
