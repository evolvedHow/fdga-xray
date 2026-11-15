# FairDistricts-XRAY

Advanced election analytics and certification tracking system for Fair Districts Georgia.

**Note:** This repository has been reorganized. Previously located at `~/codebox/fdga-xray`, now integrated into `~/codebox/fgdp/fair-districts-xray/` as part of the Fair Districts Data Platform monorepo.

---

## Overview

FairDistricts-XRAY provides:

- 📊 **Election Data Analysis** — Comprehensive analysis tools for Georgia election results
- ✅ **Certification Tracking** — Track election certification status in real-time
- 🎨 **Interactive Maps** — Visualize election results and demographic data
- 📈 **Metrics & Benchmarking** — Compare election results and district metrics

---

## Integration with FDP

This app is part of the Fair Districts Data Platform (FDP) monorepo:

```
~/codebox/fgdp/
├── fdp/              ← Shared data platform (Python)
├── fdex/             ← Georgia Explorer (separate repo)
├── lrdb/             ← Local Redistricting Database (separate repo)
├── map-compare/      ← Plan comparison tool (separate repo)
├── fdga-chain/       ← Ensemble API (separate repo)
└── fair-districts-xray/  ← This app (separate repo)
```

---

## Certification Tracking Features

### New in 2026

FairDistricts-XRAY now includes **certification status tracking** for election results:

- **Status Tracking:** uncertified → pending audit → certified
- **Real-time Updates:** Show certification date and official
- **Caveat Management:** Track provisional ballot issues and disputes
- **Audit Lifecycle:** Track progress from initial results to final certification

### Integration Points

The certification tracking system connects to:

- **FDP Data Platform** — Enhanced election loader with filtering
- **fdex** — Georgia Explorer displays certification banners
- **lrdb** — Local Redistricting Database shows certification status
- **map-compare** — Plan comparison includes certification info

---

## Key Files

### Documentation

- **CERTIFICATION_STATUS_UI.md** — UI integration guide for fdex and other apps
- **COMPLETE_WORKFLOW.md** — End-to-end certification tracking workflow
- **GEORGIA_EXPLORER.md** — Georgia Explorer (fdex) user guide
- **README.md** — This file

### Code

- `frontend/` — Svelte/React frontend apps
- `scripts/` — Analysis and processing scripts
- `screenshots/` — UI screenshots and examples

---

## Certification Tracking Workflow

```
Nov 5, 2026 (Election Day)
  ↓
Initial Results (UNCERTIFIED)
  ├─ Displayed in red banner
  └─ audit_status: pending
  ↓
Nov 6-13 (Audit Period)
  ├─ audit_status: in_progress
  └─ Users see yellow warning
  ↓
Nov 14 (Certification)
  ├─ GA SOS certifies results
  ├─ Status: CERTIFIED
  ├─ Displayed in green banner
  └─ Shows certification date & official
```

---

## Getting Started

### View Certification Status

The certification status appears in:

1. **Georgia Explorer (fdex)**
   - Election Tab
   - Color-coded banner (red/green/amber)
   - Shows date and official

2. **Local Redistricting Database (lrdb)**
   - County/city election view
   - Certification status per jurisdiction

3. **Plan Comparison (map-compare)**
   - Shows cert status for each plan's baseline election

### Update Certification Status

When GA SOS certifies results:

```bash
# Update the data
python scripts/update_certification_status.py \
  --county "All" \
  --status certified \
  --date 2026-11-14 \
  --official "Georgia Secretary of State"

# Commit changes
git add .
git commit -m "Update: Election results certified by GA SOS"
git push
```

---

## Certification Fields

Election results now include:

| Field | Type | Example |
|-------|------|---------|
| `certification_status` | enum | `certified` |
| `certified_date` | date | `2026-11-14` |
| `certified_by` | string | `Georgia Secretary of State` |
| `audit_status` | enum | `complete` |
| `caveat_notes` | string | `null` or notes |

---

## FDP Data Platform Integration

### Load Certified Results

```python
from fdp.loaders.elections_enhanced import ElectionLoaderEnhanced

loader = ElectionLoaderEnhanced(repo)

# Load only certified results
certified = loader.load("elections_2026", certification_status="certified")

# Get summary
summary = loader.get_certification_summary(df)
```

### Update Election Data

```bash
cd ../fdp

# Convert enhanced Excel to parquet
python -c "
  import pandas as pd
  df = pd.read_excel('../fair-districts-xray/data/elections_2026.xlsx', sheet_name=None)
  all_data = pd.concat(df.values(), ignore_index=True)
  all_data.to_parquet('data/repos/main/elections/dim_elections_2026.parquet')
"
```

---

## Rebranding Notes

This app was previously named **fdga-xray** and has been rebranded to **FairDistricts-XRAY** to:

- Better reflect the Fair Districts Georgia initiative
- Follow consistent naming across apps
- Enable integration as a first-class FDP application
- Support certification tracking across the platform

### What Changed

| Before | After |
|--------|-------|
| `~/codebox/fdga-xray/` | `~/codebox/fgdp/fair-districts-xray/` |
| Standalone repo | Part of FDP monorepo |
| Limited integration | Full FDP integration |
| No cert tracking | Full certification system |

---

## Architecture

```
FairDistricts-XRAY
├── Data Layer (FDP)
│   ├── Election data with certification fields
│   ├── Enhanced loader for filtering
│   └── Quality validation
│
├── API Layer
│   ├── Election endpoints
│   ├── Certification status queries
│   └── Certification update endpoints
│
└── Frontend Layer
    ├── fdex (Georgia Explorer)
    │   └── Certification banner in Election tab
    ├── lrdb (Redistricting Database)
    │   └─ Certification status views
    └── map-compare (Plan Comparison)
        └─ Baseline election certification info
```

---

## Contributing

To contribute to FairDistricts-XRAY:

1. This repo is part of the FDP monorepo
2. Follow FDP coding standards (see `../fdp/README.md`)
3. Certification features must include tests
4. Update documentation for any changes

---

## Support

### Documentation

- **Main FDP Docs:** `../fdp/README.md`
- **Certification System:** `./CERTIFICATION_STATUS_UI.md`
- **Complete Workflow:** `./COMPLETE_WORKFLOW.md`
- **Georgia Explorer:** `./GEORGIA_EXPLORER.md`

### Questions?

See the documentation files or the main FDP README for guidance on:
- How the certification system works
- How to implement in frontend apps
- How to update certification status
- How to query certified vs. uncertified data

---

## License

Same as Fair Districts Georgia (see parent repo).

---

**Last Updated:** November 15, 2026  
**Status:** ✅ Integrated into FDP with certification tracking  
**Next:** Implement certification UI in fdex and other apps
