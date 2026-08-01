/*
 * sheets-public.js -- read PUBLIC Google Sheets with no Google session.
 *
 * TEST-ONLY. Enabled by `?sheets=public` on /editor, and only honoured when
 * the server said the proxy exists (PUBLIC_SHEETS_PROXY, which src/server.js
 * only sets in development). Nothing here runs on a normal page load.
 *
 * ---------------------------------------------------------------------------
 * Why
 *
 * `load-spreadsheet` goes gdrive-sheets.js -> sheetsAPI -> gapi -> OAuth. With
 * nobody signed in, sheetsAPI rejects ("no gapi.client") and the program dies
 * at the load. That is most of the Bootstrap curriculum: ~76 of the 158
 * starter files open a sheet, and browser-test/curriculum could only check
 * them as far as "it compiled and got that far". The sheets themselves are
 * public -- the obstacle is auth and CORS, not permission -- so the server
 * fetches them instead (see the /test-only/gsheet routes in src/server.js).
 *
 * ---------------------------------------------------------------------------
 * What is real and what is not
 *
 * The one seam is `spreadsheets.get()`. sheets.js's `createAPI(spreadsheets)`
 * only needs that one method to READ, so this module supplies a stand-in
 * client that answers `get` with the same JSON the Sheets v4 API would return.
 * Everything after that point is the untouched shipping code:
 *
 *     Spreadsheet / Worksheet, unifyRows and its whole type-inference and
 *     error-reporting scheme, getAllCells, worksheetToTable,
 *     worksheetToLoadedTable, the sanitizers, the Pyret table construction.
 *
 * So a run through this path exercises the same column typing, the same
 * "All items in every column must have the same type" errors, and the same
 * table building as a signed-in student gets. What it does NOT cover is the
 * gapi transport and OAuth itself, and writes (a public sheet is read-only
 * here, so the write methods throw rather than pretend).
 *
 * ---------------------------------------------------------------------------
 * Fidelity of the data
 *
 * The proxy returns the visualization (gviz) table, which carries Google's own
 * per-column type and both the raw and the formatted value for every cell --
 * the same facts the Sheets API reports. So this maps rather than guesses:
 *
 *     gviz                        Sheets v4                       unifyRows
 *     type "number", v, f    ->   effectiveValue.numberValue      NUMBER
 *     type "boolean", v      ->   effectiveValue.boolValue        BOOL
 *     type "string", v       ->   effectiveValue.stringValue      STRING
 *     type "date"/"datetime"/
 *          "timeofday", f    ->   numberValue + numberFormat.type STRING
 *                                 DATE/DATE_TIME/TIME             (as formatted)
 *     null cell              ->   {} (no effectiveValue)          NONE
 *
 * Two known differences from the real API, both harmless for the curriculum:
 *
 *  - gviz consumes the first row as column labels, so it is put back as row 0
 *    (from `cols[].label`) to rebuild the full grid. That is what the callers
 *    want anyway -- every Bootstrap starter file opens its sheet with
 *    `sheet-by-name(name, true)`, i.e. skipHeaders, so unifyRows drops that row
 *    again. It does mean a sheet whose first row is DATA rather than headers
 *    would be read with that row typed as text; no curricular sheet is shaped
 *    that way, and `sheet-names` / gid ordering are unaffected.
 *
 *  - error cells (#N/A and friends) arrive from gviz as empty rather than as
 *    Sheets' `effectiveValue.errorValue`, so unifyRows reads them as blanks
 *    instead of raising its "there are #N/A values in the sheet" message. A
 *    sheet in that state is broken for students either way; this path just
 *    reports it less specifically.
 */
