#!/usr/bin/env Rscript
# Recover missing 2018 regions from recorded holding coordinates.
suppressPackageStartupMessages({library(data.table);library(readxl);library(sf);library(jsonlite)})
setDTthreads(2)
Sys.umask("0077")
args <- commandArgs(trailingOnly=TRUE)
stopifnot(length(args)==2L, !dir.exists(args[2]))
config <- read_json(args[1],simplifyVector=TRUE)
paths <- config$paths
stopifnot(setequal(names(paths),c("prepared","giab2018","corop2024")))
sha <- function(path) {
  result <- system2("shasum",c("-a","256",shQuote(path)),stdout=TRUE)
  stopifnot(is.null(attr(result,"status")),length(result)==1L)
  substr(result,1,64)
}
hashes <- lapply(paths,sha)
stopifnot(identical(hashes,config$sha256))
out <- args[2]
dir.create(out,recursive=TRUE,mode="0700")
raw <- fread(paths$prepared,na.strings=c("","NA"))
annual <- raw[substr(TRANSPORT_DATUM,1,4)=="2018" & TYPE_MELDING %in% c("AAN","IMP","EXP")]
ids <- unique(c(annual[TYPE_MELDING %in% c("AAN","EXP") & is.na(COROP_LEV),UBN_LEV],
                annual[TYPE_MELDING %in% c("AAN","IMP") & is.na(COROP_AFN),UBN_AFN]))
stopifnot(!anyNA(ids),all(ids>0),all(ids%%1==0))
headers <- names(read_excel(paths$giab2018,sheet="OHV19check18",n_max=0))
giab <- withCallingHandlers(as.data.table(read_excel(paths$giab2018,sheet="OHV19check18",
  col_types=ifelse(headers %in% c("ubn","xco","yco"),"numeric","skip"))),warning=function(w) stop(w))
coords <- unique(giab[ubn %in% ids & is.finite(xco) & is.finite(yco) & xco>0 & yco>0,.(ubn,xco,yco)])
regions <- st_read(paths$corop2024,layer="coropgebied_gegeneraliseerd",quiet=TRUE)
stopifnot(nrow(coords)>0L,nrow(regions)==40L,st_crs(regions)$epsg==28992,all(st_is_valid(regions)),
          setequal(as.integer(regions$id),1:40))
hits <- st_intersects(st_as_sf(coords,coords=c("xco","yco"),crs=28992,remove=FALSE),regions)
coords[,region:=vapply(hits,function(hit) if(length(hit)==1L)
  sprintf("CR%02d",as.integer(regions$id[hit])) else NA_character_,character(1))]
holdings <- coords[,.(candidates=.N,all_assigned=all(!is.na(region)),regions=uniqueN(region),region=region[1]),by=ubn]
supported <- holdings[all_assigned & regions==1L,.(ubn,region)][order(ubn)]
stopifnot(!anyDuplicated(supported$ubn),all(grepl("^CR(0[1-9]|[1-3][0-9]|40)$",supported$region)))
lookup <- setNames(supported$region,as.character(supported$ubn))
annual[, mapped_before := fifelse(TYPE_MELDING=="IMP",!is.na(COROP_AFN),
                          fifelse(TYPE_MELDING=="EXP",!is.na(COROP_LEV),!is.na(COROP_LEV) & !is.na(COROP_AFN)))]
annual[is.na(COROP_LEV),COROP_LEV:=lookup[as.character(UBN_LEV)]]
annual[is.na(COROP_AFN),COROP_AFN:=lookup[as.character(UBN_AFN)]]
annual[, mapped_after := fifelse(TYPE_MELDING=="IMP",!is.na(COROP_AFN),
                         fifelse(TYPE_MELDING=="EXP",!is.na(COROP_LEV),!is.na(COROP_LEV) & !is.na(COROP_AFN)))]
stopifnot(all(annual[mapped_before==TRUE,mapped_after]))
summary <- annual[,.(groups=.N,animals=sum(AANTAL_DIEREN)),by=.(TYPE_MELDING,mapped_before,mapped_after)]
fwrite(coords,file.path(out,"coordinate-evidence-private.csv"))
fwrite(holdings,file.path(out,"holding-evidence-private.csv"))
fwrite(summary,file.path(out,"coverage.csv"))
script <- sub("^--file=","",commandArgs()[grepl("^--file=",commandArgs())])
evidence <- list(format="herdlink-region-evidence-v1",year=2018L,geography="CBS COROP 2024",
  ledgerSha256=hashes$prepared,
  sourceSha256=list(giab2018=hashes$giab2018,corop2024=hashes$corop2024,script=sha(script)),
  assignments=lapply(seq_len(nrow(supported)),function(i) list(supported$ubn[i],supported$region[i])))
stopifnot(identical(hashes,lapply(paths,sha)))
write_json(evidence,file.path(out,"region-evidence.json"),pretty=TRUE,auto_unbox=TRUE)
write_json(list(status="PASS",input_sha256=hashes,script_sha256=sha(script),config_sha256=sha(args[1]),
  affected_holdings=length(ids),supported_holdings=nrow(supported),sources_unchanged=TRUE,
  rule="Use 2018 holding coordinates on the application's 2024 COROP geography. Every available coordinate candidate must identify the same single region. Retain missing or conflicting evidence as unassigned."),
  file.path(out,"receipt.json"),pretty=TRUE,auto_unbox=TRUE)
file.copy(script,file.path(out,basename(script)))
writeLines(capture.output(sessionInfo()),file.path(out,"session-info.txt"))
print(summary)
