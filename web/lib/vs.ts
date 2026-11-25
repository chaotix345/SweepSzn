// Curated famous-debate matchups for the /vs/<slug> pages. Pure data (no data-file reads), so
// llms.txt and the sitemap can list them without tracing public/data. Each side is a real team's
// starting five, drafted as SweepSzn cards in slot order PG, SG, SF, PF, C. A card is that player's
// season with that franchise in that decade, so its year can differ from the matchup season.
// `record` is the real regular-season record (test/vs.test.ts checks it against team_lookup.json).

export interface VsSide {
  team: string;      // card franchise abbreviation (team colors)
  teamName: string;  // full team name as in team_lookup.json
  year: number;      // season end year (1996 = 1995-96)
  record: string;    // real regular-season W-L
  ids: string[];     // 5 card ids, slot order PG, SG, SF, PF, C
}

export interface VsMatchup {
  slug: string;
  blurb: string;
  a: VsSide;
  b: VsSide;
}

export const seasonLabel = (year: number) => `${year - 1}-${String(year).slice(2)}`;
const nick = (teamName: string) => teamName.split(" ").pop()!;
// "1995-96 Bulls"
export const sideLabel = (s: VsSide) => `${seasonLabel(s.year)} ${nick(s.teamName)}`;
// "'96 Bulls"
export const sideShort = (s: VsSide) => `'${String(s.year).slice(2)} ${nick(s.teamName)}`;
export const matchupTitle = (m: VsMatchup) => `${sideLabel(m.a)} vs ${sideLabel(m.b)}`;
export const matchupShort = (m: VsMatchup) => `${sideShort(m.a)} vs ${sideShort(m.b)}`;
export const vsPath = (slug: string) => `/vs/${slug}`;

