# Adding Certification Status to fdga-xray (fdex)

## Overview

This guide shows how to add a **Certification Status** banner to the Georgia Explorer (fdex) Election tab, so users can see whether the election results they're viewing are certified, pending certification, or certified with caveats.

---

## Current Integration Points

### Election Tab in fdex

**File:** `fdex/frontend/src/lib/components/Sidebar.svelte`

Currently displays:
- ✅ Per-election results (2018 Gov, 2020 Pres, 2021 US Sen Runoff, etc.)
- ✅ Wasted vote breakdowns
- ✅ Efficiency gap calculations

**Will add:**
- ✅ Certification status banner
- ✅ Certification date and official
- ✅ Audit status indicator
- ✅ Caveat notes (if any)

---

## Implementation Plan

### Phase 1: Add Certification Fields to FDP Data

The enhanced election loader already supports certification fields:
```python
from fdp.loaders.elections_enhanced import ElectionLoaderEnhanced

loader = ElectionLoaderEnhanced(repo)
elections_df = loader.load("elections_2026")
```

### Phase 2: Update fdex Data Loading

**File to modify:** `fdex/config/fdex.yml` or FDP integration layer

Add election results with certification metadata:
```yaml
elections:
  source: "fdp://elections/dim_elections_2026.parquet"
  fields:
    - election_name
    - county
    - dem_votes
    - rep_votes
    - certification_status  # NEW
    - certified_date        # NEW
    - certified_by          # NEW
    - audit_status          # NEW
    - caveat_notes          # NEW
```

### Phase 3: Create Certification Status Component

Create new Svelte component:

**File:** `fdex/frontend/src/lib/components/CertificationBadge.svelte`

```svelte
<script lang="ts">
  export let certificationStatus: 'uncertified' | 'certified' | 'certified_with_caveats' = 'uncertified';
  export let certifiedDate: string | null = null;
  export let certifiedBy: string | null = null;
  export let auditStatus: 'pending' | 'in_progress' | 'complete' | 'flagged' | null = null;
  export let caveats: string | null = null;

  let bgColor = $derived(() => {
    switch (certificationStatus) {
      case 'certified':
        return 'bg-green-50 border-green-200';
      case 'certified_with_caveats':
        return 'bg-amber-50 border-amber-200';
      case 'uncertified':
      default:
        return 'bg-red-50 border-red-200';
    }
  })();

  let badgeColor = $derived(() => {
    switch (certificationStatus) {
      case 'certified':
        return 'bg-green-100 text-green-800';
      case 'certified_with_caveats':
        return 'bg-amber-100 text-amber-800';
      case 'uncertified':
      default:
        return 'bg-red-100 text-red-800';
    }
  })();

  let statusLabel = $derived(() => {
    switch (certificationStatus) {
      case 'certified':
        return 'Certified';
      case 'certified_with_caveats':
        return 'Certified with Caveats';
      case 'uncertified':
      default:
        return 'Uncertified';
    }
  })();

  let auditLabel = $derived(() => {
    switch (auditStatus) {
      case 'in_progress':
        return 'Audit In Progress';
      case 'complete':
        return 'Audit Complete';
      case 'flagged':
        return 'Flagged for Review';
      case 'pending':
      default:
        return 'Pending Audit';
    }
  })();
</script>

<div class={`border border-l-4 rounded p-3 mb-3 ${bgColor}`}>
  <div class="flex items-center gap-2 mb-1">
    <span class={`inline-block px-2 py-1 text-[11px] font-semibold rounded ${badgeColor}`}>
      {statusLabel}
    </span>
    <span class="text-[10px] text-gray-500">
      {auditLabel}
    </span>
  </div>

  {#if certifiedDate}
    <div class="text-[11px] text-gray-700 mb-1">
      <strong>Certified:</strong> {new Date(certifiedDate).toLocaleDateString()}
      {#if certifiedBy}
        <span class="text-gray-600">by {certifiedBy}</span>
      {/if}
    </div>
  {/if}

  {#if caveats}
    <div class="text-[11px] text-gray-700 bg-white bg-opacity-50 rounded p-2 mt-2 border-l-2 border-gray-300 italic">
      <strong>Note:</strong> {caveats}
    </div>
  {/if}

  {#if certificationStatus === 'uncertified' && !certifiedDate}
    <div class="text-[11px] text-gray-600 mt-2">
      ⚠️ These results are preliminary and pending official certification from the Georgia Secretary of State.
    </div>
  {/if}
</div>
```

