/**
 * export_looker_studio.js
 * ------------------------------------------------------------
 * Automates exporting a specific, named set of tables from a
 * Looker Studio (Data Studio) report to CSV, using your real
 * Chrome browser and profile.
 *
 * SETUP (one time):
 *   1. Install Node.js (https://nodejs.org) if you don't have it.
 *   2. Make sure Google Chrome (the real browser, not just Chromium)
 *      is installed on this machine.
 *   3. In a terminal, in this folder, run:
 *        npm init -y
 *        npm install playwright
 *        npx playwright install chromium
 *
 * FIRST RUN (log in once):
 *   node export_looker_studio.js
 *   -> A real Chrome window opens under a dedicated automation profile
 *      (./chrome-profile). Log into Google manually the first time.
 *      Once the report is visible, come back to the terminal and press Enter.
 *      This profile is reused on every future run.
 *
 * NORMAL RUN (export the configured tables):
 *   node export_looker_studio.js
 *   -> For each tab needed, sets the date filter to
 *      [1st of current month -> yesterday], then exports each table
 *      listed in TABLES_TO_EXPORT into ./exports/.
 *
 * DEBUG / INSPECT RUN (dump rendered HTML for selector work):
 *   node export_looker_studio.js --dump-html
 *   -> Navigates to every tab in REPORT_PAGES and saves the fully
 *      rendered HTML to ./debug/<tab_name>.html so you can read the
 *      real DOM (class names, aria-labels, section headings, table
 *      titles) before writing/adjusting selectors. Use this same
 *      workflow whenever you add a new table to TABLES_TO_EXPORT.
 *
 *   Optional: --dump-only=deep_dive,quick_look to limit which tabs.
 *
 * IMPORTANT:
 *   Looker Studio's DOM structure can shift by version/chart type, so
 *   the selectors in the SELECTORS section may need small tweaks. The
 *   --dump-html mode above is the tool for figuring out what changed.
 * ------------------------------------------------------------
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// ------------------------------------------------------------
// REPORT_PAGES — one entry per TAB of the report.
// The page ID after "/page/" differs per tab; the "?params=..." part
// carries the shared filter state and must be kept.
// ------------------------------------------------------------
const REPORT_PAGES = [
  { name: "quick_look",    url: "https://datastudio.google.com/u/0/reporting/fb66dde2-f724-4219-9e50-45e46400073c/page/NMmkC?params=%7B%22df1310%22:%22include%25EE%2580%25800%25EE%2580%2580IN%25EE%2580%2580Conquest%25EE%2580%2580IVR1%25EE%2580%2580Inbound%2520Energy%22,%22df1222%22:%22include%25EE%2580%25800%25EE%2580%2580IN%25EE%2580%2580ahmed_hichri%25EE%2580%2580farah_boumaiza%25EE%2580%2580islem_mejri%25EE%2580%2580melek_bouzaien%25EE%2580%2580mubula_credick%22,%22df1250%22:%22include%25EE%2580%25800%25EE%2580%2580IN%25EE%2580%2580%25C3%2598%2520action%2520requise%22,%22df834%22:%22include%25EE%2580%25800%25EE%2580%2580IN%25EE%2580%2580Inbound%2520Energy%22,%22df838%22:%22include%25EE%2580%25800%25EE%2580%2580IN%25EE%2580%2580Inbound%2520Energy%22,%22df1327%22:%22include%25EE%2580%25800%25EE%2580%2580IN%25EE%2580%2580Inbound%2520Energy%25EE%2580%2580Conquest%22,%22df853%22:%22include%25EE%2580%25800%25EE%2580%2580IN%25EE%2580%2580Inbound%2520Energy%22,%22df907%22:%22include%25EE%2580%25800%25EE%2580%2580IN%25EE%2580%2580IVR1%25EE%2580%2580Inbound%2520Energy%22,%22df959%22:%22include%25EE%2580%25800%25EE%2580%2580IN%25EE%2580%2580Inbound%2520Energy%22%7D" },
  { name: "table_view",    url: "https://datastudio.google.com/u/0/reporting/fb66dde2-f724-4219-9e50-45e46400073c/page/p_z9iueofbyc?params=%7B%22df1310%22:%22include%25EE%2580%25800%25EE%2580%2580IN%25EE%2580%2580Conquest%25EE%2580%2580IVR1%25EE%2580%2580Inbound%2520Energy%22,%22df1222%22:%22include%25EE%2580%25800%25EE%2580%2580IN%25EE%2580%2580ahmed_hichri%25EE%2580%2580farah_boumaiza%25EE%2580%2580islem_mejri%25EE%2580%2580melek_bouzaien%25EE%2580%2580mubula_credick%22,%22df1250%22:%22include%25EE%2580%25800%25EE%2580%2580IN%25EE%2580%2580%25C3%2598%2520action%2520requise%22,%22df834%22:%22include%25EE%2580%25800%25EE%2580%2580IN%25EE%2580%2580Inbound%2520Energy%22,%22df838%22:%22include%25EE%2580%25800%25EE%2580%2580IN%25EE%2580%2580Inbound%2520Energy%22,%22df1327%22:%22include%25EE%2580%25800%25EE%2580%2580IN%25EE%2580%2580Inbound%2520Energy%25EE%2580%2580Conquest%22,%22df853%22:%22include%25EE%2580%25800%25EE%2580%2580IN%25EE%2580%2580Inbound%2520Energy%22,%22df907%22:%22include%25EE%2580%25800%25EE%2580%2580IN%25EE%2580%2580IVR1%25EE%2580%2580Inbound%2520Energy%22,%22df959%22:%22include%25EE%2580%25800%25EE%2580%2580IN%25EE%2580%2580Inbound%2520Energy%22%7D" },
  { name: "deep_dive",     url: "https://datastudio.google.com/u/0/reporting/fb66dde2-f724-4219-9e50-45e46400073c/page/p_9tm1hx5avc?params=%7B%22df1310%22:%22include%25EE%2580%25800%25EE%2580%2580IN%25EE%2580%2580Conquest%25EE%2580%2580IVR1%25EE%2580%2580Inbound%2520Energy%22,%22df1222%22:%22include%25EE%2580%25800%25EE%2580%2580IN%25EE%2580%2580ahmed_hichri%25EE%2580%2580farah_boumaiza%25EE%2580%2580islem_mejri%25EE%2580%2580melek_bouzaien%25EE%2580%2580mubula_credick%22,%22df1250%22:%22include%25EE%2580%25800%25EE%2580%2580IN%25EE%2580%2580%25C3%2598%2520action%2520requise%22,%22df834%22:%22include%25EE%2580%25800%25EE%2580%2580IN%25EE%2580%2580Inbound%2520Energy%22,%22df838%22:%22include%25EE%2580%25800%25EE%2580%2580IN%25EE%2580%2580Inbound%2520Energy%22,%22df1327%22:%22include%25EE%2580%25800%25EE%2580%2580IN%25EE%2580%2580Inbound%2520Energy%25EE%2580%2580Conquest%22,%22df853%22:%22include%25EE%2580%25800%25EE%2580%2580IN%25EE%2580%2580Inbound%2520Energy%22,%22df907%22:%22include%25EE%2580%25800%25EE%2580%2580IN%25EE%2580%2580IVR1%25EE%2580%2580Inbound%2520Energy%22,%22df959%22:%22include%25EE%2580%25800%25EE%2580%2580IN%25EE%2580%2580Inbound%2520Energy%22%7D" },
  { name: "coach_attribution", url: "https://datastudio.google.com/u/0/reporting/fb66dde2-f724-4219-9e50-45e46400073c/page/p_s8j6xy8j0d?params=%7B%22df1310%22:%22include%25EE%2580%25800%25EE%2580%2580IN%25EE%2580%2580Conquest%25EE%2580%2580IVR1%25EE%2580%2580Inbound%2520Energy%22,%22df1222%22:%22include%25EE%2580%25800%25EE%2580%2580IN%25EE%2580%2580ahmed_hichri%25EE%2580%2580farah_boumaiza%25EE%2580%2580islem_mejri%25EE%2580%2580melek_bouzaien%25EE%2580%2580mubula_credick%22,%22df1250%22:%22include%25EE%2580%25800%25EE%2580%2580IN%25EE%2580%2580%25C3%2598%2520action%2520requise%22,%22df834%22:%22include%25EE%2580%25800%25EE%2580%2580IN%25EE%2580%2580Inbound%2520Energy%22,%22df838%22:%22include%25EE%2580%25800%25EE%2580%2580IN%25EE%2580%2580Inbound%2520Energy%22,%22df1327%22:%22include%25EE%2580%25800%25EE%2580%2580IN%25EE%2580%2580Inbound%2520Energy%25EE%2580%2580Conquest%22,%22df853%22:%22include%25EE%2580%25800%25EE%2580%2580IN%25EE%2580%2580Inbound%2520Energy%22,%22df907%22:%22include%25EE%2580%25800%25EE%2580%2580IN%25EE%2580%2580IVR1%25EE%2580%2580Inbound%2520Energy%22,%22df959%22:%22include%25EE%2580%25800%25EE%2580%2580IN%25EE%2580%2580Inbound%2520Energy%22%7D" },
];

// ------------------------------------------------------------
// TABLES_TO_EXPORT — the whole point of the script is config-driven:
// to add a table later, add one object here. No new functions needed.
//   tab:        must match a `name` in REPORT_PAGES
//   section:    a named sub-section heading to scope the search to,
//               or null if the table is not under a repeated section.
//   tableTitle: the visible title/header text of the table.
//   outputName: exact CSV filename to save under ./exports/.
// ------------------------------------------------------------
const TABLES_TO_EXPORT = [
  {
    tab: "quick_look",
    section: null,
    tableTitle: "Experts Point of View",
    outputName: "quick_look__experts_point_of_view.csv",
    // Extra metric columns to enable via the table's "Optional metrics" button
    // before exporting. Add more names to this array to include more columns.
    optionalMetrics: ["SPH_R_Profitability"],
  },
  {
    tab: "table_view",
    section: null,
    // First table on the Table View tab; its title text-box reads "Production".
    tableTitle: "Production",
    outputName: "table_view__production.csv",
  },
  {
    tab: "deep_dive",
    section: "Contracts Global",
    tableTitle: "Your Point of View: Experts",
    outputName: "deep_dive__contracts_global__your_point_of_view_experts.csv",
  },
  {
    tab: "deep_dive",
    section: "Others Focus",
    tableTitle: "Your Point of View: Experts",
    outputName: "deep_dive__others_focus__your_point_of_view_experts.csv",
  },
];

// ------------------------------------------------------------
// TAB_FILTERS — dimension-filter (drop-down) controls to narrow BEFORE
// exporting, per tab. Also config-driven: to constrain another filter later,
// add a { label, value } object under the relevant tab.
//   label: the control's field label as shown on the canvas, e.g.
//          "aggregate (high level)" or "agent_team" (case/spacing as rendered).
//   value: the single value to keep selected ("select only this value").
// NOTE: a tab can carry SEVERAL controls with the same label (repeated filter
// bars per section). We set EVERY matching control to the value so that
// whichever one feeds the exported table is constrained.
// ------------------------------------------------------------
const TAB_FILTERS = {
  quick_look: [
    { label: "aggregate (high level)", value: "Inbound Energy" },
  ],
  table_view: [
    { label: "aggregate (high level)", value: "Inbound Energy" },
    { label: "agent_team", value: "Inbound Energy" },
  ],
  deep_dive: [
    { label: "aggregate (high level)", value: "Inbound Energy" },
  ],
};

const CHROME_PROFILE_DIR = path.join(__dirname, 'chrome-profile');
// CSV exports go to the SHARED handoff folder that insert_inbound_data reads
// from — no manual copying. Overridable via KPI_SHARED_DIR (the orchestrator
// sets it); defaults to <repo>/shared, i.e. one level up from bpo_scrap/.
const EXPORT_DIR = process.env.KPI_SHARED_DIR
  ? path.resolve(process.env.KPI_SHARED_DIR)
  : path.join(__dirname, '..', 'shared');
const DEBUG_DIR = path.join(__dirname, 'debug');

// ------------------------------------------------------------
// Chrome executable path per OS. Leave a value empty to let Playwright's
// channel:'chrome' locate the installed Chrome automatically (works on both
// Linux and Windows). Fill in an explicit path only if that auto-lookup fails
// on a given machine, e.g.:
//   windows: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
//   linux:   '/usr/bin/google-chrome'
// Selected with --os=windows|linux; defaults to auto-detection.
// ------------------------------------------------------------
const CHROME_PATHS = {
  linux: '',
  windows: '',
};

// ------------------------------------------------------------
// SELECTORS — adjust these if something stops matching.
// Use `node export_looker_studio.js --dump-html` and read the saved
// HTML in ./debug/ to confirm the current markup.
// ------------------------------------------------------------
const SELECTORS = {
  // A report component wrapper. Every chart/table/textbox/control on the
  // Looker Studio canvas is one of these, absolutely positioned via inline
  // `top/left/width/height` (px). Those inline coords are the stable
  // "canvas coordinates" we use to associate a title with its table.
  componentWrapper: '.cdk-drag.lego-component-repeat',
  // A data table renders a component header carrying the `simple-table` class.
  tableHeader: '.lego-component-header.simple-table',
  // Title/section labels are plain text-box components.
  textbox: 'ng2-textbox-viewer',
  // The per-table "⋮" icon revealed on hover: aria-label "Show chart menu"
  // (tooltip "More"). Confirmed via live DOM inspection — NOT the report-level
  // "More report actions" kebab. Keep the fallbacks in case markup shifts.
  moreMenuButton: '[aria-label="Show chart menu"], .ng2-chart-menu-button, [aria-label="More options"], button[mattooltip="More"]',
  // The per-table "Optional metrics" button (adds/removes metric columns) and
  // the checkbox menu it opens (mat-checkbox items in a cdk overlay).
  optionalMetricsButton: '[aria-label="Optional metrics"], .metric-selector-button',
  optionalMetricsCheckbox: '.cdk-overlay-container mat-checkbox',
  // The chart menu is: "Export chart..." (a submenu) -> "Export data" -> dialog.
  // These are the menu items in the CDK overlay after opening the kebab.
  menuItem: '.cdk-overlay-container [role="menuitem"], .cdk-overlay-container .mat-mdc-menu-item',
  exportSubmenuTrigger: 'Export chart', // hasText for the "Export chart..." submenu
  exportDataItem: 'Export data',        // hasText for the CSV export entry in the submenu
  // The "Export data" modal (Name field, CSV radio, Export button).
  exportDialog: '[role="dialog"], mat-dialog-container',
  // The blue "Export" confirm button INSIDE that modal.
  exportDialogConfirmButton: 'button:has-text("Export")',

  // --- Date range control + picker (confirmed via live inspection) ---
  // The date-range control button. A page can carry several; the MAIN filter
  // (the "Default period: Yesterday" one) is the shortest (height ~40) and
  // topmost — see pickMainDateControl().
  dateControlButton: 'ng2-date-range-picker button.canvas-date-input',
  // The two calendars inside the picker overlay: start (left) and end (right).
  startCalendar: '.cdk-overlay-container .start-date-picker',
  endCalendar: '.cdk-overlay-container .end-date-picker',
  // Month/year header button and prev/next arrows inside a calendar.
  calendarPeriodButton: '.mat-calendar-period-button',
  calendarPrevButton: '.mat-calendar-previous-button',
  calendarNextButton: '.mat-calendar-next-button',
  // Apply/Cancel in the picker overlay.
  pickerApplyButton: '.cdk-overlay-container button:has-text("Apply")',

  // --- Dimension-filter (drop-down list) controls + their panel ---
  // Each drop-down filter control on the canvas. Its visible text is like
  // "agent_team ▼" or "aggregate (high level): Inbound Energy (1) ▼".
  dimensionFilter: '.lego-component.dimension-filter',
  // The filter panel is an AngularJS-Material list (md-*), NOT a cdk overlay.
  filterSearchInput: 'input[aria-label="Type to search"], input[placeholder="Type to search"]',
  // One row per value; contains an md-checkbox and a "only" quick-select link.
  filterOptionRow: '.item',
  filterOnlyLink: '.only', // "select only this value" link inside a row
};

// Month labels used to (a) build day cell aria-labels ("1 Jul 2026") and
// (b) match the calendar header ("JUL 2026").
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// A day cell's aria-label, e.g. "1 Jul 2026" (no leading zero, capitalized month).
const fmtDayAria = (d) => `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
// The calendar header label, e.g. "JUL 2026".
const fmtMonthHeader = (d) => `${MONTHS_SHORT[d.getMonth()].toUpperCase()} ${d.getFullYear()}`;
// Comparable month index for navigation direction.
const monthIndex = (year, month0) => year * 12 + month0;

// Parse minimal CLI flags.
const ARGV = process.argv.slice(2);
const DUMP_HTML = ARGV.includes('--dump-html');
const DUMP_ONLY = (ARGV.find(a => a.startsWith('--dump-only=')) || '')
  .replace('--dump-only=', '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);
// Unattended run (e.g. scheduled task): skip the one-time "press Enter" login
// pause and rely on the persistent chrome-profile session.
const UNATTENDED = ARGV.includes('--unattended');
// Explicit OS selector for the Chrome path map; defaults to auto-detection.
const OS_ARG = (ARGV.find(a => a.startsWith('--os=')) || '').replace('--os=', '').trim();

/** Resolve the effective OS: explicit --os wins, else detect from platform. */
function resolveOs() {
  if (OS_ARG === 'windows' || OS_ARG === 'linux') return OS_ARG;
  return process.platform === 'win32' ? 'windows' : 'linux';
}

