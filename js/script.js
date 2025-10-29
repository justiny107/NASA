// ===================== NASA Space Explorer — Full Script =====================
// Points to your class mirror feed (array of APOD-like objects):
const FEED_URL = "https://cdn.jsdelivr.net/gh/GCA-Classroom/apod/data.json";

// ----- Grab existing elements from your HTML -----
const galleryEl = document.getElementById("gallery");
const fetchBtn  = document.getElementById("getImageBtn");
const filtersEl = document.querySelector(".filters");

// ----- Inject UI (date pickers + random fact + status) into your .filters -----
const ui = document.createElement("div");
ui.className = "apod-ui";
ui.innerHTML = `
  <div class="dates">
    <label>Start: <input id="apodStart" type="date" required></label>
    <label>End: <input id="apodEnd" type="date" required></label>
  </div>
  <div class="fact" aria-live="polite" aria-atomic="true"><strong>Did you know?</strong> <span id="apodFact"></span></div>
  <div id="apodStatus" class="status" role="status" aria-live="polite"></div>
`;
filtersEl.prepend(ui);

// UI refs
const startInput = document.getElementById("apodStart");
const endInput   = document.getElementById("apodEnd");
const factEl     = document.getElementById("apodFact");
const statusEl   = document.getElementById("apodStatus");

// ----- Create modal once; append to <body> -----
const modal = document.createElement("div");
modal.id = "apodModal";
modal.className = "modal";
modal.setAttribute("aria-hidden","true");
modal.setAttribute("role","dialog");
modal.setAttribute("aria-modal","true");
modal.innerHTML = `
  <div class="modal__backdrop" data-close></div>
  <div class="modal__content" role="document">
    <button class="modal__close" aria-label="Close" title="Close" data-close>&times;</button>
    <div id="modalMedia" class="modal__media"></div>
    <div class="modal__meta">
      <h2 id="modalTitle"></h2>
      <p id="modalDate" class="muted"></p>
      <p id="modalExplanation"></p>
      <p id="modalCopyright" class="muted"></p>
      <p id="modalLinkWrap" class="muted"></p>
    </div>
  </div>
`;
document.body.appendChild(modal);

// Modal refs
const modalMedia = modal.querySelector("#modalMedia");
const modalTitle = modal.querySelector("#modalTitle");
const modalDate  = modal.querySelector("#modalDate");
const modalExp   = modal.querySelector("#modalExplanation");
const modalCopy  = modal.querySelector("#modalCopyright");
const modalLink  = modal.querySelector("#modalLinkWrap");

// ----- Random facts (LevelUp) -----
const FACTS = [
  "Neutron stars can spin 600 times per second.",
  "One day on Venus is longer than a Venusian year.",
  "Jupiter’s Great Red Spot is a centuries-old storm.",
  "Saturn’s low density means it would float in water.",
  "There may be 100+ billion galaxies in the observable universe.",
  "Footprints on the Moon can last millions of years—no wind or water.",
  "A teaspoon of neutron-star matter would weigh ~a billion tons."
];
function showRandomFact(){
  factEl.textContent = FACTS[Math.floor(Math.random()*FACTS.length)];
}

// ----- Utilities -----
const iso = d => new Date(d).toISOString().slice(0,10);
function daysAgo(n){ const d=new Date(); d.setDate(d.getDate()-n); return iso(d); }
function setStatus(msg){ statusEl.textContent = msg || ""; }
function inRange(date, start, end){ return date >= start && date <= end; }

function youTubeId(u){
  try{
    const url = new URL(u);
    if (url.hostname.includes("youtube.com")) return url.searchParams.get("v");
    if (url.hostname === "youtu.be") return url.pathname.slice(1);
  }catch{}
  return null;
}
function videoThumb(apod){
  if (apod.thumbnail_url) return apod.thumbnail_url;
  const id = youTubeId(apod.url||"");
  return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null;
}

// ----- Data cache -----
let FEED = [];  // normalized and sorted desc by date

// ----- Load feed (with auto date clamping) -----
async function loadFeed(){
  setStatus("🔄 Loading space photos…");
  try{
    if (!FEED.length){
      const res = await fetch(FEED_URL, { cache: "no-store" });
      if (!res.ok) throw new Error(`Feed error ${res.status}`);
      const data = await res.json();

      // Accept array (expected) or {items:[...]} just in case
      const arr = Array.isArray(data) ? data : (Array.isArray(data.items) ? data.items : null);
      if (!arr) throw new Error("Feed is not an array or {items: []}");

      // Normalize & sort newest→oldest; filter out entries without date or media URL
      FEED = arr
        .filter(x => x && x.date && (x.url || x.hdurl))
        .map(x => ({ ...x, date: iso(x.date) }))
        .sort((a,b)=> b.date.localeCompare(a.date));

      if (!FEED.length) throw new Error("Feed loaded but contains 0 usable items");

      // Clamp date pickers to feed range
      const maxDate = FEED[0].date;                       // newest
      const minDate = FEED[FEED.length - 1].date;         // oldest
      startInput.min = endInput.min = minDate;
      startInput.max = endInput.max = maxDate;

      // If inputs empty/out-of-range, default to last 7 days within the feed
      const defEnd = maxDate;
      const d = new Date(defEnd); d.setDate(d.getDate()-6);
      const defStart = iso(d) < minDate ? minDate : iso(d);

      if (!startInput.value || startInput.value < minDate || startInput.value > maxDate){
        startInput.value = defStart;
      }
      if (!endInput.value || endInput.value > maxDate || endInput.value < minDate){
        endInput.value = defEnd;
      }

      // Tiny debug helper
      window.APOD_DEBUG = () => {
        console.log("FEED size:", FEED.length, "range:", minDate, "→", maxDate);
        console.log("Sample:", FEED.slice(0,3));
      };
      console.log(`APOD feed loaded: ${FEED.length} items (${minDate} → ${maxDate})`);
    }
    setStatus("");
    return FEED;
  }catch(err){
    console.error(err);
    setStatus("⚠️ Could not load the APOD feed. Please check the URL or try again.");
    return [];
  }
}

