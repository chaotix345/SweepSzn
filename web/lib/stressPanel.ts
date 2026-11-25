// Engine v4 stress panel (DESIGN.md §14; spec docs/specs/2026-11-25-engine-accuracy-v4-design.md §6).
// Gimmick and poor-fit lineups whose records a smart fan should co-sign. Ranges are the owner's
// gut calls, written BEFORE any penalty was sized:
//   half "tune"    — the reasoned penalties may be sized against these.
//   half "holdout" — pre-registered; nothing is tuned on them, and their ranges never change after
//                    the pre-registration commit. A holdout miss means the model is wrong.
// Shown publicly on /how-it-works (publicName + live engine record); never includes the best five.
export type PanelKind = "balanced" | "no-big" | "no-creator" | "ball-hog" | "legends-poor-fit";

export interface PanelLineup {
  key: string;
  publicName: string;
  label: string;
  kind: PanelKind;
  half: "tune" | "holdout";
  range: [number, number] | null;
  ids: string[];
}

export const STRESS_PANEL: PanelLineup[] = [
  {
    key: "goat-balanced", publicName: "Balanced GOAT five", kind: "balanced", half: "tune", range: null,
    label: "Two-way all-time core; must beat every gimmick lineup.",
    ids: ["michael_jordan_chi_1980s_1988", "magic_johnson_lal_1980s_1990", "larry_bird_bos_1980s_1985",
      "tim_duncan_sas_2000s_2002", "hakeem_olajuwon_hou_1990s_1993"],
  },
  {
    key: "washington-legends", publicName: "Washington all-time five", kind: "legends-poor-fit", half: "tune", range: [45, 52],
    label: "Late-career stars, zero spacing, but Hayes and Moses keep it respectable.",
    ids: ["russell_westbrook_was_2020s_2021", "dave_bing_wsb_1970s_1976", "michael_jordan_was_2000s_2003",
      "elvin_hayes_wsb_1970s_1975", "moses_malone_wsb_1980s_1987"],
  },
  {
    key: "five-pgs", publicName: "Five elite point guards", kind: "no-big", half: "tune", range: [50, 57],
    label: "Nuclear offense, hammered at the rim and on the glass.",
    ids: ["stephen_curry_gsw_2010s_2016", "magic_johnson_lal_1980s_1990", "chris_paul_noh_2000s_2009",
      "steve_nash_pho_2000s_2007", "isiah_thomas_det_1980s_1985"],
  },
  {
    key: "five-stoppers", publicName: "Five non-scoring defenders", kind: "no-creator", half: "tune", range: [35, 42],
    label: "All-time defense, nobody to create a shot.",
    ids: ["bruce_bowen_sas_2000s_2006", "tony_allen_mem_2010s_2011", "p_j_tucker_pho_2010s_2014",
      "ben_wallace_det_2000s_2002", "dennis_rodman_det_1990s_1992"],
  },
  {
    key: "five-scorers", publicName: "Five ball-dominant scorers", kind: "ball-hog", half: "tune", range: [58, 64],
    label: "One-ball hero ball caps them well below a balanced five.",
    ids: ["allen_iverson_phi_2000s_2001", "kobe_bryant_lal_2000s_2006", "kevin_durant_okc_2010s_2014",
      "carmelo_anthony_nyk_2010s_2014", "wilt_chamberlain_sfw_1960s_1963"],
  },
];
