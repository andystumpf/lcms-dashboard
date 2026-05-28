// Empty schema-only skeleton. The dashboard NEVER ships with placeholder data.
// All values are populated at runtime by js/data-loader.js fetching /api/lcms (SQLite).
// (produced by the scraper/ pipeline against locator.lcms.org).
//
// If no scraped data is present, the dashboard surfaces an explicit empty state
// instead of falling back to fake numbers.
const LCMS = {
  summary: {
    congregations: null,
    baptizedMembers: null,
    communingMembers: null,
    avgWeeklyAttendance: null,
    totalGivingMillions: null,
    districts: null,
    schools: null,
    workers: null
  },
  yearly: {
    years: [],
    baptizedMembers: [],
    communingMembers: [],
    avgWeeklyAttendance: [],
    congregations: [],
    totalGivingMillions: [],
    atHomeMillions:      [],
    baptisms: [],
    infantBaptisms: [],
    adultBaptisms: [],
    confirmations: [],
    sundaySchool: [],
    newMembers: [],
    removals: []
  },
  districtColors: {},
  churches: [],
  districts: [],
  stateTop20: [],
  churchSizes: []
};
// Expose for scripts that check window.LCMS (const alone is not a window property).
window.LCMS = LCMS;