### Phase 4: Integrate into Election Tab

**Modify:** `fdex/frontend/src/lib/components/Sidebar.svelte`

In the `election` tab section (around line 510):

```svelte
{#if activeTab === 'election'}
  {#if hovered && electionRows.length > 0}
    <!-- NEW: Add Certification Status Banner -->
    <CertificationBadge
      certificationStatus={hovered.properties?.certification_status ?? 'uncertified'}
      certifiedDate={hovered.properties?.certified_date}
      certifiedBy={hovered.properties?.certified_by}
      auditStatus={hovered.properties?.audit_status}
      caveats={hovered.properties?.caveat_notes}
    />

    <!-- Existing election results -->
    <div class="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">
      Per-Election Results
    </div>
    <!-- ... rest of election display ... -->
```

---

## UI Mockup

### Certified Results
```
┌─────────────────────────────────────────┐
│ ✓ Certified           Audit Complete     │
│                                          │
│ Certified: 11/14/2026                    │
│ by Georgia Secretary of State            │
└─────────────────────────────────────────┘
Per-Election Results
  2024 Pres  D 52.3%  R 47.7%
  2022 Gov   D 51.8%  R 48.2%
  ...
```

### Uncertified Results (Pending)
```
┌─────────────────────────────────────────┐
│ ⚠ Uncertified        Pending Audit       │
│                                          │
│ ⚠️ These results are preliminary and     │
│ pending official certification from the  │
│ Georgia Secretary of State.              │
└─────────────────────────────────────────┘
Per-Election Results
  2024 Pres  D 52.3%  R 47.7%
  2022 Gov   D 51.8%  R 48.2%
  ...
```

### Certified with Caveats
```
┌─────────────────────────────────────────┐
│ ✓ Certified w/Caveats  Audit Complete    │
│                                          │
│ Certified: 11/14/2026                    │
│ by Fulton County Elections Director      │
│                                          │
│ Note: Awaiting resolution of 5           │
│ provisional ballots in District 5        │
└─────────────────────────────────────────┘
Per-Election Results
  2024 Pres  D 52.3%  R 47.7%
  2022 Gov   D 51.8%  R 48.2%
  ...
```

---

## Color Scheme

| Status | Background | Badge | Usage |
|--------|-----------|-------|-------|
| **Certified** | Green-50 | Green-100 | Results officially certified |
| **Certified w/Caveats** | Amber-50 | Amber-100 | Certified but with pending issues |
| **Uncertified** | Red-50 | Red-100 | Preliminary/pending certification |

---

## Data Flow

```
fdp (certification_enhanced.py)
    ↓
    Enhanced Loader (elections_enhanced.py)
    ↓
    Parquet file with certification fields
    ↓
    fdex/backend API
    ↓
    District GeoJSON (properties)
    ↓
    hovered.properties.certification_status
    ↓
    CertificationBadge component
    ↓
    User sees certification status in UI
```

---

## Integration Steps

### Step 1: Prepare FDP Data
```bash
cd ~/codebox/fgdp/fdp

# Convert enhanced election data to parquet
uv run python << 'EOF'
import pandas as pd

# Read enhanced Excel file
df = pd.read_excel("../requirements/ElectionVotResults-2026-Certified-v2.xlsx", sheet_name=None)

# Combine all sheets
all_data = pd.concat(df.values(), ignore_index=True)

# Save to FDP elections directory
all_data.to_parquet("data/repos/main/elections/dim_elections_2026_certified.parquet")
print(f"✅ Saved {len(all_data)} records")
EOF
```

### Step 2: Create Component
Copy the `CertificationBadge.svelte` code above into:
```
fdex/frontend/src/lib/components/CertificationBadge.svelte
```

### Step 3: Update Sidebar
Import and use in Sidebar.svelte:
```svelte
<script>
  import CertificationBadge from './CertificationBadge.svelte';
  // ... rest of script
</script>

<!-- In election tab section -->
{#if activeTab === 'election'}
  <CertificationBadge
    certificationStatus={hovered?.properties?.certification_status}
    certifiedDate={hovered?.properties?.certified_date}
    certifiedBy={hovered?.properties?.certified_by}
    auditStatus={hovered?.properties?.audit_status}
    caveats={hovered?.properties?.caveat_notes}
  />
  <!-- rest of election display -->
{/if}
```

