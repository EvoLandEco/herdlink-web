#!/usr/bin/env Rscript
# Describe evidence shared by arrival and departure reports without choosing shipment identities.
suppressPackageStartupMessages({library(data.table); library(haven); library(jsonlite)})
setDTthreads(2)
args <- commandArgs(trailingOnly = TRUE)
stopifnot(length(args) == 2L, !file.exists(args[2]))
Sys.umask("0077")
dir.create(args[2], recursive = TRUE, mode = "0700")
cfg <- read_json(args[1], simplifyVector = TRUE)
out <- args[2]
save_table <- function(name, x) fwrite(x, file.path(out, paste0(name, ".csv")))
sha <- function(path) {
  result <- system2("shasum", c("-a", "256", shQuote(path)), stdout = TRUE)
  stopifnot(is.null(attr(result, "status")), length(result) == 1L)
  substr(result, 1, 64)
}
source_paths <- cfg$paths[c("arrivals", "departures", "prepared", "prepared_metadata", "bundle")]
hashes <- lapply(source_paths, sha)
year_of <- function(day) as.integer(format(day, "%Y"))
pair <- c("sender", "receiver")
day_key <- c(pair, "day")
read_reports <- function(path, kind) {
  x <- as.data.table(read_sas(path))
  labels <- lapply(x, function(column) attr(column, "label"))
  write_json(labels, file.path(out, paste0(kind, "-column-labels.json")), auto_unbox = TRUE, pretty = TRUE)
  x <- x[TYPE_MELDING == kind, .(id = ID, day = as.IDate(TRANSPORT_DATUM),
    sender = UBN_LEV, receiver = UBN_AFN, reported = as.IDate(DATUM_MELDING),
    animals = AANTAL_DIEREN, category = DIERSOORT, status = STATUS_MELDING)]
  stopifnot(!anyNA(x$id), !anyDuplicated(x$id), !anyNA(x$day), !anyNA(x$reported),
    !anyNA(x$animals), all(x$animals > 0 & x$animals %% 1 == 0),
    !anyNA(x$category), all(x$status %in% c("DG", "VG")))
  x
}
daily <- function(x) {
  signature <- x[, .(n = .N), by = .(sender, receiver, day, category, animals)]
  setorder(signature, sender, receiver, day, category, animals)
  signature <- signature[, .(signature = paste(category, animals, n, sep = ":", collapse = ";")), by = day_key]
  totals <- x[, .(animals = sum(animals), reports = .N, provisional = sum(status == "VG"),
    first_report = min(reported), last_report = max(reported)), by = day_key]
  merge(totals, signature, by = day_key)
}
classify <- function(a, d) {
  x <- merge(a, d, by = day_key, all = TRUE, suffixes = c("_AAN", "_AFV"))
  x[, class := fifelse(is.na(animals_AAN), "AFV_only",
    fifelse(is.na(animals_AFV), "AAN_only",
    fifelse(animals_AAN != animals_AFV, "quantity_conflict",
    fifelse(signature_AAN == signature_AFV, "same_report_multiset", "same_total_different_reports"))))]
  for (column in c("animals_AAN", "animals_AFV", "reports_AAN", "reports_AFV", "provisional_AAN", "provisional_AFV"))
    set(x, which(is.na(x[[column]])), column, 0)
  setorder(x, sender, receiver, day)
  x[, group_id := .I]
  x
}
toy <- data.table(id = 1:5, day = as.IDate("2020-01-01"), sender = 1,
  receiver = c(2, 2, 3, 4, NA), animals = c(10, 10, 30, 40, 1),
  category = 1, status = "DG", reported = as.IDate("2020-01-02"))
