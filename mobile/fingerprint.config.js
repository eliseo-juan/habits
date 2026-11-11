// Values that only configure *where* the app talks to (server URL, EAS project id) live in `extra` and come from
// the environment. They are not native code, so they must not change the runtime version: otherwise a build made
// with one set of variables would never match the OTAs published from CI with another.
const { SourceSkips } = require("@expo/fingerprint")

/** @type {import('@expo/fingerprint').Config} */
module.exports = {
  sourceSkips: SourceSkips.ExpoConfigExtraSection | SourceSkips.ExpoConfigEASProject,
}
