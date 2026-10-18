#!/usr/bin/env Rscript
# Compare raw notifications, prepared records and regional ledgers without editing inputs.
suppressPackageStartupMessages({
  library(data.table)
  library(haven)
  library(jsonlite)
  library(dplyr)
  library(lubridate)
  library(sf)
})
setDTthreads(2)
args <- commandArgs(trailingOnly = TRUE)
stopifnot(length(args) == 2L)
config <- read_json(args[1], simplifyVector = TRUE)
out <- args[2]
stopifnot(!dir.exists(out))
Sys.umask("0077")
dir.create(out, recursive = TRUE, mode = "0700")
paths <- config$paths
sha <- function(path) {
  result <- system2("shasum", c("-a", "256", shQuote(path)), stdout = TRUE)
  stopifnot(is.null(attr(result, "status")), length(result) == 1L)
  substr(result, 1, 64)
}
hashes <- lapply(paths, sha)
save_table <- function(name, frame) fwrite(frame, file.path(out, paste0(name, ".csv")))
keys <- c("TRANSPORT_DATUM", "UBN_LEV", "UBN_AFN", "TYPE_MELDING")
group_counts <- function(frame, columns = keys) {
  frame[, .(animals = sum(AANTAL_DIEREN)), by = columns]
}
compare <- function(first, second, columns) {
  stopifnot(!anyDuplicated(first, by = columns), !anyDuplicated(second, by = columns))
  x <- merge(first, second, by = columns, all = TRUE, suffixes = c("_first", "_second"))
  x[, kind := fifelse(is.na(animals_first), "added",
              fifelse(is.na(animals_second), "removed",
              fifelse(animals_first == animals_second, "equal", "changed")))]
  x[is.na(animals_first), animals_first := 0]
  x[is.na(animals_second), animals_second := 0]
  x[, delta := animals_second - animals_first]
  x
}
toy <- compare(data.table(k = c(1, 2, 3), animals = c(5, 7, 11)),
               data.table(k = c(1, 2, 4), animals = c(5, 9, 13)), "k")
stopifnot(identical(toy$kind, c("equal", "changed", "removed", "added")),
          identical(toy$delta, c(0, 2, -11, 13)))
toy_rows <- data.table(TRANSPORT_DATUM = as.Date(c("2020-01-01", "2020-01-01")),
                      UBN_LEV = c(NA_real_, NA_real_), UBN_AFN = c(1, 1),
                      TYPE_MELDING = c("IMP", "IMP"), AANTAL_DIEREN = c(2, 3))
stopifnot(nrow(group_counts(toy_rows)) == 1L, group_counts(toy_rows)$animals == 5)
read_records <- function(path, sas = FALSE, historical = FALSE) {
  x <- if (sas) as.data.table(read_sas(path)) else fread(path)
  x[, TRANSPORT_DATUM := if (historical) as.Date(TRANSPORT_DATUM, "%d-%m-%Y") else as.Date(TRANSPORT_DATUM)]
  stopifnot(!anyNA(x$TRANSPORT_DATUM), !anyNA(x$AANTAL_DIEREN),
            all(x$AANTAL_DIEREN > 0), all(x$AANTAL_DIEREN %% 1 == 0))
  if ("JAAR" %in% names(x)) stopifnot(all(x$JAAR == year(x$TRANSPORT_DATUM)))
  x
}
arrivals <- read_records(paths$arrivals, sas = TRUE)
departures <- read_records(paths$departures, sas = TRUE)
february <- read_records(paths$departures_february, sas = TRUE)
historical <- read_records(paths$historical_raw, historical = TRUE)
prepared <- read_records(paths$prepared)
raw_files <- list(arrivals = arrivals, departures = departures, departures_february = february)
inventory <- rbindlist(lapply(names(raw_files), function(name) {
  x <- raw_files[[name]]
  stopifnot(!anyNA(x$ID), !anyDuplicated(x$ID), !anyDuplicated(x))
  x[, .(file = name, rows = .N, animals = sum(AANTAL_DIEREN),
         first_date = min(TRANSPORT_DATUM), last_date = max(TRANSPORT_DATUM),
         observed_days = uniqueN(TRANSPORT_DATUM)),
    by = .(year = year(TRANSPORT_DATUM), TYPE_MELDING, STATUS_MELDING)]
}))
save_table("raw-inventory", inventory)
save_table("raw-monthly-coverage", rbindlist(lapply(names(raw_files), function(name) {
  raw_files[[name]][, .(file = name, rows = .N, animals = sum(AANTAL_DIEREN)),
    by = .(month = format(TRANSPORT_DATUM, "%Y-%m"), TYPE_MELDING)]
})))
eligible <- function(x) x[
  (TYPE_MELDING == "AAN" & !is.na(UBN_LEV) & !is.na(UBN_AFN)) |
  (TYPE_MELDING == "IMP" & !is.na(UBN_AFN)) |
  (TYPE_MELDING %in% c("EXP", "DOO") & !is.na(UBN_LEV))]