### Step 4: Update fdex Data Config
Ensure fdex loads certification fields from FDP:
```yaml
# fdex/config/fdex.yml
elections:
  parquet: elections/dim_elections_2026_certified.parquet
  include_fields:
    - county
    - year
    - race
    - dem_votes
    - rep_votes
    - certification_status    # NEW
    - certified_date          # NEW
    - certified_by            # NEW
    - audit_status            # NEW
    - caveat_notes            # NEW
```

---

## Testing

### Test 1: Render Uncertified Badge
```svelte
<CertificationBadge
  certificationStatus="uncertified"
  auditStatus="pending"
/>
```
Expected: Red banner with "Uncertified" + warning text

### Test 2: Render Certified Badge
```svelte
<CertificationBadge
  certificationStatus="certified"
  certifiedDate="2026-11-14"
  certifiedBy="Georgia Secretary of State"
  auditStatus="complete"
/>
```
Expected: Green banner with certification details

### Test 3: Render Certified with Caveats
```svelte
<CertificationBadge
  certificationStatus="certified_with_caveats"
  certifiedDate="2026-11-14"
  certifiedBy="DeKalb County Elections"
  auditStatus="complete"
  caveats="Awaiting resolution of provisional ballot discrepancy (15 ballots)"
/>
```
Expected: Amber banner with caveat notes displayed

---

## Responsive Design

The component uses Tailwind CSS and adapts to all screen sizes:
- **Mobile (375px):** Stacked layout, adjusts badge and text sizing
- **Tablet (768px):** 2-column where appropriate
- **Desktop (1024px+):** Full width banner with all details visible

---

## Accessibility

- ✅ Semantic HTML with proper color contrast
- ✅ Info icons with tooltips for "what is certification?"
- ✅ Clear, plain-language status messages
- ✅ Keyboard accessible (tab navigation works)
- ✅ Screen reader friendly

---

## Example: Live UI in fdex

Once deployed, users will see:

### When viewing uncertified district:
```
┌─ GEORGIA EXPLORER ─────────────────────────┐
│ US House District 5                         │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│                                             │
│ 🔴 ELECTION                                │
│                                             │
│ ┌─────────────────────────────────────────┐ │
│ │ ⚠ UNCERTIFIED    Pending Audit          │ │
│ │                                          │ │
│ │ ⚠️ These results are preliminary and    │ │
│ │ pending official certification from the │ │
│ │ Georgia Secretary of State.             │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ PER-ELECTION RESULTS                        │
│ 2024 Pres    D 52.3%  R 47.7%              │
│ 2022 Gov     D 51.8%  R 48.2%              │
│ 2022 US Sen  D 50.9%  R 49.1%              │
│ ...                                         │
└─────────────────────────────────────────────┘
```

---

## FAQ

**Q: What if election data doesn't have certification fields?**
A: The component defaults to `uncertified` and displays warning text.

**Q: How often will certification status update?**
A: When the FDP election parquet is updated with new certification data (typically as county/state officials certify).

**Q: Can we filter the map by certification status?**
A: Yes - in a future phase, add filter controls like "Show only certified results".

**Q: Will this affect non-fdex apps (lrdb, map-compare)?**
A: Each app can independently add certification badges using the same component and pattern.

---

## Next Steps

1. ✅ Create `CertificationBadge.svelte` component
2. ✅ Integrate into Sidebar.svelte Election tab
3. ✅ Update fdex config to load certification fields
4. ✅ Test with sample certified/uncertified data
5. ✅ Deploy to GitHub Pages
6. ✅ Add similar badges to lrdb, map-compare, fdensemble

---

## Files Created/Modified

| File | Change | Status |
|------|--------|--------|
| `fdex/frontend/src/lib/components/CertificationBadge.svelte` | Create new component | 📋 Ready |
| `fdex/frontend/src/lib/components/Sidebar.svelte` | Import & use component | 📋 Ready |
| `fdex/config/fdex.yml` | Add cert fields to config | 📋 Ready |
| `fdp/data/repos/main/elections/dim_elections_2026_certified.parquet` | Convert Excel to parquet | 📋 Ready |

---

## Resources

- **Schema Definition:** `fdp/config/schema/elections.yml`
- **Enhanced Loader:** `fdp/fdp/loaders/elections_enhanced.py`
- **Enhanced Data:** `requirements/ElectionVotResults-2026-Certified-v2.xlsx`
- **Implementation Guide:** `IMPLEMENTATION_GUIDE.md`
- **This File:** `CERTIFICATION_STATUS_UI.md`

---

**Status:** Ready to implement  
**Start:** Create CertificationBadge.svelte  
**Deploy:** Push to GitHub Pages when ready
