# Complete Certification Tracking Workflow

**From Data Platform to User-Facing Display**

---

## Overview

This document shows the **complete end-to-end workflow** for certification tracking:
- How data moves from GA SOS → FDP → fdex/other apps
- How users see certification status in the UI
- How to update status when results are certified

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    CERTIFICATION TRACKING FLOW                   │
└─────────────────────────────────────────────────────────────────┘

STAGE 1: DATA COLLECTION & ENHANCEMENT (FDP)
════════════════════════════════════════════════════════════════════

    GA Secretary of State
    Georgia Election Results
         ↓
    requirements/ElectionVotResults-2026-Uncertified.xlsx
         ↓
    python scripts/add_certification_tracking.py
         ↓
    [5 new columns added]
    ├─ certification_status (uncertified | certified | certified_with_caveats)
    ├─ certified_date (ISO format or NULL)
    ├─ certified_by (official name or NULL)
    ├─ audit_status (pending | in_progress | complete | flagged)
    └─ caveat_notes (notes or NULL)
         ↓
    requirements/ElectionVotResults-2026-Certified-v2.xlsx
         ↓
    Enhanced Loader (elections_enhanced.py)
         ↓
    fdp/data/repos/main/elections/dim_elections_2026_certified.parquet

STAGE 2: CERTIFICATION UPDATES (FDP)
════════════════════════════════════════════════════════════════════

    When GA SOS or county certifies results:
         ↓
    Update Parquet File:
    df.loc[mask, 'certification_status'] = 'certified'
    df.loc[mask, 'certified_date'] = '2026-11-14'
    df.loc[mask, 'certified_by'] = 'Georgia Secretary of State'
    df.loc[mask, 'audit_status'] = 'complete'
         ↓
    dim_elections_2026_certified.parquet (updated)

STAGE 3: DATA DISTRIBUTION (FDP → Apps)
════════════════════════════════════════════════════════════════════

    FDP loads parquet and distributes to apps:
    
    ├─ fdex (Georgia Explorer)
    │  └─ Election tab + Certification Badge
    │
    ├─ lrdb (Local Redistricting Database)
    │  └─ County/city election view + Certification Badge
    │
    ├─ map-compare (Plan Comparison Tool)
    │  └─ Plan metrics view + Certification Banner
    │
    └─ fdensemble (Ensemble Benchmark)
       └─ Baseline election data + Certification Info

STAGE 4: USER-FACING DISPLAY (fdex as example)
════════════════════════════════════════════════════════════════════

    User visits: https://evolvedhow.github.io/fdex/
         ↓
    User selects district on map
         ↓
    Sidebar opens → "Election" tab
         ↓
    ┌────────────────────────────────┐
    │ 🔴 UNCERTIFIED                 │
    │    Pending Audit               │
    │                                │
    │ ⚠️ These results are           │
    │ preliminary and pending        │
    │ official certification         │
    └────────────────────────────────┘
         ↓
    Per-Election Results displayed below:
    - 2024 Pres: D 52.3% R 47.7%
    - 2022 Gov: D 51.8% R 48.2%
    - etc.
```

---

## Complete Workflow: Uncertified → Certified

### Timeline

```
NOV 5, 2026 (Election Day)
  ├─ Results collected
  ├─ Status: UNCERTIFIED
  ├─ audit_status: PENDING
  └─ fdex shows: 🔴 UNCERTIFIED warning banner

NOV 6-13, 2026 (Canvassing & Audit)
  ├─ Results: UNCERTIFIED
  ├─ audit_status: IN_PROGRESS
  └─ fdex shows: 🟠 UNCERTIFIED warning banner

NOV 14, 2026 (Certification Announced)
  ├─ GA SOS certifies state results
  ├─ Status: CERTIFIED
  ├─ certified_date: 2026-11-14
  ├─ certified_by: Georgia Secretary of State
  ├─ audit_status: COMPLETE
  ├─ Update parquet file
  └─ fdex shows: ✅ CERTIFIED confirmation

NOV 14-20, 2026 (County Certification)
  ├─ Individual counties certify
  ├─ Status: CERTIFIED (per county)
  ├─ Update parquet for each county
  └─ fdex shows county-specific status

ONGOING (Disputes/Recounts)
  ├─ If recount requested:
  │  ├─ Status: CERTIFIED (previous cert still valid)
  │  ├─ audit_status: IN_PROGRESS (recount underway)
  │  └─ caveat_notes: "Recount in District 5..."
  │
  └─ If new results from recount:
     ├─ Status: CERTIFIED_WITH_CAVEATS
     ├─ certified_date: [recount completion date]
     └─ caveat_notes: "Updated after recount completion"
```

---

## Data Flow Examples

### Example 1: Initial Uncertified Load

```python
# FDP Loading
from fdp.loaders.elections_enhanced import ElectionLoaderEnhanced

loader = ElectionLoaderEnhanced(repo)
elections = loader.load("elections_2026")

# All rows initially have:
elections['certification_status'].unique()
# Output: ['uncertified']