toy_departures <- copy(toy[1:4])
toy_departures[receiver == 3, animals := 31]
toy_departures[receiver == 4, day := day + 1]
toy_check <- classify(daily(toy[!is.na(receiver)]), daily(toy_departures))
stopifnot(identical(toy_check$class, c("same_report_multiset", "quantity_conflict", "AAN_only", "AFV_only")),
  toy_check$animals_AAN[1] == 20, toy_check$reports_AAN[1] == 2,
  sum(toy_check$animals_AAN) == 90, sum(toy_check$animals_AFV) == 91)
split_reports <- copy(toy[1:2])
split_reports[, animals := c(12, 8)]
stopifnot(classify(daily(toy[1:2]), daily(split_reports))$class == "same_total_different_reports")

a_raw <- read_reports(source_paths$arrivals, "AAN")
d_raw <- read_reports(source_paths$departures, "AFV")
shared_ids <- length(intersect(a_raw$id, d_raw$id))
stopifnot(shared_ids == 0L)
save_table("missing-endpoints", rbindlist(list(
  a_raw[is.na(sender) | is.na(receiver), .(channel = "AAN", reports = .N, animals = sum(animals)), by = .(year = year_of(day))],
  d_raw[is.na(sender) | is.na(receiver), .(channel = "AFV", reports = .N, animals = sum(animals)), by = .(year = year_of(day))])))
a <- a_raw[!is.na(sender) & !is.na(receiver)]
d <- d_raw[!is.na(sender) & !is.na(receiver)]
groups <- classify(daily(a), daily(d))
policy <- cfg$exclusion
quarantine <- groups[sender == policy$sender & receiver == policy$receiver & day == as.IDate(policy$date)]
stopifnot(nrow(quarantine) == 1L, quarantine$animals_AAN == policy$animals, quarantine$animals_AFV == 20)
groups[group_id == quarantine$group_id, class := "2018_quarantine"]
save_table("daily-classes", groups[, .(groups = .N, arrival_reports = sum(reports_AAN),
  departure_reports = sum(reports_AFV), arrival_animals = sum(animals_AAN), departure_animals = sum(animals_AFV),
  departure_surplus = sum(pmax(animals_AFV - animals_AAN, 0)), arrival_surplus = sum(pmax(animals_AAN - animals_AFV, 0))),
  by = .(year = year_of(day), class)])
save_table("unresolved-groups-private", groups[!class %in% c("same_report_multiset", "same_total_different_reports")])
stopifnot(sum(groups$animals_AAN) == sum(a$animals), sum(groups$animals_AFV) == sum(d$animals),
  sum(groups$reports_AAN) == nrow(a), sum(groups$reports_AFV) == nrow(d))

# Raw report quantities preserve repeated equal-sized loads within the same day.
report_key <- c(day_key, "category", "animals")
raw_overlap <- merge(a[, .(n_AAN = .N), by = report_key], d[, .(n_AFV = .N), by = report_key],
  by = report_key, all = TRUE)
raw_overlap[is.na(n_AAN), n_AAN := 0L]
raw_overlap[is.na(n_AFV), n_AFV := 0L]
raw_overlap[, paired := pmin(n_AAN, n_AFV)]
save_table("raw-report-overlap", raw_overlap[, .(paired_reports_per_channel = sum(paired),
  paired_animals_per_channel = sum(paired * animals), arrival_residual = sum((n_AAN - paired) * animals),
  departure_residual = sum((n_AFV - paired) * animals)), by = .(year = year_of(day))])

# Distances describe candidates; no nearest date is accepted as a match.
nearest <- function(query, reference) {
  ref <- reference[, .(sender, receiver, day, reference_day = day)]
  setkeyv(ref, day_key)
  before <- ref[query, on = day_key, roll = Inf]
  after <- ref[query, on = day_key, roll = -Inf]
  gap <- pmin(abs(as.integer(query$day - before$reference_day)),
              abs(as.integer(query$day - after$reference_day)), na.rm = TRUE)
  gap[!is.finite(gap)] <- NA_integer_
  gap
}
stopifnot(identical(nearest(data.table(sender = c(1, 9), receiver = 2, day = as.IDate("2020-01-03")),
  data.table(sender = 1, receiver = 2, day = as.IDate(c("2020-01-01", "2020-01-05")))), c(2L, NA_integer_)))