const BULLS_96: VsSide = {
  team: "CHI", teamName: "Chicago Bulls", year: 1996, record: "72-10",
  ids: ["ron_harper_chi_1990s_1998", "michael_jordan_chi_1990s_1991", "scottie_pippen_chi_1990s_1995", "dennis_rodman_chi_1990s_1998", "luc_longley_chi_1990s_1998"],
};
const WARRIORS_16: VsSide = {
  team: "GSW", teamName: "Golden State Warriors", year: 2016, record: "73-9",
  ids: ["stephen_curry_gsw_2010s_2016", "klay_thompson_gsw_2010s_2015", "harrison_barnes_gsw_2010s_2015", "draymond_green_gsw_2010s_2016", "andrew_bogut_gsw_2010s_2014"],
};
const WARRIORS_19: VsSide = {
  team: "GSW", teamName: "Golden State Warriors", year: 2019, record: "57-25",
  ids: ["stephen_curry_gsw_2010s_2016", "klay_thompson_gsw_2010s_2015", "kevin_durant_gsw_2010s_2017", "draymond_green_gsw_2010s_2016", "demarcus_cousins_gsw_2010s_2019"],
};
const LAKERS_87: VsSide = {
  team: "LAL", teamName: "Los Angeles Lakers", year: 1987, record: "65-17",
  ids: ["magic_johnson_lal_1980s_1990", "byron_scott_lal_1980s_1988", "james_worthy_lal_1980s_1990", "a_c_green_lal_1980s_1989", "kareem_abdul_jabbar_lal_1980s_1981"],
};
const CELTICS_86: VsSide = {
  team: "BOS", teamName: "Boston Celtics", year: 1986, record: "67-15",
  ids: ["dennis_johnson_bos_1980s_1985", "danny_ainge_bos_1980s_1988", "larry_bird_bos_1980s_1985", "kevin_mchale_bos_1980s_1987", "robert_parish_bos_1980s_1981"],
};
const SIXERS_83: VsSide = {
  team: "PHI", teamName: "Philadelphia 76ers", year: 1983, record: "65-17",
  ids: ["maurice_cheeks_phi_1980s_1986", "andrew_toney_phi_1980s_1983", "julius_erving_phi_1980s_1981", "bobby_jones_phi_1980s_1981", "moses_malone_phi_1980s_1983"],
};
const PISTONS_89: VsSide = {
  team: "DET", teamName: "Detroit Pistons", year: 1989, record: "63-19",
  ids: ["isiah_thomas_det_1980s_1985", "joe_dumars_det_1980s_1990", "mark_aguirre_det_1980s_1990", "rick_mahorn_det_1980s_1988", "bill_laimbeer_det_1980s_1990"],
};
const BULLS_91: VsSide = {
  team: "CHI", teamName: "Chicago Bulls", year: 1991, record: "61-21",
  ids: ["john_paxson_chi_1990s_1991", "michael_jordan_chi_1990s_1991", "scottie_pippen_chi_1990s_1995", "horace_grant_chi_1990s_1992", "bill_cartwright_chi_1990s_1991"],
};
const ROCKETS_95: VsSide = {
  team: "HOU", teamName: "Houston Rockets", year: 1995, record: "47-35",
  ids: ["kenny_smith_hou_1990s_1991", "clyde_drexler_hou_1990s_1997", "mario_elie_hou_1990s_1997", "robert_horry_hou_1990s_1996", "hakeem_olajuwon_hou_1990s_1993"],
};
const MAGIC_95: VsSide = {
  team: "ORL", teamName: "Orlando Magic", year: 1995, record: "57-25",
  ids: ["anfernee_hardaway_orl_1990s_1996", "nick_anderson_orl_1990s_1995", "dennis_scott_orl_1990s_1996", "horace_grant_orl_1990s_1997", "shaquille_o_neal_orl_1990s_1994"],
};
const LAKERS_01: VsSide = {
  team: "LAL", teamName: "Los Angeles Lakers", year: 2001, record: "56-26",
  ids: ["derek_fisher_lal_2000s_2002", "kobe_bryant_lal_2000s_2006", "rick_fox_lal_2000s_2001", "horace_grant_lal_2000s_2001", "shaquille_o_neal_lal_2000s_2001"],
};
const SIXERS_01: VsSide = {
  team: "PHI", teamName: "Philadelphia 76ers", year: 2001, record: "56-26",
  ids: ["eric_snow_phi_2000s_2003", "allen_iverson_phi_2000s_2001", "george_lynch_phi_2000s_2001", "tyrone_hill_phi_2000s_2001", "dikembe_mutombo_phi_2000s_2002"],
};
const PISTONS_FIVE = ["chauncey_billups_det_2000s_2008", "richard_hamilton_det_2000s_2008", "tayshaun_prince_det_2000s_2005", "rasheed_wallace_det_2000s_2006", "ben_wallace_det_2000s_2002"];
const PISTONS_04: VsSide = { team: "DET", teamName: "Detroit Pistons", year: 2004, record: "54-28", ids: PISTONS_FIVE };
const PISTONS_05: VsSide = { team: "DET", teamName: "Detroit Pistons", year: 2005, record: "54-28", ids: PISTONS_FIVE };
const LAKERS_04: VsSide = {
  team: "LAL", teamName: "Los Angeles Lakers", year: 2004, record: "56-26",
  ids: ["gary_payton_lal_2000s_2004", "kobe_bryant_lal_2000s_2006", "devean_george_lal_2000s_2002", "karl_malone_lal_2000s_2004", "shaquille_o_neal_lal_2000s_2001"],
};
const SPURS_05: VsSide = {
  team: "SAS", teamName: "San Antonio Spurs", year: 2005, record: "59-23",
  ids: ["tony_parker_sas_2000s_2009", "manu_gin_bili_sas_2000s_2008", "bruce_bowen_sas_2000s_2006", "tim_duncan_sas_2000s_2002", "rasho_nesterovi_sas_2000s_2004"],
};
const CELTICS_08: VsSide = {
  team: "BOS", teamName: "Boston Celtics", year: 2008, record: "66-16",
  ids: ["rajon_rondo_bos_2000s_2010", "ray_allen_bos_2000s_2009", "paul_pierce_bos_2000s_2002", "kevin_garnett_bos_2000s_2008", "kendrick_perkins_bos_2000s_2008"],
};
const LAKERS_09: VsSide = {
  team: "LAL", teamName: "Los Angeles Lakers", year: 2009, record: "65-17",
  ids: ["derek_fisher_lal_2000s_2002", "kobe_bryant_lal_2000s_2006", "trevor_ariza_lal_2000s_2009", "pau_gasol_lal_2000s_2009", "andrew_bynum_lal_2000s_2010"],
};
const HEAT_13: VsSide = {
  team: "MIA", teamName: "Miami Heat", year: 2013, record: "66-16",
  ids: ["mario_chalmers_mia_2010s_2013", "dwyane_wade_mia_2010s_2011", "lebron_james_mia_2010s_2013", "udonis_haslem_mia_2010s_2012", "chris_bosh_mia_2010s_2016"],
};
const SPURS_14: VsSide = {
  team: "SAS", teamName: "San Antonio Spurs", year: 2014, record: "62-20",
  ids: ["tony_parker_sas_2010s_2013", "danny_green_sas_2010s_2015", "kawhi_leonard_sas_2010s_2017", "tim_duncan_sas_2010s_2015", "tiago_splitter_sas_2010s_2013"],
};
const CAVS_16: VsSide = {
  team: "CLE", teamName: "Cleveland Cavaliers", year: 2016, record: "57-25",
  ids: ["kyrie_irving_cle_2010s_2015", "j_r_smith_cle_2010s_2015", "lebron_james_cle_2010s_2018", "kevin_love_cle_2010s_2016", "tristan_thompson_cle_2010s_2016"],
};
const RAPTORS_19: VsSide = {
  team: "TOR", teamName: "Toronto Raptors", year: 2019, record: "58-24",
  ids: ["kyle_lowry_tor_2010s_2016", "danny_green_tor_2010s_2019", "kawhi_leonard_tor_2010s_2019", "pascal_siakam_tor_2010s_2019", "marc_gasol_tor_2010s_2020"],
};
const NUGGETS_23: VsSide = {
  team: "DEN", teamName: "Denver Nuggets", year: 2023, record: "53-29",
  ids: ["jamal_murray_den_2020s_2024", "kentavious_caldwell_pope_den_2020s_2023", "michael_porter_jr_den_2020s_2021", "aaron_gordon_den_2020s_2023", "nikola_joki_den_2020s_2024"],
};
const CELTICS_24: VsSide = {
  team: "BOS", teamName: "Boston Celtics", year: 2024, record: "64-18",
  ids: ["jrue_holiday_bos_2020s_2024", "derrick_white_bos_2020s_2025", "jaylen_brown_bos_2020s_2021", "jayson_tatum_bos_2020s_2023", "kristaps_porzi_is_bos_2020s_2024"],
};
const CELTICS_65: VsSide = {
  team: "BOS", teamName: "Boston Celtics", year: 1965, record: "62-18",
  ids: ["k_c_jones_bos_1960s_1965", "sam_jones_bos_1960s_1965", "tom_heinsohn_bos_1960s_1961", "tom_sanders_bos_1960s_1966", "bill_russell_bos_1960s_1963"],
};
const SIXERS_67: VsSide = {
  team: "PHI", teamName: "Philadelphia 76ers", year: 1967, record: "68-13",
  ids: ["hal_greer_phi_1960s_1968", "wali_jones_phi_1960s_1967", "chet_walker_phi_1960s_1967", "luke_jackson_phi_1960s_1969", "wilt_chamberlain_phi_1960s_1968"],
};
const BUCKS_71: VsSide = {
  team: "MIL", teamName: "Milwaukee Bucks", year: 1971, record: "66-16",
  ids: ["oscar_robertson_mil_1970s_1971", "jon_mcglocklin_mil_1970s_1975", "bob_dandridge_mil_1970s_1976", "greg_smith_mil_1970s_1972", "kareem_abdul_jabbar_mil_1970s_1974"],
};
const LAKERS_72: VsSide = {
  team: "LAL", teamName: "Los Angeles Lakers", year: 1972, record: "69-13",
  ids: ["gail_goodrich_lal_1970s_1972", "jerry_west_lal_1970s_1971", "jim_mcmillian_lal_1970s_1972", "happy_hairston_lal_1970s_1974", "wilt_chamberlain_lal_1970s_1971"],
};