elections['audit_status'].unique()
# Output: ['pending']

elections['certified_date'].notna().sum()
# Output: 0  (no dates yet)

# In fdex Election Tab:
# User sees: 🔴 UNCERTIFIED Pending Audit
#            ⚠️ Results are preliminary...
```

### Example 2: Certification Arrives

```python
# When GA SOS certifies (Nov 14, 2026):
df = pd.read_parquet("dim_elections_2026_certified.parquet")

# Update all non-county-specific races
mask = df['office_name'].isin([
    'Governor', 'US Senate', 'Attorney General', ...
])

df.loc[mask, 'certification_status'] = 'certified'
df.loc[mask, 'certified_date'] = '2026-11-14'
df.loc[mask, 'certified_by'] = 'Georgia Secretary of State'
df.loc[mask, 'audit_status'] = 'complete'

df.to_parquet("dim_elections_2026_certified.parquet")

# In fdex Election Tab:
# User sees: ✅ CERTIFIED Audit Complete
#            Certified: 11/14/2026
#            by Georgia Secretary of State
```

### Example 3: County with Caveats

```python
# Fulton County has provisional ballot issue:
df = pd.read_parquet("dim_elections_2026_certified.parquet")

mask = (df['county'] == 'Fulton County') & \
       (df['office_name'] == 'US Senate')

df.loc[mask, 'certification_status'] = 'certified_with_caveats'
df.loc[mask, 'certified_date'] = '2026-11-14'
df.loc[mask, 'certified_by'] = 'Fulton County Elections Director'
df.loc[mask, 'audit_status'] = 'complete'
df.loc[mask, 'caveat_notes'] = 'Certified pending resolution of 15 provisional ballots'

df.to_parquet("dim_elections_2026_certified.parquet")

# In fdex Election Tab (Fulton County view):
# User sees: ⚠️ CERTIFIED w/CAVEATS Audit Complete
#            Certified: 11/14/2026
#            by Fulton County Elections Director
#            
#            Note: Certified pending resolution of
#            15 provisional ballots
```

---

## User Journey

### Scenario 1: User Checks Election Results on Nov 8 (Uncertified)

```
1. User visits https://evolvedhow.github.io/fdex/
2. User searches for "Fulton County"
3. User clicks on "US House District 5"
4. Sidebar opens, "Election" tab shows:

   ┌─────────────────────────────────────┐
   │ 🔴 UNCERTIFIED  Pending Audit       │
   │                                      │
   │ ⚠️ These results are preliminary     │
   │ and pending official certification   │
   │ from the Georgia Secretary of State. │
   └─────────────────────────────────────┘
   
   PER-ELECTION RESULTS
   2024 Pres    D 52.3%  R 47.7%
   2022 Gov     D 51.8%  R 48.2%
   2022 US Sen  D 50.9%  R 49.1%

5. User understands:
   ✓ Results shown are not final
   ✓ Need to wait for official certification
   ✓ Results may change
```

### Scenario 2: User Checks Results on Nov 15 (Certified)

```
1. User visits https://evolvedhow.github.io/fdex/
2. User searches for "Fulton County"
3. User clicks on "US House District 5"
4. Sidebar opens, "Election" tab shows:

   ┌─────────────────────────────────────┐
   │ ✅ CERTIFIED   Audit Complete       │
   │                                      │
   │ Certified: 11/14/2026                │
   │ by Georgia Secretary of State        │
   └─────────────────────────────────────┘
   
   PER-ELECTION RESULTS
   2024 Pres    D 52.3%  R 47.7%
   2022 Gov     D 51.8%  R 48.2%
   2022 US Sen  D 50.9%  R 49.1%

5. User understands:
   ✓ Results shown are official & certified
   ✓ Georgia SOS has verified these numbers
   ✓ Safe to rely on these results
```

---

## Implementation Checklist

### Phase 1: Data Enhancement ✅ DONE
- [x] Analyze election data
- [x] Create certification schema
- [x] Build add_certification_tracking.py script
- [x] Generate enhanced Excel file
- [x] Create elections_enhanced.py FDP loader
- [x] Document in ELECTION_ANALYSIS_2026.md

### Phase 2: FDP Integration 🔄 IN PROGRESS
- [ ] Convert enhanced Excel → parquet
- [ ] Load into FDP elections directory
- [ ] Update fdp config to include cert fields
- [ ] Test with enhanced loader

### Phase 3: Frontend Integration 📋 READY
- [ ] Create CertificationBadge.svelte component
- [ ] Integrate into fdex Sidebar.svelte
- [ ] Update fdex data config
- [ ] Test certification badge rendering

### Phase 4: Testing & Deployment 📋 READY
- [ ] Test uncertified display (red banner)
- [ ] Test certified display (green checkmark)
- [ ] Test certified_with_caveats (amber warning)
- [ ] Test responsive layouts
- [ ] Deploy to GitHub Pages
- [ ] Verify in live fdex URL

### Phase 5: Other Apps 📋 READY
- [ ] Add to lrdb (Local Redistricting Database)
- [ ] Add to map-compare (Plan Comparison)
- [ ] Add to fdensemble (Ensemble Benchmark)
- [ ] Add to fdga-chain (Ensemble API)

---

## Command Reference

### Convert Enhanced Excel to Parquet

```bash
cd ~/codebox/fgdp/fdp

