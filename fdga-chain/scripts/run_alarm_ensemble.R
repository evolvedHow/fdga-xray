#!/usr/bin/env Rscript
# run_alarm_ensemble.R — redist Sequential Monte Carlo ensemble runner
#
# Positional args (all required):
#   1  map_rds       path to GA_cd_2020_map.rds  (the redist_map object)
#   2  output_path   path to write plans parquet
#   3  chain_idx     1-indexed chain number (for seed offset)
#   4  draw_offset   draw numbering offset (chain 2 gets offset=5000 → draws 5001..10000)
#   5  nsims         number of SMC plans to generate
#   6  pop_tol       population tolerance (e.g. 0.01 for ±1%)
#   7  compactness   redist_smc compactness weight (1.0 = default)
#   8  seed          base random seed (0 = no seed)
#   9  run_name      plan_id label written to every row of the parquet
#   10 chamber       e.g. "congress"
#   11 n_districts   number of districts (e.g. 14)
#   12 counties_col  column name in map for county constraint (e.g. "pseudo_county")
#
# Output parquet schema (matches GerryChain plans parquet exactly):
#   plan_id   TEXT   — run_name
#   draw      INT32  — 1-indexed, draw_offset+1 .. draw_offset+nsims
#   geoid     TEXT   — VTD GEOID20 (11-char)
#   district  INT32  — district number (1-indexed)
#   geo_level TEXT   — "vtd"
#   state     TEXT   — "GA"
#   chamber   TEXT   — e.g. "congress"

suppressPackageStartupMessages({
  library(redist)
})

`%||%` <- function(x, y) if (!is.null(x) && length(x) > 0) x else y

# ── Parse args ────────────────────────────────────────────────────────────────
args <- commandArgs(trailingOnly = TRUE)
if (length(args) < 12) {
  stop(paste(
    "Usage: Rscript run_alarm_ensemble.R",
    "<map_rds> <output_path> <chain_idx> <draw_offset>",
    "<nsims> <pop_tol> <compactness> <seed>",
    "<run_name> <chamber> <n_districts> <counties_col>"
  ))
}

map_rds      <- args[1]
output_path  <- args[2]
chain_idx    <- as.integer(args[3])
draw_offset  <- as.integer(args[4])
nsims        <- as.integer(args[5])
pop_tol      <- as.double(args[6])
compactness  <- as.double(args[7])
seed         <- as.integer(args[8])
run_name     <- args[9]
chamber      <- args[10]
n_districts  <- as.integer(args[11])
counties_col <- args[12]

cat(sprintf("[ALARM] Chain %d  |  run_name=%s  |  nsims=%d  |  draw_offset=%d\n",
            chain_idx, run_name, nsims, draw_offset))
cat(sprintf("[ALARM] pop_tol=%.3f  compactness=%.2f  seed=%d\n",
            pop_tol, compactness, seed))

# ── Set random seed ───────────────────────────────────────────────────────────
if (seed > 0L) {
  set.seed(seed + chain_idx)
  cat(sprintf("[ALARM] RNG seed: %d\n", seed + chain_idx))
}

# ── Load map ──────────────────────────────────────────────────────────────────
cat(sprintf("[ALARM] Loading map from: %s\n", map_rds))
map <- readRDS(map_rds)
cat(sprintf("[ALARM] Map loaded: %d VTDs, %d districts expected\n",
            nrow(map), n_districts))

if (!counties_col %in% names(map)) {
  stop(sprintf("[ALARM] Column '%s' not found in map. Available: %s",
               counties_col, paste(names(map), collapse=", ")))
}

counties_vec <- map[[counties_col]]

# ── Run SMC ───────────────────────────────────────────────────────────────────
cat(sprintf("[ALARM] Starting redist_smc: nsims=%d, pop_tol=%.3f, compactness=%.2f\n",
            nsims, pop_tol, compactness))
t_start <- proc.time()["elapsed"]

plans <- redist_smc(
  map,
  nsims       = nsims,
  counties    = counties_vec,
  compactness = compactness,
  pop_temper  = 0.01,   # matches ALARM reference GA_cd_2020 03_sim script
  verbose     = TRUE
)

t_elapsed <- proc.time()["elapsed"] - t_start
cat(sprintf("[ALARM] SMC complete in %.1f seconds\n", t_elapsed))

# ── Extract assignment matrix ─────────────────────────────────────────────────
mat <- get_plans_matrix(plans)   # integer matrix: n_vtds × actual_nsims
n_vtds      <- nrow(mat)
actual_nsims <- ncol(mat)

if (actual_nsims < nsims) {
  cat(sprintf("[ALARM] WARNING: SMC produced %d plans (requested %d)\n",
              actual_nsims, nsims))
}

cat(sprintf("[ALARM] Matrix shape: %d VTDs × %d plans\n", n_vtds, actual_nsims))

# ── Build long-format data frame ──────────────────────────────────────────────
geoids    <- as.character(map$GEOID)
draw_ids  <- (draw_offset + 1L):(draw_offset + actual_nsims)

# Pre-allocate for speed (avoids multiple large allocations)
total_rows <- n_vtds * actual_nsims
cat(sprintf("[ALARM] Building long table: %d rows\n", total_rows))

df <- data.frame(
  plan_id   = run_name,
  draw      = rep(as.integer(draw_ids), each = n_vtds),
  geoid     = rep(geoids, times = actual_nsims),
  district  = as.integer(as.vector(mat)),
  geo_level = "vtd",
  state     = "GA",
  chamber   = chamber,
  stringsAsFactors = FALSE
)

# ── Write gzip CSV (arrow-free; Python orchestrator reads with pandas) ────────
out_dir <- dirname(output_path)
if (!dir.exists(out_dir)) dir.create(out_dir, recursive = TRUE)

# output_path is .csv.gz (passed from Python; no arrow needed)
cat(sprintf("[ALARM] Writing csv.gz: %s (%d rows)\n", output_path, nrow(df)))
con <- gzfile(output_path, "w")
write.csv(df, con, row.names = FALSE)
close(con)

size_mb <- file.info(output_path)$size / 1048576
cat(sprintf("[ALARM] Done. %.1f MB, %.1f sec total.\n", size_mb, t_elapsed))

cat(sprintf("[ALARM_RESULT] chain=%d actual_nsims=%d size_mb=%.2f\n",
            chain_idx, actual_nsims, size_mb))
