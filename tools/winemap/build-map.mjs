// Builds the interactive wine-regions map block inside pages/wine.html.
import { readFileSync, writeFileSync } from "node:fs";
import { geoConicEqualArea, geoPath } from "d3-geo";

const W = 1000, H = 860;
const here = new URL(".", import.meta.url);
const states = JSON.parse(readFileSync(new URL("au-states.geojson", here)));
const regions = JSON.parse(readFileSync(new URL("regions.json", here)));
states.features = states.features.filter((f) => f.properties.name !== "Jervis Bay Territory");
// Drop far-flung islands (Macquarie, Lord Howe and the like) so the mainland and Tasmania fill the map.
const near = (ring) => {
  const lon = ring.reduce((a, p) => a + p[0], 0) / ring.length, lat = ring.reduce((a, p) => a + p[1], 0) / ring.length;
  return lon > 112 && lon < 154.2 && lat < -9 && lat > -44.5;
};
for (const f of states.features) {
  if (f.geometry.type === "MultiPolygon") f.geometry.coordinates = f.geometry.coordinates.filter((poly) => near(poly[0]));
}

const projection = geoConicEqualArea().parallels([-18, -36]).rotate([-134, 0]).fitExtent([[12, 12], [W - 12, H - 12]], states);
const path = geoPath(projection).digits(0);

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const STATE_NAMES = { WA: "Western Australia", SA: "South Australia", VIC: "Victoria", NSW: "New South Wales & ACT", QLD: "Queensland", TAS: "Tasmania" };
const ORDER = ["WA", "SA", "VIC", "NSW", "QLD", "TAS"];
const FILTERS = [
  ["all", "All styles"], ["shiraz", "Shiraz"], ["cabernet", "Cabernet"], ["pinot", "Pinot Noir"], ["grenache", "Grenache"],
  ["chardonnay", "Chardonnay"], ["riesling", "Riesling"], ["sauvignon", "Sauvignon Blanc"], ["pinotgris", "Pinot Gris / Grigio"],
  ["semillon", "Semillon"], ["sparkling", "Sparkling"], ["fortified", "Fortified"],
];
const DEFAULT = "mclaren-vale";

for (const r of regions) {
  const [x, y] = projection([r.lon, r.lat]);
  r.x = Math.round(x * 10) / 10;
  r.y = Math.round(y * 10) / 10;
  r.id = slug(r.name);
}

// Zoom boxes per state: around that state's regions, padded, at the map's aspect ratio.
function box(x0, y0, x1, y1, minW) {
  let w = Math.max(x1 - x0, minW), h = Math.max(y1 - y0, minW * H / W);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  w *= 1.75; h *= 1.5;
  if (w / h > W / H) h = w * H / W; else w = h * W / H;
  return [cx - w / 2, cy - h / 2, w, h].map((v) => Math.round(v * 10) / 10).join(" ");
}
const views = { ALL: `0 0 ${W} ${H}` };
for (const s of ORDER) {
  if (s === "TAS") {
    const [x0, y0] = projection([144.5, -40.6]), [x1, y1] = projection([148.5, -43.7]);
    views[s] = box(Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1), 120);
    continue;
  }
  const pts = regions.filter((r) => r.state === s);
  const xs = pts.map((r) => r.x), ys = pts.map((r) => r.y);
  views[s] = box(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys), s === "QLD" ? 200 : 90);
}

const statePaths = states.features.map((f) => `<path d="${path(f)}"/>`).join("\n          ");
const dots = regions.map((r) => {
  const side = r.label || "right";
  const anchor = side === "left" ? "end" : side === "right" ? "start" : "middle";
  return `<g class="wm-dot${r.tier === 2 ? " tier-2" : ""}" data-id="${r.id}" data-state="${r.state}" data-tags="${r.tags.join(" ")}" tabindex="0" role="button" aria-label="${esc(r.name)}, ${esc(STATE_NAMES[r.state])}" aria-pressed="${r.id === DEFAULT}">` +
    `<circle cx="${r.x}" cy="${r.y}" r="7"/>` +
    `<text x="${r.x}" y="${r.y}" data-side="${side}" text-anchor="${anchor}">${esc(r.name)}</text></g>`;
}).join("\n          ");