channels <- rbindlist(list(arrivals, departures), use.names = TRUE)
rebuilt <- group_counts(eligible(channels))
raw_comparison <- compare(rebuilt, group_counts(prepared[TYPE_MELDING != "SLA"]), keys)
save_table("raw-prepared-comparison", raw_comparison[, .(keys = .N,
  raw_animals = sum(animals_first), prepared_animals = sum(animals_second), delta = sum(delta)),
  by = .(year = year(TRANSPORT_DATUM), TYPE_MELDING, kind)])
save_table("raw-prepared-differences-private", raw_comparison[kind != "equal"])
stopifnot(all(raw_comparison$kind == "equal"))
raw_exclusions <- channels[
  (TYPE_MELDING == "AAN" & (is.na(UBN_LEV) | is.na(UBN_AFN))) |
  (TYPE_MELDING == "IMP" & is.na(UBN_AFN)) |
  (TYPE_MELDING %in% c("EXP", "DOO") & is.na(UBN_LEV))]
save_table("raw-missing-endpoints", raw_exclusions[TYPE_MELDING != "AFV",
  .(rows = .N, animals = sum(AANTAL_DIEREN)), by = .(year = year(TRANSPORT_DATUM), TYPE_MELDING)])

# Derived slaughter rows are checked separately so they cannot inflate movement totals.
aan <- rebuilt[TYPE_MELDING == "AAN"]
incoming <- aan[, .(incoming = sum(animals)), by = .(holding = UBN_AFN)]
outgoing <- aan[, .(outgoing = sum(animals)), by = .(holding = UBN_LEV)]
terminal <- merge(incoming, outgoing, by = "holding", all.x = TRUE)
terminal[is.na(outgoing), outgoing := 0]
terminal <- terminal[incoming / (incoming + outgoing) > 0.995 & incoming > 100]
sla <- copy(aan[UBN_AFN %in% terminal$holding])
sla[, `:=`(TRANSPORT_DATUM = TRANSPORT_DATUM + 1, TYPE_MELDING = "SLA")]
sla_check <- compare(sla, group_counts(prepared[TYPE_MELDING == "SLA"]), keys)
stopifnot(all(sla_check$kind == "equal"))
feb_check <- compare(group_counts(february), group_counts(departures[TYPE_MELDING != "DOO"]), keys)
save_table("departure-extract-comparison", feb_check[, .(keys = .N, delta = sum(delta)),
  by = .(year = year(TRANSPORT_DATUM), TYPE_MELDING, kind)])

complete <- historical[!is.na(UBN_LEV) & !is.na(UBN_AFN)]
stopifnot(all(complete$TYPE_MELDING %in% c("AAN", "AFV")))
save_table("historical-notifications", historical[, .(rows = .N, animals = sum(AANTAL_DIEREN)),
  by = .(year = year(TRANSPORT_DATUM), TYPE_MELDING, complete = !is.na(UBN_LEV) & !is.na(UBN_AFN))])
pair_keys <- setdiff(keys, "TYPE_MELDING")
paired <- compare(group_counts(complete[TYPE_MELDING == "AAN"], pair_keys),
                  group_counts(complete[TYPE_MELDING == "AFV"], pair_keys), pair_keys)
