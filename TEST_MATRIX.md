# FDGA X-Ray - Expected Display Matrix for Key Years

This document shows what SHOULD display in each section for selected years.

## Test Case #1: Year 2016, State House

### Expected Section Displays:

**[Section 01] Statewide**
- Kicker: "Statewide baseline — 2016"
- Title: "Georgia 2016: How statewide votes translate to district seats"
- Lede: "In 2016, Democrats won 35.6% of statewide two-party votes but 34.4% of state_house seats..."
- Seats KPI: "62 D · 118 R"
- Gap KPI: "-1.2 pts"
- Chart: Shows vertical line at 2016 on the historical statewide election trend chart

**[Section 02] Seats vs Votes**
- Chart shows line from 2000-2026 with point highlighted at 2016

**[Section 02a] County Swing**
- Title: "County-level vote shifts: 2012 → 2016"
- Shows arrows comparing 2012 to 2016 vote share by county

**[Section 03] The Map Swap**
- Kicker: "The map swap · GA House · 2024 redistricting effect **(historical)**"
- Title: "The 2024 redistricting gave Democrats X districts and took Y away"
- Lede: Mentions "2024 redistricting" and "using the 2024 presidential vote" with note: 
  "(Note: this comparison uses 2024 presidential vote data, shown for context even though you're viewing **2016** results)"
- Subtitle: "...the 2024 lines (shown for context with **2016** results)"

**[Section 04] Benchmark**
- Shows percentile rankings against neutral ensemble

**[Section 05] County Map**
- Choropleth colored by state_house 2016 results

**[Section 06] Competitiveness**
- Shows 2016 state house district margin distribution

**[Section 07] Precinct X-Ray**
- Precincts colored by selected election (default: composite 2018-2024)
- Searchable and drillable to county level

---

## Test Case #2: Year 2002, State House

### Expected Section Displays:

**[Section 01] Statewide**
- Kicker: "Statewide baseline — 2002 ⚠️ UNCERTIFIED"
- Title: "Georgia 2002: How statewide votes translate to district seats"
- Lede: "In 2002, Democrats won 50.7% of statewide two-party votes but — of state_house seats..."
- Seats KPI: **"— D · — R"** (DASHES - KNOWN LIMITATION due to multi-member districts)
- Gap KPI: **"—"** (DASH - cannot calculate without seat counts)
- Chart: Shows point at 2002 on historical trend

**[Section 02] Seats vs Votes**
- Chart shows line but 2002 points are at height of vote % only (no seat % line)

**[Section 02a] County Swing**
- Title: "County-level vote shifts: 1998 → 2002"
- Wait - actually 1998 is not in our data!
- Expected: "No prior election for comparison" message

**[Section 03] The Map Swap**
- Shows 2024 redistricting analysis (same as all years)

**[Section 04-07]**
- All show data appropriately

---

## Test Case #3: Year 2024, US House

### Expected Section Displays:

**[Section 01] Statewide**
- Kicker: "Statewide baseline — 2024"
- Title: "Georgia 2024: How statewide votes translate to district seats"
- Seats: "5 D · 9 R"
- Chart: Point at 2024

**[Section 03] The Map Swap**
- Kicker: "The map swap · U.S. House · 2024 redistricting effect" (NO "(historical)" suffix)
- This is showing the actual 2024 redistricting analysis
- Title: "The 2024 redistricting gave Democrats X districts and took Y away"
- Lede: "How the 2024 redistricting affected u.s. house..."
- Subtitle: "Every district, sorted by how far the 2024 presidential vote shifted..."
  (NO "(shown for context with 2024 results)" because year == 2024)

---

## Critical Validation Points

### Section 03 (Map Swap) Behavior

✓ **When year == 2024:**
- Kicker: "The map swap · [chamber] · 2024 redistricting effect"
- Historical note: NOT shown
- Purpose: Showing the actual redistricting effect in the year it happened

✓ **When year != 2024 (e.g., 2016):**
- Kicker: "The map swap · [chamber] · 2024 redistricting effect **(historical)**"
- Historical note: SHOWN at end of lede: "(Note: this comparison uses 2024 presidential vote data, shown for context even though you're viewing 2016 results)"
- Purpose: Showing the redistricting effect for reference, but noting it's different from 2016 results

---

## Verification Commands

Run these to verify actual data in story.json:

```bash
# Check 2016 state house
python3 -c "
import json
with open('public/data/story.json') as f:
    data = json.load(f)
    cy = next(r for r in data['chamber_year'] if r['chamber']=='state_house' and r['year']==2016)
    print(f\"2016 State House: {cy['seatsD']:.0f}D-{cy['seatsR']:.0f}R seats\")
"

# Check 2002 state house (should show None)
python3 -c "
import json
with open('public/data/story.json') as f:
    data = json.load(f)
    cy = next(r for r in data['chamber_year'] if r['chamber']=='state_house' and r['year']==2002)
    print(f\"2002 State House: {cy['seatsD']} seats (should be None)\")
"

# Check map effect data exists
python3 -c "
import json
with open('public/data/story.json') as f:
    data = json.load(f)
    effect = data['map_effect']['state_house']
    print(f\"Map effect: {effect['prior']['label']} → {effect['current']['label']}\")
"
```