// ============================================================
// Date helpers
// ============================================================

/**
 * Returns { start, end } Date objects for [1st of current month, yesterday].
 * Computed at runtime so the range is always correct on any future run.
 */
function getMonthToDateMinusOneRange(now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  return { start, end };
}

// ============================================================
// Reusable helpers
// ============================================================

/**
 * Dump the fully rendered HTML of the current page to ./debug/<filename>.
 * Kept as a first-class utility because the inspect-first workflow is
 * needed every time a new table/section is added to TABLES_TO_EXPORT.
 */
async function dumpPageHtml(page, filename) {
  if (!fs.existsSync(DEBUG_DIR)) fs.mkdirSync(DEBUG_DIR, { recursive: true });
  const html = await page.content();
  const outPath = path.join(DEBUG_DIR, filename);
  fs.writeFileSync(outPath, html, 'utf8');
  console.log(`   [dump] wrote ${html.length} bytes -> ${outPath}`);
  return outPath;
}

/**
 * Navigate to a tab URL and wait for the report charts to render.
 */
async function gotoTab(page, tab) {
  await page.goto(tab.url, { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(6000); // let Looker Studio finish drawing charts
}

/**
 * The page can hold several date-range controls (e.g. per-chart ones). The
 * MAIN report filter — the "Default period: Yesterday" control — is the
 * shortest (height ~40px) and topmost. Returns its locator (by index).
 */
async function pickMainDateControl(page) {
  const buttons = page.locator(SELECTORS.dateControlButton);
  const count = await buttons.count();
  if (!count) throw new Error('no date-range control found on page');
  let bestIdx = 0, bestH = Infinity, bestTop = Infinity;
  for (let i = 0; i < count; i++) {
    const box = await buttons.nth(i).boundingBox();
    if (!box) continue;
    // Prefer the smallest height; break ties by the topmost position.
    if (box.height < bestH - 1 || (Math.abs(box.height - bestH) <= 1 && box.y < bestTop)) {
      bestIdx = i; bestH = box.height; bestTop = box.y;
    }
  }
  return buttons.nth(bestIdx);
}

/**
 * Inside an open picker, navigate the given calendar (start or end wrapper)
 * until it shows the month/year of `targetDate`, then click that day cell.
 * Both our target dates normally sit in the currently-shown month, but we
 * navigate defensively so the function stays correct near month boundaries.
 */
async function selectDayInCalendar(page, calendarSelector, targetDate) {
  const calendar = page.locator(calendarSelector);
  const targetIdx = monthIndex(targetDate.getFullYear(), targetDate.getMonth());

  for (let guard = 0; guard < 24; guard++) {
    const header = (await calendar.locator(SELECTORS.calendarPeriodButton).first().innerText()).trim().toUpperCase();
    if (header === fmtMonthHeader(targetDate)) break;
    // Parse the shown "MON YYYY" header to decide direction.
    const [monStr, yrStr] = header.split(/\s+/);
    const shownIdx = monthIndex(parseInt(yrStr, 10), MONTHS_SHORT.findIndex(m => m.toUpperCase() === monStr));
    const arrow = targetIdx < shownIdx ? SELECTORS.calendarPrevButton : SELECTORS.calendarNextButton;
    await calendar.locator(arrow).first().click();
    await page.waitForTimeout(300);
  }

  // Day cells are buttons with aria-label like "1 Jul 2026".
  await calendar.locator(`button[aria-label="${fmtDayAria(targetDate)}"]`).first().click();
  await page.waitForTimeout(300);
}

/**
 * Sets the report's MAIN date-range filter to [1st of month -> yesterday].
 * Opens the picker, picks the start day in the left calendar and the end day
 * in the right calendar, applies, then verifies the control's label actually
 * changed (tables render from the applied filter, so we must confirm it stuck).
 */
async function setDateFilterToMonthToDateMinusOne(page) {
  const { start, end } = getMonthToDateMinusOneRange();
  console.log(`   [date] target range ${fmtDayAria(start)} -> ${fmtDayAria(end)}`);
  if (start > end) {
    // Only happens on the 1st of the month (yesterday < 1st) — degenerate range.
    console.log('   [date] WARNING: start is after end (today is the 1st?) — leaving filter as-is');
    return;
  }

  const control = await pickMainDateControl(page);
  const labelBefore = (await control.innerText()).replace(/\s+/g, ' ').trim();
  await control.scrollIntoViewIfNeeded();
  await control.click();

  // Wait for the picker overlay (two calendars) to appear.
  await page.waitForSelector('.cdk-overlay-container .mat-calendar', { timeout: 8000 });
  await page.waitForTimeout(600);

  await selectDayInCalendar(page, SELECTORS.startCalendar, start);
  await selectDayInCalendar(page, SELECTORS.endCalendar, end);
  await page.locator(SELECTORS.pickerApplyButton).first().click();
  await page.waitForTimeout(4000); // let charts re-query with the new range

  const labelAfter = (await control.innerText()).replace(/\s+/g, ' ').trim();
  const wantStart = fmtDayAria(start), wantEnd = fmtDayAria(end);
  const applied = labelAfter.includes(wantStart) && labelAfter.includes(wantEnd);
  console.log(`   [date] label: "${labelBefore}" -> "${labelAfter}"`);
  if (!applied) {
    throw new Error(`date filter did not apply (label still "${labelAfter}", expected to contain "${wantStart}" and "${wantEnd}")`);
  }
}

/**
 * Finds the table whose floating title matches `tableTitle`.
 *
 * Looker Studio table titles are SEPARATE text-box components sitting just
 * above their table on the canvas (not headers inside the table). So we:
 *   1. find the title text-box(es) matching `tableTitle`,
 *   2. if `sectionLabel` is given, keep only titles that appear AFTER that
 *      section heading (the same title repeats under several sections), and
 *      take the first one,
 *   3. pick the table component directly below that title (nearest one lower
 *      on the canvas that horizontally overlaps it).
 * The chosen table wrapper is tagged with data-export-target so we can return
 * a Playwright handle to it. Returns null if nothing matched.
 */
async function findTableByTitle(page, tableTitle, sectionLabel) {
  const marked = await page.evaluate(({ tableTitle, sectionLabel, wrapperClass }) => {
    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
    // Walk up to the positioned component wrapper and read its canvas coords.
    const wrapPos = (el) => {
      let p = el;
      while (p) {
        if (p.classList && p.classList.contains(wrapperClass)) {
          const s = p.getAttribute('style') || '';
          const g = (k) => { const m = s.match(new RegExp(k + ': (-?\\d+)px')); return m ? +m[1] : null; };
          return { top: g('top'), left: g('left'), width: g('width'), el: p };
        }
        p = p.parentElement;
      }
      return null;
    };

    // All title text-boxes matching the requested table title. A description
    // paragraph can also contain the words (e.g. "...production KPIs..."), so
    // prefer text-boxes whose text is EXACTLY the title (the real heading);
    // only if none is exact do we fall back to substring matches. This keeps
    // repeated titles (deep_dive) working while ignoring stray mentions.
    const titleCands = [...document.querySelectorAll('ng2-textbox-viewer')]
      .map((t) => ({ text: norm(t.innerText), t }))
      .filter((o) => o.text.includes(tableTitle))
      .map((o) => { const p = wrapPos(o.t); return p ? { ...p, text: o.text } : null; })
      .filter(Boolean);
    if (!titleCands.length) return { ok: false, why: 'title not found' };
    const exactTitles = titleCands.filter((c) => c.text === tableTitle);
    let titles = (exactTitles.length ? exactTitles : titleCands).slice().sort((a, b) => a.top - b.top);

    // Scope to a section: keep titles below the section heading.
    if (sectionLabel) {
      // Text-boxes containing the label — but a long "Summary of the page"
      // description paragraph can also contain the words. So prefer the box
      // whose text is EXACTLY the label (the real heading); if none is exact,
      // fall back to the shortest-text match (headings are short paragraphs
      // long). This avoids scoping to a description that merely mentions it.
      const cands = [...document.querySelectorAll('ng2-textbox-viewer')]
        .map((t) => ({ text: norm(t.innerText), t }))
        .filter((o) => o.text.includes(sectionLabel))
        .map((o) => { const p = wrapPos(o.t); return p ? { ...p, text: o.text } : null; })
        .filter(Boolean);
      if (!cands.length) return { ok: false, why: 'section not found' };
      const exact = cands.filter((c) => c.text === sectionLabel);
      const pool = exact.length ? exact : cands.slice().sort((a, b) => a.text.length - b.text.length).slice(0, 1);
      const sTop = pool.sort((a, b) => a.top - b.top)[0].top;
      titles = titles.filter((t) => t.top > sTop);
      if (!titles.length) return { ok: false, why: 'no title under section' };
    }
    const title = titles[0];

    // Nearest table component below the title with horizontal overlap.
    const tables = [...document.querySelectorAll('.lego-component-header.simple-table')]
      .map(wrapPos).filter(Boolean);
    let best = null, bestDelta = Infinity;
    for (const tb of tables) {
      const delta = tb.top - title.top;
      const overlap = Math.min(tb.left + tb.width, title.left + title.width) - Math.max(tb.left, title.left);
      if (delta > 0 && overlap > 0 && delta < bestDelta) { bestDelta = delta; best = tb; }
    }
    if (!best) return { ok: false, why: 'no table below title' };

    document.querySelectorAll('[data-export-target]').forEach((e) => e.removeAttribute('data-export-target'));
    best.el.setAttribute('data-export-target', '1');
    return { ok: true, titleTop: title.top, tableTop: best.top, delta: bestDelta };
  }, { tableTitle, sectionLabel, wrapperClass: 'lego-component-repeat' });

  if (!marked.ok) {
    console.log(`   [find] ${marked.why}`);
    return null;
  }
  console.log(`   [find] matched (title@${marked.titleTop}px, table@${marked.tableTop}px, gap ${marked.delta}px)`);
  return page.locator('[data-export-target="1"]');
}

/**
 * Runs the working hover -> kebab -> Export -> confirm-CSV flow on a
 * specific table element and saves the download to outputPath.
 */
/**
 * Enables extra metric columns on a table via its "Optional metrics" button.
 * Opens the checkbox menu and ticks each requested metric (idempotent — skips
 * ones already ticked), then closes the menu so the table re-renders with the
 * new column(s) before export.
 */
async function addOptionalMetrics(page, tableTile, metrics) {
  await tableTile.scrollIntoViewIfNeeded();
  await tableTile.hover(); // reveal the header buttons
  await page.waitForTimeout(400);
  await tableTile.locator(SELECTORS.optionalMetricsButton).first().click();
  await page.waitForSelector(SELECTORS.optionalMetricsCheckbox, { timeout: 5000 });

  const items = page.locator(SELECTORS.optionalMetricsCheckbox);
  const count = await items.count();
  for (const name of metrics) {
    // Scan menu items and match the checkbox whose label is exactly the metric.
    let item = null;
    for (let i = 0; i < count; i++) {
      const txt = (await items.nth(i).innerText()).replace(/\s+/g, ' ').trim();
      if (txt === name) { item = items.nth(i); break; }
    }
    if (!item) throw new Error(`optional metric "${name}" not found in menu`);
    await item.scrollIntoViewIfNeeded();
    const input = item.locator('input[type="checkbox"]');
    if (await input.isChecked()) {
      console.log(`   [metric] "${name}" already enabled`);
      continue;
    }
    await item.click();
    console.log(`   [metric] enabled "${name}"`);
    await page.waitForTimeout(800);
  }

  await page.keyboard.press('Escape').catch(() => {}); // close the menu
  await page.waitForTimeout(1500); // let the table re-render with the new column(s)
}

async function exportTable(page, tableTile, outputPath) {
  await tableTile.scrollIntoViewIfNeeded();
  await tableTile.hover(); // reveals the "⋮" chart-menu icon
  await page.waitForTimeout(500);

  // 1) Open the per-table chart menu ("Show chart menu").
  await tableTile.locator(SELECTORS.moreMenuButton).first().click();
  await page.waitForSelector(SELECTORS.menuItem, { timeout: 5000 });

  // 2) The "Export" entry is a submenu ("Export chart...") -> open it, then
  //    click "Export data" (the CSV path). Hover the submenu trigger so the
  //    submenu reliably expands, then click the data item.
  const submenuTrigger = page.locator(SELECTORS.menuItem, { hasText: SELECTORS.exportSubmenuTrigger }).first();
  await submenuTrigger.hover();
  await submenuTrigger.click();
  const exportDataItem = page.locator(SELECTORS.menuItem, { hasText: SELECTORS.exportDataItem }).first();
  await exportDataItem.waitFor({ state: 'visible', timeout: 5000 });
  await exportDataItem.click();

  // 3) The "Export data" modal opens. Make sure the CSV format is selected
  //    (it is the default, but be explicit) and confirm.
  const dialog = page.locator(SELECTORS.exportDialog).first();
  await dialog.waitFor({ state: 'visible', timeout: 6000 });
  const csvRadio = dialog.locator('mat-radio-button, [role="radio"]')
    .filter({ hasText: /^CSV$/ }).first();
  if (await csvRadio.count()) await csvRadio.click().catch(() => {});

  const confirmButton = dialog.locator(SELECTORS.exportDialogConfirmButton).last();
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 25000 }),
    confirmButton.click(),
  ]);

  await download.saveAs(outputPath);

  // Make sure the modal is dismissed before the next table.
  await dismissOverlays(page);
  return outputPath;
}

