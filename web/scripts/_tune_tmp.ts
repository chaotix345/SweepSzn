import { quickScore } from "../lib/engine";
import { STRESS_PANEL } from "../lib/stressPanel";
import { COEFF, BY_ID, BY_PEAK, spreadSD } from "../test/engineData";
for (const g of JSON.parse(process.argv[2] ?? "[{}]")) {
  const c = { ...COEFF, ...g, frontcourt: { ...COEFF.frontcourt, ...(g.frontcourt ?? {}) } };
  const res = STRESS_PANEL.map((l) => `${l.key}=${quickScore(l.ids.map((id) => BY_ID.get(id)!), c).wins}${l.range ? `(${l.range.join("-")})` : ""}`);
  console.log(JSON.stringify(g), res.join(" "));
}
void BY_PEAK; void spreadSD;