// ----- Render gallery -----
function render(items){
  galleryEl.innerHTML = "";

  if (!items.length){
    galleryEl.innerHTML = `
      <div class="placeholder">
        <div class="placeholder-icon">🌌</div>
        <p>No results for that date range.</p>
      </div>`;
    return;
  }

  const frag = document.createDocumentFragment();

  items.forEach(apod=>{
    const card = document.createElement("article");
    card.className = "gallery-item"; // matches your CSS
    card.tabIndex = 0;

    // Media (image or video thumb)
    let mediaHTML = "";
    if (apod.media_type === "image"){
      mediaHTML = `<img class="gi-thumb" src="${apod.url}" alt="${(apod.title||"APOD image").replace(/"/g,'&quot;')}">`;
    } else {
      const t = videoThumb(apod);
      mediaHTML = t
        ? `<img class="gi-thumb gi-video" src="${t}" alt="${(apod.title||"APOD video")+" (thumbnail)".replace(/"/g,'&quot;')}">`
        : `<div class="gi-thumb gi-video-fallback">Video</div>`;
    }

    card.innerHTML = `
      <div class="gi-media">
        ${mediaHTML}
        ${apod.media_type==="video" ? `<span class="play-badge">▶ Video</span>` : ""}
      </div>
      <p><strong>${apod.title || "Untitled"}</strong></p>
      <p class="muted">${apod.date || ""}</p>
    `;

    const open = ()=> openModal(apod);
    card.addEventListener("click", open);
    card.addEventListener("keypress", e=>{
      if (e.key === "Enter" || e.key === " "){ e.preventDefault(); open(); }
    });

    frag.appendChild(card);
  });

  galleryEl.appendChild(frag);
}

// ----- Modal control -----
function openModal(apod){
  modalTitle.textContent = apod.title || "Untitled";
  modalDate.textContent  = apod.date || "";
  modalExp.textContent   = apod.explanation || "";
  modalCopy.textContent  = apod.copyright ? `© ${apod.copyright}` : "";
  modalLink.innerHTML    = "";
  modalMedia.innerHTML   = "";

  if (apod.media_type === "image"){
    const img = document.createElement("img");
    img.src = apod.hdurl || apod.url;
    img.alt = apod.title || "APOD image";
    modalMedia.appendChild(img);

    if (apod.hdurl && apod.hdurl !== apod.url){
      const a = document.createElement("a");
      a.href = apod.hdurl; a.target = "_blank"; a.rel = "noopener";
      a.textContent = "Open full-resolution image ↗";
      modalLink.appendChild(a);
    }
  } else {
    const id = youTubeId(apod.url||"");
    if (id){
      const iframe = document.createElement("iframe");
      iframe.src = `https://www.youtube.com/embed/${id}`;
      iframe.setAttribute("allowfullscreen","true");
      iframe.title = apod.title || "APOD video";
      iframe.loading = "lazy";
      modalMedia.appendChild(iframe);
    } else {
      const t = videoThumb(apod);
      if (t){
        const img = document.createElement("img");
        img.src = t; img.alt = "Video thumbnail";
        modalMedia.appendChild(img);
      }
      const a = document.createElement("a");
      a.href = apod.url; a.target = "_blank"; a.rel = "noopener";
      a.textContent = "Open video ↗";
      modalLink.appendChild(a);
    }
  }

  modal.setAttribute("aria-hidden","false");
  document.body.style.overflow = "hidden";
}
function closeModal(){
  modal.setAttribute("aria-hidden","true");
  document.body.style.overflow = "";
  modalMedia.innerHTML = "";
}

// Close by backdrop / button / Escape
modal.addEventListener("click", e=>{
  if (e.target.matches("[data-close]")) closeModal();
});
document.addEventListener("keydown", e=>{
  if (e.key === "Escape") closeModal();
});

// ----- Refresh (fetch + filter + render) -----
async function refresh(){
  const feed = await loadFeed();
  if (!feed.length) return;

  // Feed range
  const maxDate = feed[0].date;
  const minDate = feed[feed.length - 1].date;

  // Read inputs and clamp to feed bounds
  let start = startInput.value ? iso(startInput.value) : minDate;
  let end   = endInput.value   ? iso(endInput.value)   : maxDate;
  if (start < minDate) start = minDate;
  if (end > maxDate)   end   = maxDate;

  if (end < start){
    setStatus("⚠️ End date must be on or after start date.");
    return;
  }

  setStatus("🔄 Loading space photos…");
  const items = feed
    .filter(a => inRange(a.date, start, end))
    .sort((a,b)=> b.date.localeCompare(a.date));

  render(items);
  setStatus(items.length ? "" : `No results between ${start} and ${end}. (Feed range: ${minDate} → ${maxDate})`);
}

// ----- Init -----
(function init(){
  // Temporary defaults before the feed sets min/max:
  endInput.value   = daysAgo(0);
  startInput.value = daysAgo(6);

  showRandomFact();
  // Warm the cache so first click is fast, and clamp inputs when loaded
  loadFeed();

  // Your existing button triggers fetch+render
  fetchBtn.addEventListener("click", refresh);
})();
