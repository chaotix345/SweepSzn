# Engine accuracy v4 — baseline (v3 engine, 2026-11-25)

Random-lineup wins spread: spreadSD = 10.908 (randomLineups(2000, 7)).

## scripts/search_best.ts (before)
```
brute-forcing C(60,5) = 5,461,512 combos (person-deduped)...
brute-force best winPct=0.9715 | hill-climb best winPct=0.9727 | agree=false

================ BEST TEAM OF ALL TIME (per engine) ================
RECORD: 80-2   PERFECT   (ORtg 120.7 / DRtg 93.1 / Net +27.6, win% 97.3)
lean-scorer vs engine winPct drift: 0.00029 (exact)
LINEUP:
  C  Nikola Jokić           2024 DEN   off   9.0  def   4.1  usg 29.3  
  PF LeBron James           2013 MIA   off   8.7  def   2.4  usg 30.2  
  C  Wilt Chamberlain       1968 PHI   off   5.3  def   5.2  usg 24.691730210000003  (est.D)
  PG John Stockton          1989 UTA   off   5.5  def   3.2  usg 19.1  
  PG Nate McMillan          1994 OKC   off   0.1  def   4.7  usg 12.4  
FACTORS:
  +17.7  Star offense
  +14.5  Star defense
  -1.3  Usage overload (116% demand)  (~0 wins)

--- top 10 teams by win% (brute force pool, person-deduped) ---
   1. 80-2  (net 27.9)  Jokić/Chamberlain/James/Johnson/Stockton
   2. 80-2  (net 27.7)  Jokić/James/Chamberlain/Johnson/Stockton
   3. 80-2  (net 27.6)  Jokić/Chamberlain/James/Johnson/Stockton
   4. 80-2  (net 27.4)  Jokić/James/Chamberlain/Johnson/Stockton
   5. 80-2  (net 27.2)  Jokić/Chamberlain/James/Paul/Stockton
   6. 80-2  (net 27.3)  Jokić/Chamberlain/Paul/Johnson/Stockton
   7. 80-2  (net 27.0)  Jokić/James/Chamberlain/Paul/Stockton
   8. 80-2  (net 27.4)  Jokić/Chamberlain/James/Durant/Stockton
   9. 80-2  (net 27.5)  Jokić/Chamberlain/Johnson/Durant/Stockton
  10. 80-2  (net 27.2)  Jokić/James/Chamberlain/Durant/Stockton

brute-forcing C(80,5) draftable combos...
draftable: brute-force winPct=0.9664 | slot hill-climb winPct=0.9691 | agree=false

================ BEST DRAFTABLE TEAM (slot-legal) ================
RECORD: 79-3   A+ HISTORIC   (ORtg 122.8 / DRtg 95.6 / Net +27.2, win% 96.9)
LINEUP (assigned slot):
  PG John Stockton          1989 UTA  elig[PG]  off   5.5  def   3.2  usg 19
  SG Nate McMillan          1994 OKC  elig[PG,SG]  off   0.1  def   4.7  usg 12
  SF LeBron James           2013 MIA  elig[PG,SG,SF,PF,C]  off   8.7  def   2.4  usg 30
  PF Magic Johnson          1990 LAL  elig[PG,SG,PF]  off   7.7  def   1.8  usg 25
  C  Nikola Jokić           2024 DEN  elig[C]  off   9.0  def   4.1  usg 29
FACTORS:
  +19.1  Star offense
  +12  Star defense
  -1.3  Usage overload (116% demand)  (~-1 wins)
  +0.5  Spacing (2.1 shooters)  (~0 wins)

--- top 10 DRAFTABLE teams (brute force pool) ---
   1. 79-3  (net 27.0)  Jokić/James/Johnson/Durant/Stockton
   2. 79-3  (net 26.8)  Jokić/James/Johnson/Durant/Stockton
   3. 79-3  (net 26.6)  Jokić/Jordan/James/Johnson/Stockton
   4. 79-3  (net 26.6)  Jokić/Jordan/James/Johnson/Stockton
   5. 79-3  (net 26.4)  Jokić/James/Jordan/Johnson/Stockton
   6. 79-3  (net 26.4)  Jokić/James/Jordan/Johnson/Stockton
   7. 79-3  (net 26.9)  Jokić/James/Curry/Johnson/Stockton
   8. 79-3  (net 26.7)  Jokić/James/Curry/Johnson/Stockton
   9. 79-3  (net 26.7)  Jokić/James/Johnson/Durant/Stockton
  10. 79-3  (net 26.5)  Jokić/James/Johnson/Durant/Stockton

```