one_a <- groups[class == "AAN_only", .(sender, receiver, day, group_id, animals = animals_AAN,
  signature = signature_AAN, first_report = first_report_AAN, last_report = last_report_AAN, provisional = provisional_AAN)]
one_d <- groups[class == "AFV_only", .(sender, receiver, day, group_id, animals = animals_AFV,
  signature = signature_AFV, first_report = first_report_AFV, last_report = last_report_AFV, provisional = provisional_AFV)]
one_d[, nearest_arrival_days := nearest(.SD, groups[animals_AAN > 0])]
one_a[, nearest_departure_days := nearest(.SD, groups[animals_AFV > 0])]
gap_band <- function(x) fcase(is.na(x), "no_opposite_route", x == 1, "1_day", x <= 7, "2_to_7_days",
  x <= 30, "8_to_30_days", default = "over_30_days")
save_table("one-sided-nearest-dates", rbindlist(list(
  one_d[, .(channel = "AFV", groups = .N, animals = sum(animals)), by = .(year = year_of(day), gap = gap_band(nearest_arrival_days))],
  one_a[, .(channel = "AAN", groups = .N, animals = sum(animals)), by = .(year = year_of(day), gap = gap_band(nearest_departure_days))])))

candidates <- merge(one_a, one_d, by = c(pair, "animals"), suffixes = c("_AAN", "_AFV"), allow.cartesian = TRUE)
candidates[, `:=`(gap = as.integer(day_AAN - day_AFV), same_report_multiset = signature_AAN == signature_AFV,
  same_notification_span = first_report_AAN == first_report_AFV & last_report_AAN == last_report_AFV)]
candidates[, choices_for_departure := .N, by = group_id_AFV]
candidates[, choices_for_arrival := .N, by = group_id_AAN]
adjacent <- candidates[abs(gap) == 1]
adjacent[, choices_for_departure_1day := .N, by = group_id_AFV]
adjacent[, choices_for_arrival_1day := .N, by = group_id_AAN]
unique_adjacent <- adjacent[choices_for_departure_1day == 1 & choices_for_arrival_1day == 1 & same_report_multiset]
stopifnot(!anyDuplicated(unique_adjacent$group_id_AFV), !anyDuplicated(unique_adjacent$group_id_AAN),
          all(unique_adjacent$day_AAN != unique_adjacent$day_AFV))
candidate_summary <- candidates[, .(candidate_arrival_days = .N, nearest_equal_quantity_days = min(abs(gap)),
  identical_multiset_candidates = sum(same_report_multiset)), by = group_id_AFV]
one_d <- merge(one_d, candidate_summary, by.x = "group_id", by.y = "group_id_AFV", all.x = TRUE)
one_d[is.na(candidate_arrival_days), `:=`(candidate_arrival_days = 0L, identical_multiset_candidates = 0L)]
one_d[, adjacent_unique_candidate := group_id %in% unique_adjacent$group_id_AFV]
one_d[, evidence := fcase(is.na(nearest_arrival_days), "no_AAN_route_in_full_extract",
  adjacent_unique_candidate, "unique_adjacent_candidate_identical_reports",
  candidate_arrival_days > 0, "other_equal_total_candidate",
  default = "AAN_route_exists_no_equal_total_unpaired_candidate")]
save_table("departure-evidence", one_d[, .(groups = .N, animals = sum(animals), provisional_reports = sum(provisional)),
  by = .(year = year_of(day), evidence)])
save_table("departure-evidence-private", one_d)
save_table("date-shift-candidates-private", candidates)
save_table("adjacent-candidates", unique_adjacent[, .(pairs = .N, animals = sum(animals),
  same_notification_span = sum(same_notification_span), global_unique_pairs = sum(choices_for_arrival == 1 & choices_for_departure == 1)),
  by = .(year = year_of(day_AFV), arrival_minus_departure_days = gap)])