const articles = regions.map((r) => `<article class="wm-region" id="region-${r.id}" data-id="${r.id}"${r.id === DEFAULT ? "" : " hidden"}>
          <p class="eyebrow">${esc(STATE_NAMES[r.state])}</p>
          <h3>${esc(r.name)}</h3>
          <p class="wm-climate"><b>Climate</b> ${esc(r.climate)}</p>
          <ul class="styles">${r.known.map((k) => `<li>${esc(k)}</li>`).join("")}</ul>
          <p>${esc(r.text)}</p>
        </article>`).join("\n        ");

const rows = ORDER.map((s) => {
  const rs = regions.filter((r) => r.state === s).sort((a, b) => a.tier - b.tier);
  return `<tbody>
            <tr><th colspan="3" scope="colgroup">${esc(STATE_NAMES[s])}</th></tr>
            ${rs.map((r) => `<tr><td><a href="#region-${r.id}" data-id="${r.id}">${esc(r.name)}</a></td><td>${esc(r.climate)}</td><td>${esc(r.known.join(", "))}</td></tr>`).join("\n            ")}
          </tbody>`;
}).join("\n          ");

const block = `<!--winemap-->
<section class="section winemap-section" aria-labelledby="map-title">
  <div class="wrap">
    <div class="section-head">
      <p class="eyebrow">Wine regions</p>
      <h2 id="map-title" class="h2">australia's wine regions.</h2>
      <p class="muted">Australia has ${regions.length} official wine regions, from the warm Barossa to cool Tasmania. The larger dots are the ${regions.filter((r) => r.tier === 1).length} you're most likely to see on a label. Choose any region to see its climate and what it's known for.</p>
    </div>
    <div class="winemap" data-winemap data-default="${DEFAULT}" data-views='${JSON.stringify(views)}'>
      <div class="wm-controls">
        <div class="wm-chips" role="group" aria-label="Zoom to a state">
          <button type="button" class="wm-chip" data-zoom="ALL" aria-pressed="true">All Australia</button>
          ${ORDER.map((s) => `<button type="button" class="wm-chip" data-zoom="${s}" aria-pressed="false">${s === "NSW" ? "NSW &amp; ACT" : s === "TAS" ? "Tasmania" : s === "QLD" ? "Queensland" : s === "VIC" ? "Victoria" : s}</button>`).join("\n          ")}
        </div>
        <label class="wm-filter">
          <span>Known for</span>
          <select data-filter>
            ${FILTERS.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join("\n            ")}
          </select>
        </label>
      </div>
      <div class="wm-body">
        <div class="wm-map">
          <p class="wm-legend" aria-hidden="true"><span class="key key-1"></span>Best known <span class="key key-2"></span>Other regions</p>
          <svg viewBox="0 0 ${W} ${H}" role="group" aria-label="Map of Australia's main wine regions">
          <g class="wm-states">
          ${statePaths}
          </g>
          <g class="wm-regions">
          ${dots}
          </g>
          </svg>
        </div>
        <div class="wm-panel" aria-live="polite">
        ${articles}
        </div>
      </div>
      <details class="wm-table">
        <summary>All ${regions.length} regions at a glance</summary>
        <div class="wm-table-wrap">
        <table>
          <thead><tr><th scope="col">Region</th><th scope="col">Climate</th><th scope="col">Known for</th></tr></thead>
          ${rows}
        </table>
        </div>
      </details>
    </div>
  </div>
</section>
<!--/winemap-->`;

const pageUrl = new URL("../../pages/wine.html", here);
let page = readFileSync(pageUrl, "utf8");
if (!page.includes("<!--winemap-->")) throw new Error("Add <!--winemap--><!--/winemap--> to pages/wine.html first");
page = page.replace(/<!--winemap-->[\s\S]*?<!--\/winemap-->/, block);
writeFileSync(pageUrl, page);
console.log("map written:", regions.length, "regions;", Math.round(block.length / 1024), "KB");