uv run python << 'EOF'
import pandas as pd

# Read all sheets
df = pd.read_excel("../requirements/ElectionVotResults-2026-Certified-v2.xlsx", sheet_name=None)

# Combine all sheets
all_data = pd.concat(df.values(), ignore_index=True)

# Save to FDP
all_data.to_parquet("data/repos/main/elections/dim_elections_2026_certified.parquet")

print(f"✅ Converted {len(all_data)} records to parquet")
EOF
```

### Load and Query Certified Results

```python
from fdp.loaders.elections_enhanced import ElectionLoaderEnhanced

loader = ElectionLoaderEnhanced(repo)

# Load all elections
all_df = loader.load("dim_elections_2026_certified")

# Load only certified
certified_df = loader.load(
    "dim_elections_2026_certified",
    certification_status="certified"
)

# Get summary
summary = loader.get_certification_summary(all_df)
print(f"Certified: {summary['by_status']['certified']}")
print(f"Uncertified: {summary['by_status']['uncertified']}")
```

### Update Certification Status

```python
import pandas as pd

# Read current data
df = pd.read_parquet("fdp/data/repos/main/elections/dim_elections_2026_certified.parquet")

# Mark Fulton County as certified
mask = (df['county'] == 'Fulton County')
df.loc[mask, 'certification_status'] = 'certified'
df.loc[mask, 'certified_date'] = '2026-11-14'
df.loc[mask, 'certified_by'] = 'Fulton County Elections Director'
df.loc[mask, 'audit_status'] = 'complete'

# Save updated
df.to_parquet("fdp/data/repos/main/elections/dim_elections_2026_certified.parquet")

print(f"✅ Updated {mask.sum()} Fulton County records")
```

---

## Files & Locations

### FDP (Data Platform)
```
~/codebox/fgdp/
├── ELECTION_ANALYSIS_2026.md          ← Analysis report
├── IMPLEMENTATION_GUIDE.md            ← Setup instructions
├── CERTIFICATION_TRACKING_SUMMARY.md  ← Overview
├── QUICK_START_CERT_TRACKING.md       ← Quick reference
├── scripts/
│   └── add_certification_tracking.py  ← Script to add columns
├── fdp/config/schema/
│   └── elections.yml                  ← Schema definition
├── fdp/fdp/loaders/
│   └── elections_enhanced.py          ← Enhanced loader
└── requirements/
    └── ElectionVotResults-2026-Certified-v2.xlsx  ← Enhanced data
```

### fdga-xray (Frontend Apps)
```
~/codebox/fdga-xray/
├── CERTIFICATION_STATUS_UI.md         ← UI Integration guide
└── COMPLETE_WORKFLOW.md               ← This file

fdex/frontend/src/lib/components/
├── CertificationBadge.svelte          ← NEW component
└── Sidebar.svelte                     ← Modified
```

---

## Success Criteria

✅ **Phase 1 Complete:**
- Analysis shows 140M+ votes across 273 contests
- Schema defines 5 certification fields
- Script successfully adds columns to Excel
- Enhanced loader filters by status

✅ **Phase 2 Target:**
- Excel → Parquet conversion works
- FDP loads data with certification fields
- Enhanced loader can query by status

✅ **Phase 3 Target:**
- CertificationBadge component renders
- fdex displays banner in Election tab
- Colors match status (red/green/amber)
- Text is clear and accessible

✅ **Phase 4 Target:**
- All three statuses display correctly
- Responsive on mobile/tablet/desktop
- Deployed to GitHub Pages
- Live URL shows certification status

---

## Next Steps

### Immediate (Today)
1. ✅ Read this file (Complete Workflow)
2. ✅ Verify all documentation is clear
3. Review CertificationBadge.svelte component code

### This Week
1. Create Svelte component
2. Integrate into fdex
3. Convert Excel → Parquet
4. Test locally

### Next Week
1. Final testing
2. Deploy to GitHub Pages
3. Announce feature to users

### Ongoing
1. Update status as GA SOS certifies
2. Add to other apps (lrdb, map-compare, etc.)
3. Gather user feedback

---

## Summary

This certification tracking system provides:

✅ **Data Platform (FDP):**
- Schema with 5 certification fields
- Enhanced loader with filtering
- Script to add fields to election data

✅ **Frontend (fdex & others):**
- CertificationBadge component
- Color-coded status (red/green/amber)
- Responsive design
- Clear messaging

✅ **Workflow:**
- Start: Uncertified (red banner)
- Audit: Pending (amber notice)
- Complete: Certified (green checkmark)
- Issues: Certified with Caveats (amber with notes)

✅ **User Impact:**
- Users know if results are official
- Users see certification date
- Users know who certified
- Users see any caveats/issues

---

**Ready to implement!** Start with Phase 2 integration.