(function() {
  "use strict";

  function PublicSheetsError(message) {
    this.name = "PublicSheetsError";
    this.message = message || "";
  }
  PublicSheetsError.prototype = Object.create(Error.prototype);

  function getJSON(url) {
    return fetch(url, { credentials: "omit" }).then(function(resp) {
      return resp.text().then(function(text) {
        var body;
        try { body = JSON.parse(text); }
        catch (e) { throw new PublicSheetsError("unreadable response from " + url + ": " + text.slice(0, 200)); }
        if (!resp.ok) {
          throw new PublicSheetsError(
            "the public-sheets proxy failed (" + resp.status + "): " +
            (body && body.error ? body.error : text.slice(0, 200)) +
            (body && body.detail ? " -- " + JSON.stringify(body.detail) : ""));
        }
        return body;
      });
    });
  }

  // gviz "Date(2024,0,15)" / "Date(2024,0,15,13,30,0)" -> a Sheets serial
  // number. Only used to fill in effectiveValue.numberValue for date columns;
  // unifyRows renders those from formattedValue, so the serial just has to be
  // a number, but computing it properly keeps the shape honest for any code
  // that looks.
  var SHEETS_EPOCH_UTC = Date.UTC(1899, 11, 30);
  function dateSerial(v) {
    var m = /^Date\((\d+),(\d+),(\d+)(?:,(\d+),(\d+),(\d+))?\)$/.exec(String(v));
    if (!m) return 0;
    var ms = Date.UTC(+m[1], +m[2], +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    return (ms - SHEETS_EPOCH_UTC) / 86400000;
  }

  var DATE_FORMATS = { date: "DATE", datetime: "DATE_TIME", timeofday: "TIME" };

  // One gviz cell (or null) -> one Sheets v4 CellData.
  function toCellData(cell, colType) {
    if (cell === null || cell === undefined || cell.v === null || cell.v === undefined) {
      return {}; // no effectiveValue: unifyRows reads this as an empty cell
    }
    var formatted = (cell.f !== undefined && cell.f !== null) ? String(cell.f) : undefined;
    switch (colType) {
      case "number":
        return {
          effectiveValue: { numberValue: Number(cell.v) },
          formattedValue: formatted !== undefined ? formatted : String(cell.v),
        };
      case "boolean":
        return {
          effectiveValue: { boolValue: Boolean(cell.v) },
          formattedValue: formatted !== undefined ? formatted : String(cell.v).toUpperCase(),
        };
      case "date":
      case "datetime":
      case "timeofday":
        return {
          effectiveValue: { numberValue: dateSerial(cell.v) },
          effectiveFormat: { numberFormat: { type: DATE_FORMATS[colType] } },
          formattedValue: formatted !== undefined ? formatted : String(cell.v),
        };
      default:
        // Sheets reports text as stringValue; unifyRows types it from
        // formattedValue, so both are set to the same thing.
        return {
          effectiveValue: { stringValue: String(cell.v) },
          formattedValue: formatted !== undefined ? formatted : String(cell.v),
        };
    }
  }

  // The header row gviz swallowed into cols[].label, put back as row 0.
  function headerRow(cols) {
    return {
      values: cols.map(function(c) {
        var label = (c.label === undefined || c.label === null) ? "" : String(c.label);
        if (label === "") return {};
        return { effectiveValue: { stringValue: label }, formattedValue: label };
      }),
    };
  }

  function gvizToSheetData(gviz, props) {
    var table = (gviz && gviz.table) || { cols: [], rows: [] };
    var cols = table.cols || [];
    var rows = table.rows || [];
    if (cols.length === 0) {
      // An empty tab. Sheets omits `data` entirely rather than sending an
      // empty grid, and Worksheet.init has a branch for exactly that
      // (`!(data.data && data.data[0] && data.data[0].rowData)` -> no rows, no
      // schema). Synthesising a zero-column grid instead would walk into
      // unifyRows with startCol still Infinity.
      return {
        properties: {
          sheetId: Number(props.gid), title: props.name, index: props.index,
          gridProperties: { rowCount: 0, columnCount: 0, frozenRowCount: 0, frozenColumnCount: 0 },
        },
        data: [],
      };
    }
    var rowData = [headerRow(cols)].concat(rows.map(function(r) {
      var cells = r.c || [];
      return {
        values: cols.map(function(col, i) { return toCellData(cells[i], col.type); }),
      };
    }));
    return {
      properties: {
        sheetId: Number(props.gid),
        title: props.name,
        index: props.index,
        gridProperties: {
          rowCount: rowData.length,
          columnCount: cols.length,
          frozenRowCount: 0,
          frozenColumnCount: 0,
        },
      },
      data: [{ startRow: 0, startColumn: 0, rowData: rowData }],
    };
  }

  /*
   * A stand-in for the gapi `spreadsheets` client, with just the read method
   * sheets.js needs. `get` fetches the tab list and then every tab's data --
   * eagerly, because Spreadsheet's constructor builds all its Worksheets up
   * front, exactly as the real API's single fat response does.
   */
  function makePublicSpreadsheetsClient(baseUrl) {
    var base = String(baseUrl || "").replace(/\/+$/, "");

    function readOnly(what) {
      return function() {
        return Promise.reject(new PublicSheetsError(
          what + " is not available for a public sheet: the test-only " +
          "public-sheets path is read-only (nobody is signed in to write as)."));
      };
    }

    return {
      get: function(params) {
        var id = params.spreadsheetId;
        return getJSON(base + "/test-only/gsheet/sheets?id=" + encodeURIComponent(id))
          .then(function(meta) {
            return Promise.all(meta.sheets.map(function(s) {
              return getJSON(base + "/test-only/gsheet/data?id=" + encodeURIComponent(id) +
                             "&gid=" + encodeURIComponent(s.gid))
                .then(function(gviz) { return gvizToSheetData(gviz, s); });
            }));
          })
          .then(function(sheets) {
            return {
              spreadsheetId: id,
              properties: { title: id, defaultFormat: {} },
              sheets: sheets,
            };
          })
          .catch(function(err) {
            // sheets.js's Spreadsheet.fromId discards whatever this rejects
            // with and reports a flat 'No Spreadsheet with id "..." found', so
            // without this the actual reason -- a 502 from the proxy, a sheet
            // that is not public, a shape we failed to map -- is lost.
            console.error("public-sheets: could not load spreadsheet " + id + ":", err);
            throw err;
          });
      },
      batchUpdate: readOnly("Editing a spreadsheet"),
      values: { batchUpdate: readOnly("Writing spreadsheet values") },
    };
  }

  window.makePublicSpreadsheetsClient = makePublicSpreadsheetsClient;
  window.PublicSheetsError = PublicSheetsError;
})();