/**
 * Dismiss any lingering CDK overlay (menu/dialog/backdrop) so it can't
 * intercept pointer events on the next table. Safe to call when nothing
 * is open.
 */
async function dismissOverlays(page) {
  for (let i = 0; i < 3; i++) {
    const backdrop = await page.locator('.cdk-overlay-backdrop').count();
    const dialog = await page.locator(SELECTORS.exportDialog).count();
    // The dimension-filter dropdown is an md-* panel (not a cdk overlay), so
    // check its search input too — otherwise a lingering filter panel could
    // intercept the next control's clicks.
    const filterPanel = await page.locator(SELECTORS.filterSearchInput).count();
    if (!backdrop && !dialog && !filterPanel) break;
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(300);
}

// ============================================================
// Modes
// ============================================================

/**
 * --dump-html mode: navigate each (selected) tab and dump its HTML.
 */
async function runDumpMode(page) {
  const tabs = DUMP_ONLY.length
    ? REPORT_PAGES.filter(t => DUMP_ONLY.includes(t.name))
    : REPORT_PAGES;

  for (const tab of tabs) {
    console.log(`\n=== Dumping tab: ${tab.name} ===`);
    await gotoTab(page, tab);
    await dumpPageHtml(page, `${tab.name}.html`);
  }
  console.log('\nDump complete. Read the files in ./debug/ to confirm selectors.');
}

/**
 * Normal mode: for each configured table, ensure its tab is loaded with the
 * date filter applied, then export it. One try/catch per table so a single
 * failure never stops the run.
 */
/**
 * A filter control's visible text is "<label>[: <selection> (n)] ▼". This
 * extracts just the label part so we can match controls by their field label.
 */
function parseFilterLabel(text) {
  return (text || '').split(/[:▼]/)[0].trim();
}

/**
 * Opens a single drop-down filter control and selects ONLY `value` (using the
 * per-row "only" quick-select link, after narrowing via the search box).
 * `controlSelector` targets one specific control (by its stable cd-* class).
 */
async function setFilterOnlyValue(page, controlSelector, value) {
  const control = page.locator(controlSelector).first();
  await control.scrollIntoViewIfNeeded();
  const before = (await control.innerText()).replace(/\s+/g, ' ').trim();

  // Already exactly this single value? (e.g. "...: Inbound Energy (1) ▼") — skip.
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (new RegExp(`:\\s*${escaped}\\s*\\(1\\)`).test(before)) {
    console.log(`   [filter] "${before}" already = only "${value}", skipping`);
    return;
  }

  // One open->search->only->verify pass; returns the control's new text.
  const attempt = async () => {
    const box = await control.boundingBox();
    // Click near the control's left edge (over the label) to open its panel.
    await control.click({ position: { x: Math.min(25, box.width / 2), y: box.height / 2 } });

    const search = page.locator(SELECTORS.filterSearchInput).first();
    await search.waitFor({ state: 'visible', timeout: 6000 }); // panel actually opened
    await search.fill(value); // narrow the (virtualized) list so the row renders
    await page.waitForTimeout(1000);

    // Find the row for the exact value and click its "only" link.
    const row = page.locator(SELECTORS.filterOptionRow, {
      has: page.locator(`md-checkbox[aria-label="${value}"]`),
    }).first();
    await row.waitFor({ state: 'visible', timeout: 5000 });
    await row.hover();
    await row.locator(SELECTORS.filterOnlyLink).first().click();
    await page.waitForTimeout(1500); // let the filter apply / charts re-query

    await page.keyboard.press('Escape').catch(() => {}); // close the panel
    await page.waitForTimeout(1200);
    return (await control.innerText()).replace(/\s+/g, ' ').trim();
  };

  // Retry once — the first click occasionally only focuses the control.
  let after = await attempt();
  if (!after.includes(value)) {
    await dismissOverlays(page);
    after = await attempt();
  }

  console.log(`   [filter] "${before}" -> "${after}"`);
  if (!after.includes(value)) {
    throw new Error(`filter did not apply (still "${after}", expected to contain "${value}")`);
  }
}

/**
 * Applies every filter configured for `tabName` in TAB_FILTERS. For each spec,
 * sets ALL controls whose label matches (repeated filter bars) to only the
 * value. Controls are addressed by their stable cd-* class to avoid index
 * drift as the DOM re-renders after each applied filter.
 */
async function applyTabFilters(page, tabName) {
  const specs = TAB_FILTERS[tabName] || [];
  if (!specs.length) return;

  for (const spec of specs) {
    // Collect stable cd-* ids of controls matching this label (fresh each time).
    const cdIds = await page.evaluate(({ label }) => {
      const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const parse = (t) => norm(t).split(/[:▼]/)[0].trim();
      return [...document.querySelectorAll('.lego-component.dimension-filter')]
        .filter((el) => parse(el.innerText) === label)
        .map((el) => (el.className.match(/cd-\w+/) || [])[0])
        .filter(Boolean);
    }, { label: spec.label });

    if (!cdIds.length) {
      console.log(`   [filter] no control labelled "${spec.label}" found — skipping`);
      continue;
    }
    console.log(`   [filter] "${spec.label}" -> only "${spec.value}" (${cdIds.length} control${cdIds.length > 1 ? 's' : ''})`);
    for (const cd of cdIds) {
      try {
        await setFilterOnlyValue(page, `.lego-component.dimension-filter.${cd}`, spec.value);
      } catch (err) {
        console.log(`   [filter] control ${cd}: ${err.message}`);
      }
      await dismissOverlays(page);
    }
  }
}

async function runExportMode(page) {
  if (!fs.existsSync(EXPORT_DIR)) fs.mkdirSync(EXPORT_DIR, { recursive: true });

  const runStartIso = new Date().toISOString();
  let currentTab = null;   // avoid re-navigating/re-preparing the same tab
  let tabPrepared = false; // date filter + dimension filters applied for this tab
  const results = [];

  for (const entry of TABLES_TO_EXPORT) {
    const label = `[${entry.tab}]${entry.section ? ' › ' + entry.section : ''} › "${entry.tableTitle}"`;
    console.log(`\n--- Exporting ${label} ---`);
    try {
      // Clear any overlay left behind by a previous (possibly failed) table.
      await dismissOverlays(page);

      const tab = REPORT_PAGES.find(t => t.name === entry.tab);
      if (!tab) throw new Error(`tab "${entry.tab}" not found in REPORT_PAGES`);

      if (currentTab !== entry.tab) {
        console.log(`   [nav] loading tab "${entry.tab}"`);
        await gotoTab(page, tab);
        currentTab = entry.tab;
        tabPrepared = false;
      }

      // Prepare the tab once: set the date range, then narrow dimension
      // filters. Tables render from the applied filter state, so this must
      // happen before finding/exporting any table on the tab.
      if (!tabPrepared) {
        console.log(`   [date] applying month-to-date-minus-one filter`);
        await setDateFilterToMonthToDateMinusOne(page);
        console.log(`   [filter] applying tab filters`);
        await applyTabFilters(page, entry.tab);
        tabPrepared = true;
      }

      console.log(`   [find] locating table "${entry.tableTitle}"${entry.section ? ` in section "${entry.section}"` : ''}`);
      let tableHandle = await findTableByTitle(page, entry.tableTitle, entry.section);
      if (!tableHandle) throw new Error('table not found on page');

      // Optionally add extra metric columns before exporting this table.
      if (entry.optionalMetrics && entry.optionalMetrics.length) {
        console.log(`   [metric] adding optional metrics: ${entry.optionalMetrics.join(', ')}`);
        await addOptionalMetrics(page, tableHandle, entry.optionalMetrics);
        // The table re-renders with the new column(s), which detaches the old
        // marked element — re-locate it before exporting.
        await dismissOverlays(page);
        tableHandle = await findTableByTitle(page, entry.tableTitle, entry.section);
        if (!tableHandle) throw new Error('table not found after adding metrics');
      }

      const outPath = path.join(EXPORT_DIR, entry.outputName);
      console.log(`   [export] running export flow -> ${entry.outputName}`);
      await exportTable(page, tableHandle, outPath);
      console.log(`   ✅ SUCCESS: ${label} -> ${outPath}`);
      results.push({ label, ok: true, output: entry.outputName });
    } catch (err) {
      console.log(`   ❌ FAILED: ${label} — ${err.message}`);
      results.push({ label, ok: false, output: entry.outputName, error: err.message });
    }
    await page.waitForTimeout(1500);
  }

  console.log('\n=== Summary ===');
  for (const r of results) console.log(`   ${r.ok ? '✅' : '❌'} ${r.label}${r.ok ? '' : ' — ' + r.error}`);

  // Write the run manifest — the contract the orchestrator's gate reads to
  // decide whether every expected CSV downloaded before running the sync.
  const expected = TABLES_TO_EXPORT.map(t => t.outputName);
  const succeeded = results.filter(r => r.ok).map(r => r.output);
  const failed = results.filter(r => !r.ok).map(r => r.output);
  const manifestPath = path.join(EXPORT_DIR, 'manifest.json');
  fs.writeFileSync(
    manifestPath,
    JSON.stringify({ runAt: runStartIso, expected, succeeded, failed }, null, 2),
    'utf8'
  );
  console.log(`\n[manifest] wrote ${manifestPath}`);
  console.log(`[manifest] expected ${expected.length}, succeeded ${succeeded.length}, failed ${failed.length}`);

  // Signal partial/total failure to the orchestrator via a non-zero exit code.
  if (failed.length > 0) {
    process.exitCode = 1;
    console.log('[exit] one or more tables failed — exit code 1');
  }
}

// ============================================================
// Entry point
// ============================================================

async function main() {
  const os = resolveOs();
  const chromePath = CHROME_PATHS[os];
  const launchOpts = {
    headless: false,         // keep visible — needed for manual login/2FA
    acceptDownloads: true,
    // Force English so the date-picker labels ("JUL 2026", "1 Jul 2026") match
    // the English month names the date logic expects. On a French-locale machine
    // the picker renders "juil." etc. and date selection fails. `locale` sets
    // Accept-Language + JS locale; `--lang` sets Chrome's own UI language.
    locale: 'en-US',
    args: ['--disable-blink-features=AutomationControlled', '--lang=en-US'],
  };
  // Use an explicit Chrome path when one is configured for this OS; otherwise
  // let Playwright locate the installed Chrome via the 'chrome' channel.
  if (chromePath) {
    launchOpts.executablePath = chromePath;
  } else {
    launchOpts.channel = 'chrome';
  }
  console.log(`>> OS: ${os}${chromePath ? ` (chrome: ${chromePath})` : " (channel 'chrome')"}`);

  const context = await chromium.launchPersistentContext(CHROME_PROFILE_DIR, launchOpts);

  const page = context.pages()[0] || (await context.newPage());
  const firstUrl = REPORT_PAGES[0].url;

  await page.goto(firstUrl).catch(() => {});

  // Unattended mode (flag) or no interactive terminal (scheduled task): don't
  // block on Enter — the persistent chrome-profile already carries the logged-in
  // Google session. Otherwise pause for the one-time manual login.
  if (UNATTENDED || !process.stdin.isTTY) {
    console.log('>> Unattended: using saved chrome-profile session, skipping login prompt.');
    await page.waitForTimeout(6000); // let the first report settle before work
  } else {
    console.log('>> If this is the first run, log into Google in the window that opened.');
    console.log('>> Once the report is visible and loaded, come back here and press Enter.');
    await waitForEnter();
  }

  if (DUMP_HTML) {
    await runDumpMode(page);
  } else {
    await runExportMode(page);
  }

  console.log('\nDone.');
  await context.close();
}

function waitForEnter() {
  return new Promise((resolve) => {
    process.stdin.resume();
    process.stdin.once('data', () => {
      process.stdin.pause();
      resolve();
    });
  });
}

main();