## scripts/rank.ts (before)
```
=== TOP 25 BY TOTAL IMPACT (off+def, pts/100 vs avg; best season per player) ===
 1. Nikola Jokić           2024 C  off     9 def   4.1 tot  13.1 
 2. LeBron James           2009 SF off     9 def   3.2 tot  12.2 
 3. Michael Jordan         1988 SG off   8.6 def   3.5 tot  12.1 
 4. Shai Gilgeous-Alexander 2025 PG off   8.1 def   2.6 tot  10.7 
 5. Stephen Curry          2016 PG off     9 def   1.6 tot  10.6 
 6. Wilt Chamberlain       1968 C  off   5.3 def   5.2 tot  10.5 (est.D)
 7. James Harden           2019 PG off   8.9 def   1.6 tot  10.5 
 8. Giannis Antetokounmpo  2022 PF off   6.8 def   3.5 tot  10.3 
 9. David Robinson         1994 C  off   6.6 def   3.4 tot  10.0 
10. Chris Paul             2009 PG off   6.7 def   3.2 tot   9.9 
11. Kevin Garnett          2004 PF off   6.5 def   3.3 tot   9.8 
12. Kevin Durant           2014 SF off   8.4 def   1.4 tot   9.8 
13. Luka Dončić            2024 PG off     8 def   1.7 tot   9.7 
14. Russell Westbrook      2017 PG off   7.2 def   2.4 tot   9.6 
15. Magic Johnson          1990 PG off   7.7 def   1.8 tot   9.5 
16. Shaquille O'Neal       2000 C  off   7.3 def     2 tot   9.3 
17. Dwyane Wade            2009 SG off   6.7 def   2.4 tot   9.1 
18. Tracy McGrady          2003 SG off   8.3 def   0.7 tot   9.0 
19. Kevin Love             2014 PF off   8.3 def   0.6 tot   8.9 
20. Kawhi Leonard          2017 SF off   6.7 def   2.2 tot   8.9 
21. Joel Embiid            2022 C  off   6.9 def     2 tot   8.9 
22. John Stockton          1989 PG off   5.5 def   3.2 tot   8.7 
23. Kareem Abdul-Jabbar    1976 C  off   5.7 def   2.9 tot   8.6 
24. Charles Barkley        1990 SF off   7.5 def     1 tot   8.5 
25. Larry Bird             1985 SF off   6.4 def     2 tot   8.4 

=== TOP 10 DEFENDERS (best season per player) ===
  Wilt Chamberlain       1968 C def 5.2 (est.)
  Bill Russell           1963 C def 5.1 (est.)
  Nate McMillan          1994 PG def 4.7 
  Manute Bol             1986 C def 4.7 
  George Mikan           1952 C def 4.2 (est.)
  Nikola Jokić           2024 C def 4.1 
  Mark Eaton             1985 C def 3.9 
  Oliver Miller          1994 C def 3.8 
  Nerlens Noel           2021 C def 3.8 
  Matisse Thybulle       2021 SG def 3.8 
```

## After (engine v4, 2026-11-25)

Track A 5.557 (vs actual 6.066); Track B 8.095 vs baseline 8.142. Spread (draftable pools): top300 4.40, top1500 7.84.

### scripts/search_best.ts (after)
```
================ BEST TEAM OF ALL TIME (per engine) ================
RECORD: 80-2   PERFECT   (ORtg 124.8 / DRtg 95.6 / Net +29.2, win% 97.5)
lean-scorer vs engine winPct drift: 0.00003 (exact)
LINEUP:
  C  Nikola Jokić           2024 DEN   off   5.4  def   3.0  usg 29.3  
  SF LeBron James           2009 CLE   off   5.5  def   2.4  usg 33.8  
  C  Wilt Chamberlain       1968 PHI   off   3.4  def   3.3  usg 24.6906833  (est.D)
  PG Magic Johnson          1990 LAL   off   4.8  def   1.4  usg 24.8  
  PG John Stockton          1989 UTA   off   3.5  def   2.1  usg 19.1  
FACTORS:
  +20.3  Star offense
  +12.3  Star defense
  -0.7  Usage overload (132% demand)  (~0 wins)

--- top 10 teams by win% (brute force pool, person-deduped) ---
   1. 80-2  (net 29.2)  Jokić/James/Chamberlain/Johnson/Stockton
   2. 80-2  (net 29.2)  Jokić/James/Chamberlain/Johnson/Stockton
   3. 80-2  (net 28.1)  Jokić/James/Chamberlain/Stockton/Russell
   4. 80-2  (net 28.9)  Jokić/James/Chamberlain/Johnson/Stockton
   5. 80-2  (net 28.8)  Jokić/James/Chamberlain/Stockton/Paul
   6. 80-2  (net 29.0)  Jokić/James/Chamberlain/Johnson/Stockton
   7. 80-2  (net 28.6)  Jokić/James/Chamberlain/Johnson/Stockton
   8. 80-2  (net 28.4)  Jokić/James/Chamberlain/Paul/Stockton
   9. 80-2  (net 28.3)  Jokić/James/Chamberlain/Stockton/Kirilenko
  10. 80-2  (net 28.0)  Jokić/James/Chamberlain/Johnson/Russell

brute-forcing C(80,5) draftable combos...
draftable: brute-force winPct=0.9719 | slot hill-climb winPct=0.9719 | agree=true

================ BEST DRAFTABLE TEAM (slot-legal) ================
RECORD: 80-2   S PERFECT   (ORtg 125.2 / DRtg 96.8 / Net +28.4, win% 97.2)
LINEUP (assigned slot):
  PG John Stockton          1989 UTA  elig[PG]  off   3.5  def   2.1  usg 19
  SG LeBron James           2009 CLE  elig[PG,SG,SF,PF,C]  off   5.5  def   2.4  usg 34
  SF Andrei Kirilenko       2004 UTA  elig[SF,PF]  off   2.8  def   2.2  usg 22
  PF Magic Johnson          1990 LAL  elig[PG,SG,PF]  off   4.8  def   1.4  usg 25
  C  Nikola Jokić           2024 DEN  elig[C]  off   5.4  def   3.0  usg 29
FACTORS:
  +19.7  Star offense
  +11.2  Star defense
  +0.4  Spacing (1.9 shooters)  (~0 wins)

--- top 10 DRAFTABLE teams (brute force pool) ---
   1. 80-2  (net 28.4)  Jokić/James/Johnson/Stockton/Kirilenko
   2. 80-2  (net 28.6)  Jokić/James/Johnson/Stockton/Durant
   3. 80-2  (net 28.7)  Jokić/James/Johnson/Stockton/Durant
   4. 80-2  (net 28.3)  Jokić/James/Johnson/Stockton/Leonard
   5. 80-2  (net 28.4)  Jokić/James/Durant/Johnson/Stockton
   6. 80-2  (net 28.2)  Jokić/James/Johnson/Stockton/Kirilenko
   7. 80-2  (net 28.4)  Jokić/James/Johnson/Stockton/Leonard
   8. 80-2  (net 27.9)  Jokić/James/Jordan/Johnson/Stockton
   9. 80-2  (net 28.3)  Jokić/James/Johnson/Stockton/Durant
  10. 80-2  (net 28.4)  Jokić/James/Durant/Johnson/Stockton
```