save_table("historical-arrival-departure-overlap", paired[, .(keys = .N,
  arrival_animals = sum(animals_first), departure_animals = sum(animals_second),
  overlapping_volume = sum(pmin(animals_first, animals_second))),
  by = .(year = year(TRANSPORT_DATUM), kind)])
paired_sas <- compare(group_counts(eligible(arrivals)[TYPE_MELDING == "AAN"], pair_keys),
  group_counts(departures[TYPE_MELDING == "AFV" & !is.na(UBN_LEV) & !is.na(UBN_AFN)], pair_keys), pair_keys)
save_table("sas-arrival-departure-overlap", paired_sas[, .(keys = .N,
  arrival_animals = sum(animals_first), departure_animals = sum(animals_second),
  overlapping_volume = sum(pmin(animals_first, animals_second))),
  by = .(year = year(TRANSPORT_DATUM), kind)])
first_day <- min(historical$TRANSPORT_DATUM)
last_day <- max(historical$TRANSPORT_DATUM)
revision <- compare(group_counts(complete[TYPE_MELDING == "AAN"]),
                    aan[TRANSPORT_DATUM >= first_day & TRANSPORT_DATUM <= last_day], keys)
save_table("arrival-source-revisions", revision[, .(keys = .N,
  historical_animals = sum(animals_first), sas_animals = sum(animals_second), delta = sum(delta)),
  by = .(year = year(TRANSPORT_DATUM), kind)])
save_table("arrival-source-revisions-private", revision[kind != "equal"])
status <- complete[TYPE_MELDING == "AAN", .(has_VG = any(STATUS_MELDING == "VG")), by = keys]
annotated <- merge(revision, status, by = keys, all.x = TRUE)
save_table("arrival-revisions-by-historical-status", annotated[, .(keys = .N,
  historical_animals = sum(animals_first), sas_animals = sum(animals_second), delta = sum(delta)),
  by = .(year = year(TRANSPORT_DATUM), kind, has_VG)])
save_table("historical-status", historical[, .(rows = .N, animals = sum(AANTAL_DIEREN)),
  by = .(year = year(TRANSPORT_DATUM), TYPE_MELDING, STATUS_MELDING)])

# The pinned aggregation function must reproduce the supplied historical exports.
source(paths$historical_function)
history <- as.data.table(aggregate_by_time_unit("day", paths$historical_raw,
                       paths$historical_metadata, paths$historical_grid))
save_table("historical-regional-accounting", history[, .(animals = sum(AANTAL)),
  by = .(year = year(time), mapped = !is.na(COROP_LEV) & !is.na(COROP_AFN))])
periods <- c(daily = "day", weekly = "week", monthly = "month", yearly = "year")
regional_keys <- c("time", "COROP_LEV", "COROP_AFN")
aggregate_regions <- function(x, unit) {
  x[, .(animals = sum(AANTAL)),
    by = .(time = as.Date(floor_date(time, unit, week_start = 7)), COROP_LEV, COROP_AFN)]
}
history_checks <- lapply(names(periods), function(period) {
  actual <- fread(paths[[paste0("historical_", period)]])[, c(regional_keys, "AANTAL"), with = FALSE]
  actual[, time := as.Date(time)]
  setnames(actual, "AANTAL", "animals")
  check <- compare(aggregate_regions(history, periods[[period]]), actual, regional_keys)
  stopifnot(all(check$kind == "equal"))
  data.table(period = period, keys = nrow(check), animals = sum(check$animals_first), mismatches = 0)
})
save_table("historical-export-checks", rbindlist(history_checks))

