#!/usr/bin/env Rscript
# build_chamber_map.R — Build a redist_map RDS for any GA chamber
#
# This script runs INSIDE the Modal alarm_image container (R + sf + redist
# pre-installed).  Do NOT run it locally; use the Modal entrypoint instead:
#
#   cd fdga-chain
#   modal run modal_alarm_app.py::build_map --chamber senate
#
# Positional args (all required):
#   1  vtd_zip       path to ga_pl2020_vtd.zip (2020 Census VTD shapefile zip)
#   2  district_shp  path to enacted district .shp file
#   3  out_rds       output path for the redist_map RDS
#   4  n_districts   number of districts (int)
#   5  district_col  column name for enacted plan in the RDS (e.g. "SDIST", "cd_2020")
#   6  pop_tol       population tolerance (float, e.g. 0.01 for ±1%)
#
# Output:
#   RDS file at <out_rds> containing a redist_map object with columns:
#     GEOID, COUNTYFP20, pop, muni, <district_col>, adj, pseudo_county
#
# Alignment notes (vs ALARM reference GA_cd_2020):
#   - Geometry simplified with rmapshaper::ms_simplify (keep=0.05) if available
#   - Adjacency pre-computed via redist.adjacency() and passed to redist_map()
#   - pseudo_county uses pick_county_muni() (county + municipality aware)
#   - Municipality data fetched from Census BAF via geomander::make_from_baf()
#   - BVAP hinge constraints intentionally omitted (post-Callais framing)

suppressPackageStartupMessages({
  library(sf)
  library(redist)
  library(dplyr)
})
has_geomander <- requireNamespace("geomander", quietly = TRUE)
if (has_geomander) suppressPackageStartupMessages(library(geomander))

args <- commandArgs(trailingOnly = TRUE)
if (length(args) < 6) {
  stop(paste(
    "Usage: Rscript build_chamber_map.R",
    "<vtd_zip> <district_shp> <out_rds>",
    "<n_districts> <district_col> <pop_tol>"
  ))
}

vtd_zip      <- args[1]
district_shp <- args[2]
out_rds      <- args[3]
n_districts  <- as.integer(args[4])
district_col <- args[5]
pop_tol      <- as.numeric(args[6])

cat(sprintf("[build_chamber_map] Starting\n"))
cat(sprintf("  vtd_zip      = %s\n", vtd_zip))
cat(sprintf("  district_shp = %s\n", district_shp))
cat(sprintf("  out_rds      = %s\n", out_rds))
cat(sprintf("  n_districts  = %d\n", n_districts))
cat(sprintf("  district_col = %s\n", district_col))
cat(sprintf("  pop_tol      = %.3f\n", pop_tol))

if (!file.exists(vtd_zip))      stop("VTD zip not found: ", vtd_zip)
if (!file.exists(district_shp)) stop("District shapefile not found: ", district_shp)

# ── Step 1: Load VTD shapefile ────────────────────────────────────────────────
cat("[1/6] Loading VTD shapefile…\n")
vtd <- st_read(paste0("/vsizip/", vtd_zip), quiet = TRUE)

vtd$GEOID      <- as.character(vtd$GEOID20)
vtd$COUNTYFP20 <- as.character(vtd$COUNTYFP20)
vtd$pop        <- as.integer(vtd$P0010001)

if (!isTRUE(st_crs(vtd)$epsg == 4326L)) {
  vtd <- st_transform(vtd, 4326)
}

cat(sprintf("  %d VTDs | total pop: %s\n",
            nrow(vtd), format(sum(vtd$pop, na.rm = TRUE), big.mark = ",")))

# ── Step 1b: Fetch municipality (INCPLACE_CDP) from Census BAF ────────────────
# Matches ALARM reference: pick_county_muni() needs a muni column so SMC avoids
# splitting both counties AND municipalities (not just counties).
cat("[1b/6] Fetching municipality assignments from Census BAF…\n")
muni_col <- tryCatch({
  d_muni <- geomander::make_from_baf("GA", "INCPLACE_CDP", "VTD") %>%
    mutate(GEOID = paste0("13", vtd)) %>%   # GA FIPS = "13"; vtd = 9-char county+vtd
    select(GEOID, muni = INCPLACE_CDP)
  vtd <- left_join(vtd, d_muni, by = "GEOID")
  # Treat empty string / all-zeros as unincorporated (NA)
  vtd$muni[vtd$muni == "" | vtd$muni == "0000000" | vtd$muni == "99999"] <- NA
  cat(sprintf("  %d VTDs with municipality assignments\n",
              sum(!is.na(vtd$muni))))
  "muni"
}, error = function(e) {
  cat(sprintf("  WARNING: BAF fetch failed (%s) — falling back to county-only\n",
              conditionMessage(e)))
  vtd$muni <<- NA_character_
  "muni"
})

# ── Step 2: Load enacted district shapefile ───────────────────────────────────
cat("[2/6] Loading enacted district shapefile…\n")
districts <- st_read(district_shp, quiet = TRUE)
districts  <- st_transform(districts, 4326)