### scripts/rank.ts (after)
```
=== TOP 25 BY TOTAL IMPACT (off+def, pts/100 vs avg; best season per player) ===
 1. Nikola Jokić           2024 C  off   5.4 def     3 tot   8.4 
 2. LeBron James           2009 SF off   5.5 def   2.4 tot   7.9 
 3. Michael Jordan         1988 SG off   5.3 def   2.4 tot   7.7 
 4. David Robinson         1994 C  off     4 def   2.9 tot   6.9 
 5. Wilt Chamberlain       1968 C  off   3.4 def   3.3 tot   6.7 (est.D)
 6. Kevin Garnett          2004 PF off   4.1 def   2.4 tot   6.5 
 7. Chris Paul             2009 PG off   4.2 def   2.3 tot   6.5 
 8. Shai Gilgeous-Alexander 2025 PG off   4.7 def   1.7 tot   6.4 
 9. James Harden           2019 PG off   5.2 def   1.1 tot   6.3 
10. Kevin Durant           2014 SF off   5.1 def   1.2 tot   6.3 
11. Magic Johnson          1990 PG off   4.8 def   1.4 tot   6.2 
12. Stephen Curry          2016 PG off   5.2 def   0.9 tot   6.1 
13. Kareem Abdul-Jabbar    1976 C  off   3.7 def   2.4 tot   6.1 
14. Shaquille O'Neal       2000 C  off   4.4 def   1.5 tot   5.9 
15. Giannis Antetokounmpo  2022 PF off   3.8 def   2.1 tot   5.9 
16. Larry Bird             1985 SF off     4 def   1.7 tot   5.7 
17. John Stockton          1991 PG off   3.9 def   1.8 tot   5.7 
18. Kawhi Leonard          2017 SF off   3.9 def   1.8 tot   5.7 
19. Luka Dončić            2024 PG off   4.5 def   1.1 tot   5.6 
20. Joel Embiid            2022 C  off   3.9 def   1.7 tot   5.6 
21. Russell Westbrook      2017 PG off   4.1 def   1.4 tot   5.5 
22. Charles Barkley        1990 SF off   4.7 def   0.8 tot   5.5 
23. Oscar Robertson        1964 PG off   4.2 def   1.2 tot   5.4 (est.D)
24. George Mikan           1952 C  off   2.3 def   3.1 tot   5.4 (est.D)
25. Dwyane Wade            2009 SG off   4.1 def   1.3 tot   5.4 

=== TOP 10 DEFENDERS (best season per player) ===
  Bill Russell           1963 C def 4 (est.)
  Wilt Chamberlain       1968 C def 3.3 (est.)
  Hakeem Olajuwon        1990 C def 3.2 
  George Mikan           1952 C def 3.1 (est.)
  Nikola Jokić           2024 C def 3 
  Mark Eaton             1985 C def 3 
  David Robinson         1994 C def 2.9 
  Marcus Camby           2007 C def 2.9 
  Ben Wallace            2002 C def 2.8 
  Manute Bol             1986 C def 2.8 
```
