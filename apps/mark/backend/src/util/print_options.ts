/**
 * `raw` lpr options that pin the paper cassette (Tray 2) for prints sent to the
 * HP LaserJet Pro M404n.
 *
 * The M404n ships with its trays configured as "Any size", so a job that names
 * a specific paper size makes the printer stop and ask the operator to confirm
 * the loaded paper ("Load Tray 1 ... for 1-sided jobs press OK for available
 * paper"). Selecting Tray 2 explicitly makes the printer commit to the cassette
 * and print without prompting. This relies on the M404n's HP M404 PostScript
 * PPD, whose `*InputSlot Tray2` emits
 * `<</MediaPosition 0 /ManualFeed false>> setpagedevice` — a positive,
 * by-position tray selection the generic PostScript PPD cannot express.
 *
 * Apply this to every M404n print path EXCEPT the duplex, variable-size ballot
 * prints (bubble ballots and marks-on-preprinted-ballot overlays). Those run on
 * the M4001dn and want Auto (size-based) tray selection, so pinning a tray
 * there would be wrong. They also still use the generic PostScript PPD, where
 * "Tray2" is not a defined InputSlot choice and CUPS would simply ignore it —
 * but we keep it off those paths to be explicit about intent.
 *
 * If the M4001dn ever moves to its own model-specific PPD that defines a real
 * Tray2, revisit: a pinned tray is wrong for variable-size duplex.
 */
export const M404N_CASSETTE_RAW_OPTIONS: Record<string, string> = {
  InputSlot: 'Tray2',
};