policy <- config$exclusion
bundle <- read_json(paths$bundle, simplifyVector = FALSE)
years <- vapply(bundle$years, function(annual) as.integer(annual$year), integer(1))
stopifnot(identical(years, seq.int(2018L, max(years))), max(years) <= 2023L)
if ("regional_evidence" %in% names(paths)) {
  evidence <- read_json(paths$regional_evidence,simplifyVector=FALSE)
  stopifnot(evidence$format=="herdlink-region-evidence-v1",evidence$year==2018L,
    evidence$geography=="CBS COROP 2024",evidence$ledgerSha256==hashes$prepared,
    bundle$source$files$regional_evidence.json==hashes$regional_evidence)
  assignment <- rbindlist(lapply(evidence$assignments,function(row) data.table(ubn=row[[1]],region=row[[2]])))
  stopifnot(!anyDuplicated(assignment$ubn),all(assignment$ubn>0),all(assignment$ubn%%1==0),
            all(grepl("^CR(0[1-9]|[1-3][0-9]|40)$",assignment$region)))
  lookup <- setNames(assignment$region,as.character(assignment$ubn))
  for (suffix in c("LEV","AFN")) {
    region <- paste0("COROP_",suffix)
    holding <- paste0("UBN_",suffix)
    before <- prepared[year(TRANSPORT_DATUM)==2018L,get(region)]
    supplied <- lookup[as.character(prepared[year(TRANSPORT_DATUM)==2018L,get(holding)])]
    stopifnot(!any(!is.na(before) & !is.na(supplied) & before!=supplied))
    prepared[year(TRANSPORT_DATUM)==2018L,(region):=fifelse(!is.na(before),before,supplied)]
  }
}
excluded <- prepared[TYPE_MELDING == "AAN" & TRANSPORT_DATUM == as.Date(policy$date) &
  UBN_LEV == policy$sender & UBN_AFN == policy$receiver & AANTAL_DIEREN == policy$animals]
stopifnot(nrow(excluded) == 1L)
domestic <- prepared[TYPE_MELDING == "AAN" & year(TRANSPORT_DATUM) %in% years]
domestic <- domestic[!excluded, on = keys]
same_holding <- domestic[UBN_LEV == UBN_AFN]
domestic <- domestic[UBN_LEV != UBN_AFN]
mapped <- domestic[!is.na(COROP_LEV) & !is.na(COROP_AFN)]
regional <- mapped[, .(time = TRANSPORT_DATUM, COROP_LEV, COROP_AFN, AANTAL = AANTAL_DIEREN)]
app_checks <- lapply(names(periods), function(period) {
  actual <- fread(paths[[paste0("app_", period)]])[, c(regional_keys, "AANTAL"), with = FALSE]
  actual[, time := as.Date(time)]
  setnames(actual, "AANTAL", "animals")
  check <- compare(aggregate_regions(regional, periods[[period]]), actual, regional_keys)
  stopifnot(all(check$kind == "equal"))
  data.table(period = period, keys = nrow(check), animals = sum(check$animals_first), mismatches = 0)
})
save_table("app-export-checks", rbindlist(app_checks))
save_table("domestic-regional-accounting", domestic[, .(rows = .N, animals = sum(AANTAL_DIEREN)),
  by = .(year = year(TRANSPORT_DATUM), mapped = !is.na(COROP_LEV) & !is.na(COROP_AFN))])
save_table("common-period-regional-accounting", domestic[TRANSPORT_DATUM >= first_day & TRANSPORT_DATUM <= last_day,
  .(animals = sum(AANTAL_DIEREN)), by = .(year = year(TRANSPORT_DATUM), mapped = !is.na(COROP_LEV) & !is.na(COROP_AFN))])

boundary <- prepared[TYPE_MELDING %in% c("IMP", "EXP") & year(TRANSPORT_DATUM) %in% years]
boundary[, region := fifelse(TYPE_MELDING == "IMP", COROP_AFN, COROP_LEV)]
boundary[is.na(region), region := "NL_UNMAPPED"]
expected_boundary <- boundary[, .(animals = sum(AANTAL_DIEREN)),
  by = .(day = as.character(TRANSPORT_DATUM), channel = fifelse(TYPE_MELDING == "IMP", "imports", "exports"), region)]
actual_boundary <- rbindlist(lapply(bundle$boundaryRows, function(row)
  data.table(day = row[[1]], channel = row[[2]], region = row[[3]], animals = row[[4]])))