save_table("candidate-ambiguity", adjacent[, .(candidate_edges = .N),
  by = .(year = year_of(day_AFV), choices_for_arrival_1day, choices_for_departure_1day, same_report_multiset)])
save_table("absent-arrival-routes", one_d[is.na(nearest_arrival_days), .(routes = uniqueN(.SD, by = pair),
  groups = .N, animals = sum(animals)), by = .(year = year_of(day)), .SDcols = c(pair, "animals")])
absent <- d[one_d[is.na(nearest_arrival_days), ..day_key], on = day_key, nomatch = 0]
absent[, `:=`(receiver_has_arrivals = receiver %in% a_raw$receiver, self_move = sender == receiver)]
metadata <- fread(source_paths$prepared_metadata, select = c("ubn", "CR_code"))
stopifnot(!anyDuplicated(metadata$ubn))
mapped_holdings <- metadata[!is.na(CR_code), ubn]
absent[, mapped := sender %in% mapped_holdings & receiver %in% mapped_holdings]
save_table("absent-route-notifications", absent[, .(reports = .N, animals = sum(animals),
  daily_groups = uniqueN(.SD, by = day_key), recipients = uniqueN(receiver)),
  by = .(year = year_of(day), status, mapped, self_move, receiver_has_arrivals), .SDcols = c(day_key, "animals")])
save_table("absent-route-notifications-private", absent)
reversed <- merge(absent, a[, .(sender = receiver, receiver = sender, day, animals, category)],
  by = c(pair, "day", "animals", "category"), allow.cartesian = TRUE)
save_table("reversed-route-candidates", reversed[, .(candidate_links = .N, animals = sum(animals)), by = .(year = year_of(day))])

# Missing sender IDs cannot be filled from another report without an identity link.
incomplete_a <- a_raw[is.na(sender) & !is.na(receiver)]
incomplete_candidates <- merge(d[, .(sender, receiver, day, category, animals, departure_id = id)],
  incomplete_a[, .(receiver, day, category, animals, arrival_id = id)],
  by = c("receiver", "day", "category", "animals"), allow.cartesian = TRUE)
save_table("missing-sender-candidates", incomplete_candidates[, .(candidate_links = .N,
  arrival_reports = uniqueN(arrival_id), departure_reports = uniqueN(departure_id)), by = .(year = year_of(day))])
stopifnot(sum(one_d$animals) == groups[class == "AFV_only", sum(animals_AFV)],
  sum(one_a$animals) == groups[class == "AAN_only", sum(animals_AAN)], identical(hashes, lapply(source_paths, sha)))
script <- sub("^--file=", "", commandArgs()[grepl("^--file=", commandArgs())])
file.copy(script, file.path(out, "audit-source.R"), overwrite = FALSE)
receipt <- list(status = "PASS", completed_utc = format(Sys.time(), tz = "UTC", usetz = TRUE),
  source_sha256 = hashes, script_sha256 = sha(script), config_sha256 = sha(args[1]),
  shared_report_ids = shared_ids, arrival_rows = nrow(a_raw), departure_rows = nrow(d_raw),
  date_start = as.character(min(c(a$day, d$day))), date_end = as.character(max(c(a$day, d$day))),
  conservation = TRUE, adjacent_candidates_do_not_reuse_groups = TRUE,
  shipment_identity_proven = FALSE, application_modified = FALSE,
  interpretation = "One-day comparisons are diagnostics, not a shipment reconciliation rule.")
write_json(receipt, file.path(out, "receipt.json"), auto_unbox = TRUE, pretty = TRUE)
writeLines(capture.output(sessionInfo()), file.path(out, "session-info.txt"))
cat("PASS: source conservation, daily classifications, candidate uniqueness and unchanged inputs\n")
