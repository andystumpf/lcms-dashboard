// Attach the tested math library to window so classic dashboard scripts
// call one implementation instead of a second untested copy.
import * as DashboardMath from '../lib/dashboard-math.mjs';

window.LCMSMath = DashboardMath;
