#!/bin/bash

NUM_REPORTS=100
RECORDS_PER_REPORT=10000

echo "Generating $NUM_REPORTS cast vote record reports with $RECORDS_PER_REPORT records each..."

for REPORT_IDX in $( seq 0 $((NUM_REPORTS - 1)) )
do
    ./bin/generate \
        --electionPackage ../fixtures/data/electionTwoPartyPrimary/election-package.zip \
        --outputPath ../../apps/admin/backend/perf/fixtures/$RECORDS_PER_REPORT/$REPORT_IDX \
        --ballotIdPrefix $REPORT_IDX \
        --numBallots $RECORDS_PER_REPORT \
        --scannerIds scanner-$REPORT_IDX \
        --bmdBallots
done