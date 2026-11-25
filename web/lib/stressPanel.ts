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
  // ---- holdout half: pre-registered 2026-11-25, ranges written blind (no engine output seen) ----
  {
    key: "all-wings", publicName: "All-wing two-way five", kind: "no-big", half: "holdout", range: [62, 69],
    label: "Nastiest perimeter defense imaginable, but Pippen at center gets bullied by real bigs.",
    ids: ["john_stockton_uta_1980s_1989", "michael_jordan_chi_1990s_1991", "scottie_pippen_chi_1990s_1995",
      "klay_thompson_gsw_2010s_2015", "kawhi_leonard_sas_2010s_2017"],
  },
  {
    key: "five-shooters", publicName: "Five shooters, no big", kind: "no-big", half: "holdout", range: [47, 54],
    label: "Best spacing ever, zero rim protection or rebounding: stuck in shootouts.",
    ids: ["steve_nash_pho_2000s_2007", "ray_allen_sea_2000s_2006", "reggie_miller_ind_1990s_1997",
      "kyle_korver_atl_2010s_2015", "stephen_curry_gsw_2020s_2021"],
  },
  {
    key: "no-creators-a", publicName: "Defensive walls, no closer", kind: "no-creator", half: "holdout", range: [39, 46],
    label: "Mutombo and Eaton wall off the paint; Kirilenko and Cooper give just enough offense.",
    ids: ["michael_cooper_lal_1980s_1984", "shane_battier_hou_2000s_2007", "andrei_kirilenko_uta_2000s_2004",
      "dikembe_mutombo_den_1990s_1994", "mark_eaton_uta_1980s_1985"],
  },
  {
    key: "no-creators-b", publicName: "3-and-D role players", kind: "no-creator", half: "holdout", range: [26, 33],
    label: "Useful role players with no star, ball-handler or shot creator: a lottery team.",
    ids: ["thabo_sefolosha_okc_2010s_2013", "danny_green_sas_2010s_2015", "jae_crowder_bos_2010s_2016",
      "kendrick_perkins_okc_2010s_2013", "tyson_chandler_dal_2010s_2015"],
  },
  {
    key: "heliocentric", publicName: "Five heliocentric MVPs", kind: "ball-hog", half: "holdout", range: [61, 68],
    label: "Size and firepower overwhelm, but one-ball redundancy keeps them out of the 70s.",
    ids: ["russell_westbrook_okc_2010s_2017", "james_harden_hou_2010s_2019", "luka_don_i_dal_2020s_2024",
      "joel_embiid_phi_2020s_2022", "giannis_antetokounmpo_mil_2020s_2022"],
  },
  {
    key: "eighties-wings", publicName: "80s iso scorers, no big", kind: "ball-hog", half: "holdout", range: [38, 45],
    label: "Tough-shot makers with no threes, no rim protection and little defense.",
    ids: ["dominique_wilkins_atl_1980s_1987", "bernard_king_nyk_1980s_1984", "adrian_dantley_uta_1980s_1981",
      "george_gervin_sas_1970s_1978", "alex_english_den_1980s_1983"],
  },
  {
    key: "rockets-towers", publicName: "Rockets towers", kind: "legends-poor-fit", half: "holdout", range: [48, 55],
    label: "Own the paint and glass, but four centers and no shooting in a phone booth.",
    ids: ["hakeem_olajuwon_hou_1990s_1993", "moses_malone_hou_1980s_1982", "ralph_sampson_hou_1980s_1984",
      "yao_ming_hou_2000s_2009", "calvin_murphy_hou_1970s_1974"],
  },
];