boundary_check <- compare(expected_boundary, actual_boundary, c("day", "channel", "region"))
stopifnot(all(boundary_check$kind == "equal"))
daily <- rbindlist(list(
  domestic[, .(TRANSPORT_DATUM, channel = "domestic", sender = UBN_LEV, receiver = UBN_AFN, AANTAL_DIEREN)],
  boundary[, .(TRANSPORT_DATUM, channel = fifelse(TYPE_MELDING == "IMP", "imports", "exports"),
               sender = UBN_LEV, receiver = UBN_AFN, AANTAL_DIEREN)]))
daily <- daily[, .(animals = sum(AANTAL_DIEREN)), by = .(TRANSPORT_DATUM, channel, sender, receiver)]
daily <- daily[, .(animals = sum(animals), contacts = .N), by = .(day = as.character(TRANSPORT_DATUM), channel)]
calendar <- rbindlist(lapply(bundle$years, function(annual) rbindlist(lapply(annual$days, function(day) {
  rbindlist(lapply(c("domestic", "imports", "exports"), function(channel)
    data.table(day = day$date, channel = channel, animals = day[[channel]]$animals, contacts = day[[channel]]$contacts)))
}))))
calendar_check <- merge(calendar, daily, by = c("day", "channel"), all = TRUE, suffixes = c("_saved", "_raw"))
calendar_check[is.na(animals_raw), `:=`(animals_raw = 0, contacts_raw = 0)]
calendar_days <- sum(as.Date(paste0(years + 1L, "-01-01")) - as.Date(paste0(years, "-01-01")))
stopifnot(nrow(calendar_check) == as.integer(calendar_days) * 3L, !anyNA(calendar_check),
          all(calendar_check$animals_saved == calendar_check$animals_raw),
          all(calendar_check$contacts_saved == calendar_check$contacts_raw))
save_table("boundary-regional-accounting", boundary[, .(animals = sum(AANTAL_DIEREN)),
  by = .(year = year(TRANSPORT_DATUM), TYPE_MELDING, mapped = region != "NL_UNMAPPED")])

anomaly_day <- as.Date("2021-12-20")
large <- historical[TRANSPORT_DATUM == anomaly_day & AANTAL_DIEREN > 10000]
save_table("2021-large-historical-private", large)
matching <- channels[unique(large[, ..pair_keys]), on = pair_keys, nomatch = 0]
save_table("2021-large-sas-private", matching)
save_table("2021-large-notifications", rbindlist(list(
  large[, .(source = "2022_csv", TYPE_MELDING, AANTAL_DIEREN, STATUS_MELDING)],
  matching[, .(source = "sas", TYPE_MELDING, AANTAL_DIEREN, STATUS_MELDING)])))
save_table("2018-excluded-pair", channels[excluded[, ..pair_keys], on = pair_keys, nomatch = 0,
  .(TYPE_MELDING, AANTAL_DIEREN, STATUS_MELDING)])
save_table("2021-regional-route", prepared[TRANSPORT_DATUM == anomaly_day & TYPE_MELDING == "AAN" &
  COROP_LEV == "CR35" & COROP_AFN == "CR15", .(animals = sum(AANTAL_DIEREN), rows = .N)])
stopifnot(identical(hashes, lapply(paths, sha)))
receipt <- list(status = "PASS", input_sha256 = hashes, config_sha256 = sha(args[1]),
  script_sha256 = sha(sub("^--file=", "", commandArgs()[grepl("^--file=", commandArgs())])),
  completed_utc = format(Sys.time(), tz = "UTC", usetz = TRUE),
  bundle_years = years,
  raw_prepared_keys = nrow(raw_comparison), derived_sla_keys = nrow(sla_check),
  regional_boundary_keys = nrow(boundary_check), daily_channel_checks = nrow(calendar_check),
  same_holding_rows = nrow(same_holding), same_holding_animals = sum(same_holding$AANTAL_DIEREN),
  historical_start = as.character(first_day), historical_end = as.character(last_day),
  input_unchanged = TRUE, reconstruction = "Exact integer equality of all compared keys and weights")
write_json(receipt, file.path(out, "receipt.json"), pretty = TRUE, auto_unbox = TRUE)
writeLines(capture.output(sessionInfo()), file.path(out, "session-info.txt"))
cat("PASS: raw records, derived SLA, historical exports, application exports and international counts\n")
