#!/bin/bash

set -euo pipefail

if ! which qpdf >/dev/null; then
  echo "error: qpdf must be installed to use this script. Try 'sudo apt install qpdf -y'?" >&2
  exit 1
fi

usage() {
  echo "Usage: $(basename $0) [--ban grayscale|rgb|cmyk]"
}

ban=""
declare -a inputs=()

while [[ $# -gt 0 ]]; do
  arg="$1"
  shift

  case "$arg" in
  -h | --help)
    usage
    exit 0
    ;;

  --ban)
    ban="$1"
    if [[ "$ban" != grayscale && "$ban" != rgb && "$ban" != cmyk ]]; then
      echo "error: invalid --ban value: $ban" >&2
      usage >&2
    fi
    shift
    ;;

  -*)
    echo "error: unexpected option: $arg" >&2
    usage >&2
    ;;

  *)
    inputs=("${inputs[@]}" "$arg")
    ;;
  esac
done

for input in "${inputs[@]}"; do
  tmpfile=$(mktemp)

  # Uncompress all streams so we can grep them.
  qpdf --qdf --object-streams=disable "$input" "$tmpfile"

  # Remove the tmpfile on exit.
  trap "rm $tmpfile" exit

  echo "Scanning for color space usage in: $input"
  echo

  search_op() {
    local label="$1"
    local pattern="$2"

    if grep -Eq "$pattern" "$tmpfile"; then
      echo "🔎 $label color operators found:"
      grep -En "$pattern" "$tmpfile"
      echo
      return 0
    else
      echo "No $label color operators found."
      echo
      return 1
    fi
  }

  # RGB: rg (fill), RG (stroke)
  if search_op "RGB (rg/RG)" '(\.|[[:digit:]])+\s+(\.|[[:digit:]])+\s+(\.|[[:digit:]])+\s+(rg|RG)\b'; then
    if [[ "$ban" == rgb ]]; then
      echo "❌ Banned colorspace found!" >&2
      exit 1
    fi
  fi

  # CMYK: k (fill), K (stroke)
  if search_op "CMYK (k/K)" '(\.|[[:digit:]])+\s+(\.|[[:digit:]])+\s+(\.|[[:digit:]])+\s+(k|K)\b'; then
    if [[ "$ban" == cmyk ]]; then
      echo "❌ Banned colorspace found!" >&2
      exit 1
    fi
  fi

  # Grayscale: g (fill), G (stroke)
  if search_op "Grayscale (g/G)" '(\.|[[:digit:]])+\s+(\.|[[:digit:]])+\s+(\.|[[:digit:]])+\s+(g|G)\b'; then
    if [[ "$ban" == grayscale ]]; then
      echo "❌ Banned colorspace found!" >&2
      exit 1
    fi
  fi
done