# Accept "DISTRICT" or "CD" or the target column name directly
if ("DISTRICT" %in% names(districts)) {
  districts[[district_col]] <- as.integer(districts$DISTRICT)
} else if ("CD" %in% names(districts)) {
  districts[[district_col]] <- as.integer(districts$CD)
} else if (district_col %in% names(districts)) {
  districts[[district_col]] <- as.integer(districts[[district_col]])
} else {
  stop(sprintf(
    "Can't find district column. Expected 'DISTRICT', 'CD', or '%s'. Got: %s",
    district_col, paste(names(districts), collapse = ", ")
  ))
}

cat(sprintf("  %d districts | %s range: %d–%d\n",
            nrow(districts),
            district_col,
            min(districts[[district_col]], na.rm = TRUE),
            max(districts[[district_col]], na.rm = TRUE)))

# ── Step 2b: Simplify geometry (faster processing, smaller RDS) ───────────────
# Matches ALARM reference: rmapshaper::ms_simplify(keep=0.05, keep_shapes=TRUE)
cat("[2b/6] Simplifying geometry…\n")
if (requireNamespace("rmapshaper", quietly = TRUE)) {
  vtd <- rmapshaper::ms_simplify(vtd, keep = 0.05, keep_shapes = TRUE) %>%
    suppressWarnings()
  cat("  Geometry simplified (rmapshaper, keep=0.05)\n")
} else {
  cat("  rmapshaper not available — skipping simplification\n")
}

# ── Step 3: Largest-overlap join (VTD → district) ─────────────────────────────
cat("[3/6] Joining VTDs → districts (largest-overlap intersection)…\n")
proj_crs       <- "EPSG:32617"  # UTM zone 17N — area-accurate for Georgia
vtd_proj       <- st_transform(vtd[, c("GEOID", "geometry")], proj_crs)
districts_proj <- st_transform(districts[, c(district_col, "geometry")], proj_crs)

suppressWarnings({
  overlay <- st_intersection(vtd_proj, districts_proj)
})
overlay$area <- as.numeric(st_area(overlay))

best_match <- overlay |>
  st_drop_geometry() |>
  group_by(GEOID) |>
  slice_max(area, n = 1, with_ties = FALSE) |>
  ungroup() |>
  select(GEOID, !!district_col)

vtd <- vtd |>
  left_join(best_match, by = "GEOID") |>
  mutate(!!district_col := coalesce(as.integer(.data[[district_col]]), 0L))

n_assigned <- sum(vtd[[district_col]] > 0)
n_missing  <- nrow(vtd) - n_assigned
cat(sprintf("  %d/%d VTDs assigned\n", n_assigned, nrow(vtd)))
if (n_missing > 0) {
  unassigned <- vtd$GEOID[vtd[[district_col]] == 0]
  warning(sprintf("%d VTDs unassigned (%s=0): %s%s",
                  n_missing, district_col,
                  paste(head(unassigned, 5), collapse = ", "),
                  if (n_missing > 5) "…" else ""))
}

# ── Step 4: Pre-compute adjacency ─────────────────────────────────────────────
# Matches ALARM reference: explicitly compute adj and pass to redist_map().
# Avoids redist_map() recomputing it from geometry, and ensures consistent
# adjacency when geometry is simplified.
cat("[4/6] Computing adjacency graph…\n")
adj <- redist.adjacency(vtd)
cat(sprintf("  Adjacency computed for %d VTDs\n", length(adj)))

# ── Step 5: Build redist_map ──────────────────────────────────────────────────
cat(sprintf("[5/6] Building redist_map (ndists=%d, pop_tol=%.3f)…\n",
            n_districts, pop_tol))

map_data <- vtd |>
  select(GEOID, COUNTYFP20, pop, muni, !!district_col, geometry)

map <- redist_map(
  map_data,
  existing_plan = district_col,
  pop_col       = "pop",
  pop_tol       = pop_tol,
  ndists        = n_districts,
  adj           = adj
)

# Municipality-aware pseudo_county (matches ALARM reference pick_county_muni):
# Groups VTDs by county, but further splits by municipality within a county so
# SMC avoids splitting both counties AND cities — not just counties.
map$pseudo_county <- tryCatch(
  pick_county_muni(map, counties = map$COUNTYFP20, munis = map$muni),
  error = function(e) {
    cat(sprintf("  WARNING: pick_county_muni failed (%s) — using county-only pseudo_county\n",
                conditionMessage(e)))
    map$COUNTYFP20
  }
)

n_counties        <- length(unique(map$COUNTYFP20))
n_pseudo          <- length(unique(map$pseudo_county))
n_dist_found      <- length(unique(map[[district_col]][map[[district_col]] > 0]))
cat(sprintf("  %d VTDs | %d counties | %d pseudo-county units | %d districts with VTDs\n",
            nrow(map), n_counties, n_pseudo, n_dist_found))

# ── Step 6: Save ──────────────────────────────────────────────────────────────
cat(sprintf("[6/6] Saving → %s\n", out_rds))
dir.create(dirname(out_rds), recursive = TRUE, showWarnings = FALSE)
saveRDS(map, out_rds)

size_kb <- file.info(out_rds)$size / 1024
cat(sprintf("  Done. %.0f kB\n", size_kb))
cat("[build_chamber_map] Complete.\n")
