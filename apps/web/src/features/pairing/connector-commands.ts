/* The connector's commands, as sidevoice-connector's README gives them: the npm package `sidevoice`, run with npx on
 * the machine where the agents run. The one place the page names them: the messages take them as a parameter. */

/** Installs (or updates) Sidevoice on that machine. */
export const CONNECTOR_INSTALL = "npx sidevoice install";

/** Prints a one-time code that pairs a device with that machine. */
export const CONNECTOR_PAIR_DEVICE = "npx sidevoice pair-device";