export const VS_MATCHUPS: VsMatchup[] = [
  { slug: "bulls-1996-vs-warriors-2016", a: BULLS_96, b: WARRIORS_16,
    blurb: "The two best regular seasons in NBA history: Jordan's 72-10 Bulls against Curry's 73-9 Warriors." },
  { slug: "bulls-1996-vs-warriors-2019", a: BULLS_96, b: WARRIORS_19,
    blurb: "Jordan's 72-10 Bulls against the Warriors with Curry, Thompson, Durant, Green and Cousins in one starting five." },
  { slug: "bulls-1996-vs-lakers-1987", a: BULLS_96, b: LAKERS_87,
    blurb: "Jordan's 72-win Bulls against Magic's Showtime Lakers, the 65-17 champions of 1987." },
  { slug: "celtics-1986-vs-lakers-1987", a: CELTICS_86, b: LAKERS_87,
    blurb: "The rivalry that defined the 1980s: Bird's 67-15 Celtics against Magic's 65-17 Lakers, the 1986 and 1987 champions." },
  { slug: "sixers-1983-vs-celtics-1986", a: SIXERS_83, b: CELTICS_86,
    blurb: "Moses Malone and Dr. J's 65-17 champions against Bird's 67-15 Celtics, two of the best Eastern teams ever." },
  { slug: "pistons-1989-vs-bulls-1991", a: PISTONS_89, b: BULLS_91,
    blurb: "The Bad Boys against the Bulls team that finally got past them, sweeping Detroit in the 1991 conference finals." },
  { slug: "rockets-1995-vs-magic-1995", a: ROCKETS_95, b: MAGIC_95,
    blurb: "The 1995 Finals: Hakeem and Drexler's 47-35 Rockets swept Shaq and Penny's 57-25 Magic." },
  { slug: "lakers-2001-vs-sixers-2001", a: LAKERS_01, b: SIXERS_01,
    blurb: "The 2001 Finals: Shaq and Kobe's Lakers lost one playoff game all spring, to Iverson's 76ers." },
  { slug: "pistons-2004-vs-lakers-2004", a: PISTONS_04, b: LAKERS_04,
    blurb: "The 2004 Finals upset: Detroit's starting five beat Payton, Bryant, Malone and O'Neal four games to one." },
  { slug: "spurs-2005-vs-pistons-2005", a: SPURS_05, b: PISTONS_05,
    blurb: "Duncan's Spurs against the defending-champion Pistons in a 2005 Finals that went seven games." },
  { slug: "celtics-2008-vs-lakers-2009", a: CELTICS_08, b: LAKERS_09,
    blurb: "Garnett, Pierce and Allen's 66-16 champions against Kobe and Pau's 65-17 champions a year later." },
  { slug: "heat-2013-vs-spurs-2014", a: HEAT_13, b: SPURS_14,
    blurb: "LeBron's Heat won the 2013 Finals in seven; Duncan's Spurs took the 2014 rematch in five." },
  { slug: "warriors-2016-vs-cavaliers-2016", a: WARRIORS_16, b: CAVS_16,
    blurb: "The 73-9 Warriors against the Cavaliers who came back from 3-1 down to beat them in the 2016 Finals." },
  { slug: "raptors-2019-vs-warriors-2019", a: RAPTORS_19, b: WARRIORS_19,
    blurb: "Kawhi's Raptors against the Warriors' full-strength five; Toronto won the 2019 Finals in six." },
  { slug: "nuggets-2023-vs-celtics-2024", a: NUGGETS_23, b: CELTICS_24,
    blurb: "Jokić's 2023 champions against Boston's 64-18 champions of 2024." },
  { slug: "celtics-1965-vs-sixers-1967", a: CELTICS_65, b: SIXERS_67,
    blurb: "Russell's 62-18 Celtics against Wilt's 68-13 76ers, the team that ended Boston's eight-year title run." },
  { slug: "bucks-1971-vs-lakers-1972", a: BUCKS_71, b: LAKERS_72,
    blurb: "Kareem and Oscar's 66-16 champions against the 69-13 Lakers who won 33 games in a row." },
];

export function vsMatchup(slug: string): VsMatchup | null {
  return VS_MATCHUPS.find((m) => m.slug === slug) ?? null;
}
