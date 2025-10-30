// Debug mode - set to true to prevent API calls to Zenodo
const DEBUG_MODE = true;

const albumKeywords = [
  "Silvopastoral",
  "Silvoarable",
  "Permanent crop",
  "Agro-silvo-pasture",
  "Landscape features",
  "Urban agroforestry",
  "Wood pasture",
  "Tree alley cropping",
  "Coppice alley cropping",
  "Multi-layer gardens (on agricultural land)",
  "Orchard intercropping",
  "Orchard grazing",
  "Alternating cropping and grazing",
  "Hedges, trees in groups, trees in lines, individual trees",
  "Forest grazing",
  "Multi-layer gardens (on forest land)",
  "Homegardens, allotments, etc",
];

var currentPage = 1;
const photosPerPage = 10000;
var photos = [];
var filteredPhotos = []; // <-- new: current filtered subset
// currently active single filter (sanitized key) or null
var currentActiveFilter = null;
var totalVisualizations = 0;
const albumKeywordsSanitized = albumKeywords.map((keyword) =>
  sanitizeKeyword(keyword)
);

// New: track total record count and top progress bar
let totalRecords = null;
let topProgressBar = null;
let topProgressLabel = null;
let topHideTimeout = null;
const renderedRecordIds = new Set(); // optional guard to avoid duplicates

// Map globals (prevent ReferenceError when opening map / generating markers)
let mapMarkersLayer = null;
let europeBounds = null;

// DOM elements (cached)
const gallery = document.getElementById("gallery");
const barContainer = document.getElementById("gallery-loading-bar-container");
const bar = document.getElementById("gallery-loading-bar");
const barText = document.getElementById("gallery-loading-bar-text");
const footermessage = document.getElementById("footermessage");
const openMapBtn = document.getElementById("open-map");
const openGalleryBtn = document.getElementById("open-gallery");

// keep footer content hidden / discrete (we don't print status messages there)
if (footermessage) footermessage.style.display = "none";

// Isotope / grid state
let isotopeGrid = null;
let isotopeInitialized = false;

// Word cloud categories state
let categories = {};

// Loading helpers
function showLoadingBar() {
  if (!barContainer) return;
  barContainer.style.display = "block";
  if (bar) {
    bar.style.width = "0%";
    bar.style.background = "#28a745"; // green bar
  }
  if (barText) barText.textContent = "Fetching photos from Zenodo";
}
function hideLoadingBar() {
  if (!barContainer) return;
  setTimeout(() => {
    barContainer.style.display = "none";
    if (openMapBtn) openMapBtn.style.display = "inline-block";
  }, 400);
}

// Start incremental fetch & rendering on DOMContentLoaded
document.addEventListener("DOMContentLoaded", async () => {
  showLoadingBar();
  let dotsInterval;
  if (barText) {
    let dots = 0;
    dotsInterval = setInterval(() => {
      dots = (dots + 1) % 4;
      barText.textContent = "Fetching photos from Zenodo" + ".".repeat(dots);
    }, 500);
  }

  try {
    if (DEBUG_MODE) {
      console.log("DEBUG MODE: Skipping Zenodo API calls");
      // Use mock data for testing
      photos = [];
      totalRecords = 0;
      showTopProgressBar();
    } else {
      // Fetch total count first (fast, size=0)
      try {
        totalRecords = await fetchTotalCount(["euraf-media"]);
      } catch (err) {
        console.warn("Could not fetch total count:", err);
        totalRecords = null;
      }
      showTopProgressBar(); // create UI even if totalRecords is null

      await fetchZenodoPhotosIncremental(["euraf-media"]);
    }

    // Ensure filteredPhotos defaults to all fetched photos after initial load
    filteredPhotos = photos.slice();

    // finalize: update counters, wordcloud and pagination
    totalVisualizations = photos.reduce(
      (sum, photo) => sum + (photo.stats?.views || 0),
      0
    );
    animateCounter(
      document.getElementById("visualization-count"),
      0,
      totalVisualizations,
      800
    );
    buildWordCloud(); // full rebuild at the end to ensure counts are consistent
    await setupPagination();
  } catch (err) {
    console.error("Error fetching Zenodo photos:", err);
    // footer messages removed per request
  } finally {
    if (dotsInterval) clearInterval(dotsInterval);
    if (barText) barText.textContent = "Fetched photos from Zenodo";
    hideLoadingBar();
  }
});

// Incremental fetch: fetch page-by-page and append each page immediately
async function fetchZenodoPhotosIncremental(communities) {
  if (DEBUG_MODE) {
    console.log("DEBUG MODE: Skipping fetchZenodoPhotosIncremental");
    return [];
  }
  
  let allPhotosCount = 0;
  for (const community of communities) {
    let apiUrl = `https://zenodo.org/api/records?size=50&sort=mostrecent&communities=${community}&type=image`;

    while (apiUrl) {
      // footer messages removed — keep debug logs instead
      console.debug(`Fetching ${apiUrl}`);
      let response;
      try {
        response = await fetch(apiUrl);
      } catch (err) {
        console.error("Network error while fetching:", apiUrl, err);
        break;
      }
      if (!response.ok) {
        console.error(`Failed to fetch ${apiUrl}: ${response.status}`);
        break;
      }

      const data = await response.json();
      const hits = data.hits?.hits || [];

      if (hits.length) {
        // filter out any hits we've already rendered (prevent duplicates)
        const newHits = hits.filter((h) => !renderedRecordIds.has(h.id));
        if (newHits.length) {
          newHits.forEach((h) => renderedRecordIds.add(h.id));
          photos = photos.concat(newHits);
          appendPhotosToGallery(newHits);
        }
        allPhotosCount += hits.length;
        console.debug(`Fetched ${allPhotosCount} photos so far`);
      }

      // follow pagination (Zenodo returns full URL in data.links.next)
      apiUrl = data.links && data.links.next ? data.links.next : null;
    }
  }

  console.debug(`Fetched ${photos.length} photos from Zenodo`);
  return photos;
}

// New: fetch total records count using size=0 (very small response)
async function fetchTotalCount(communities) {
  if (DEBUG_MODE) {
    console.log("DEBUG MODE: Skipping fetchTotalCount");
    return 0;
  }
  
  let sum = 0;
  for (const community of communities) {
    const url = `https://zenodo.org/api/records?communities=${encodeURIComponent(
      community
    )}&type=image&size=1`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Count fetch failed ${res.status}`);
    const data = await res.json();
    // Zenodo returns data.hits.total
    if (data.hits && typeof data.hits.total === "number") {
      sum += data.hits.total;
    }
  }
  return sum;
}

// Replace showTopProgressBar and updateTopProgress with these versions
function showTopProgressBar() {
  // if already present just update
  if (document.getElementById("top-progress-container")) {
    updateTopProgress();
    return;
  }

  // prefer placing the progress bar centered below the header; fallback to wrapper/body
  const insertAfter =
    document.querySelector(".gallery-header") ||
    document.getElementById("wrapper") ||
    document.body;

  const container = document.createElement("div");
  container.id = "top-progress-container";
  // center the whole container and constrain width so it appears centered on the page
  container.style.display = "block";
  container.style.textAlign = "center";
  container.style.margin = "12px auto";
  container.style.maxWidth = "700px";

  container.innerHTML = `
    <div style="display:inline-block; text-align:left; width:100%; max-width:560px;">
      <div id="top-progress-label" style="font-size:13px;color:#333;margin-bottom:6px;">Loading 0 photos</div>
      <div id="top-progress" style="width:100%;height:12px;background:#eee;border-radius:6px;overflow:hidden">
        <div id="top-progress-bar" style="width:0%;height:100%;background:#28a745;transition:width 300ms ease"></div>
      </div>
    </div>
  `;

  if (insertAfter && insertAfter.parentNode) {
    // insert container immediately after the reference node, keeping visualizations elsewhere unchanged
    insertAfter.parentNode.insertBefore(container, insertAfter.nextSibling);
  } else {
    document.body.insertBefore(container, document.body.firstChild);
  }

  topProgressBar = document.getElementById("top-progress-bar");
  topProgressLabel = document.getElementById("top-progress-label");

  // cancel pending hide if any
  if (topHideTimeout) {
    clearTimeout(topHideTimeout);
    topHideTimeout = null;
  }

  updateTopProgress();
}

function updateTopProgress() {
  const container = document.getElementById("top-progress-container");
  if (!container) return;
  if (!topProgressBar || !topProgressLabel) {
    topProgressBar = document.getElementById("top-progress-bar");
    topProgressLabel = document.getElementById("top-progress-label");
    if (!topProgressBar || !topProgressLabel) return;
  }

  const loaded = photos.length;

  if (totalRecords && totalRecords > 0) {
    const pct = Math.min(100, Math.round((loaded / totalRecords) * 100));
    topProgressBar.style.width = `${pct}%`;
    topProgressLabel.textContent = `Loading ${loaded} photos out of ${totalRecords} (${pct}%)`;

    // when complete, show "Loaded" briefly then hide the centered UI
    if (pct >= 100) {
      topProgressLabel.textContent = `Loaded ${loaded} photos out of ${totalRecords} (${pct}%)`;
      if (topHideTimeout) clearTimeout(topHideTimeout);
      topHideTimeout = setTimeout(() => {
        const c = document.getElementById("top-progress-container");
        if (c) c.style.display = "none";
        topHideTimeout = null;
      }, 2500);
    } else {
      container.style.display = "block";
    }
  } else {
    // indeterminate mode: show count and a pulsing / growing width
    const pseudoPct = Math.min(95, Math.round((loaded % 20) * 5));
    topProgressBar.style.width = `${pseudoPct}%`;
    topProgressLabel.textContent = `Loading ${loaded} photos`;
    container.style.display = "block";
  }
}

// Append an array of photos to the gallery DOM and wire up lazy loading + isotope
function appendPhotosToGallery(newPhotos) {
  if (!gallery) return;
  // Ensure grid-sizer exists
  if (!gallery.querySelector(".grid-sizer")) {
    gallery.innerHTML = '<div class="grid-sizer"></div>';
  }

  // Build HTML for new photos and update categories incrementally
  const fragment = document.createDocumentFragment();
  for (const photo of newPhotos) {
    try {
      const id = photo.id;
      const filename =
        (photo.files && photo.files[0] && photo.files[0].key) || "";
      const doi_url = photo.doi ? `https://www.doi.org/${photo.doi}` : "#";
      const title = photo.metadata?.title || "Untitled";

      // update categories
      if (photo.metadata?.keywords) {
        photo.metadata.keywords.forEach((kw) => {
          const sanitized = sanitizeKeyword(kw);
          if (!categories[sanitized])
            categories[sanitized] = { keyword: kw, count: 0 };
          categories[sanitized].count++;
        });
      }

      // coordinates icon
      let htmlCoords = "";
      if (photo.metadata?.custom) {
        const latDD = photo.metadata.custom["dwc:decimalLatitude"]?.[0];
        const lonDD = photo.metadata.custom["dwc:decimalLongitude"]?.[0];
        if (latDD && lonDD) {
          const photoLink2Gmap = BuildLink2Gmap(lonDD, latDD);
          htmlCoords = `<a href="${photoLink2Gmap}" target="_blank" class="icon-overlay">&#127757;</a>`;
        }
      }

      let category_classes = "";
      if (photo.metadata?.keywords) {
        category_classes = photo.metadata.keywords
          .map((kw) => sanitizeKeyword(kw))
          .join(" ");
      }

      const thumbnail_url = filename
        ? `https://zenodo.org/api/iiif/record:${id}:${filename}/full/300,/0/default.png`
        : "";

      const large_image_url = filename
        ? `https://zenodo.org/api/iiif/record:${id}:${filename}/full/600,/0/default.png`
        : "";

      const div = document.createElement("div");
      div.className = `grid-item ${category_classes}`;
      div.style.opacity = "0";
      div.style.transition = "opacity 0.5s";
      div.innerHTML = `
        <a href="${large_image_url}" class="popup-btn" data-title="${title}" data-authors="${(
          photo.metadata?.creators || []
        )
          .map((c) => c.name)
          .join(", ")}" data-year="${photo.metadata?.publication_date
          ? new Date(photo.metadata.publication_date).getFullYear()
          : ""
        }" data-doi="${doi_url}">
          <img class="img-fluid lazy" src="${thumbnail_url}" data-src="${thumbnail_url}" alt="${title}" loading="lazy">
          ${htmlCoords}
        </a>
      `;
      fragment.appendChild(div);
    } catch (err) {
      console.error("Error preparing photo element", err);
    }
  }

  gallery.appendChild(fragment);

  // Initialize Isotope once, then relayout
  if (!isotopeInitialized) {
    try {
      initIsotope();
    } catch (e) {
      console.warn("initIsotope failed", e);
    }
    isotopeInitialized = true;
  } else {
    // If isotope exists, appended elements need layout
    setTimeout(() => {
      try {
        $(".grid").isotope(
          "appended",
          $(gallery).find(".grid-item").slice(-newPhotos.length)
        );
        $(".grid").isotope("layout");
      } catch (e) {
        console.warn("Isotope append/layout failed", e);
      }
    }, 50);
  }

  // Wire up image load handlers for new images
  progressivelyShowImages();

  // Re-init magnific popup so new items are included
  initMagnificPopup();

  // update top progress after adding these photos
  updateTopProgress();
}

// Initialize isotope grid
function initIsotope() {
  if ($(".grid").data("isotope")) {
    $(".grid").isotope("destroy");
  }
  isotopeGrid = $(".grid").isotope({
    itemSelector: ".grid-item",
    percentPosition: true,
    masonry: {
      columnWidth: ".grid-sizer",
    },
  });
}

// Show images progressively and update loading bar
function progressivelyShowImages() {
  const images = Array.from(gallery.querySelectorAll("img"));
  // Only consider images that are still hidden (opacity 0)
  const hiddenImages = images.filter((img) => {
    const gi = img.closest(".grid-item");
    return gi && gi.style.opacity === "0";
  });

  let loaded = 0;
  const total = hiddenImages.length || 1; // avoid divide by zero

  hiddenImages.forEach((img) => {
    const gridItem = img.closest(".grid-item");
    let resolved = false;

    const onComplete = () => {
      if (resolved) return;
      resolved = true;
      loaded++;
      if (gridItem) gridItem.style.opacity = "1";
      if (bar) bar.style.width = `${Math.min(100, (loaded / total) * 100)}%`;
      if (barText) barText.textContent = `Loading photos... ${loaded}/${total}`;
      if (isotopeGrid) isotopeGrid.isotope("layout");

      if (loaded >= total) {
        hideLoadingBar();
        // footer messages removed per request
      }
    };

    if (img.complete && img.naturalWidth > 0) {
      onComplete();
      return;
    }
    img.addEventListener("load", onComplete, { once: true });
    img.addEventListener("error", onComplete, { once: true });

    // Force reload if src already set but not completed
    if (img.src && !img.complete) {
      const s = img.src;
      img.src = "";
      img.src = s;
    }

    // fallback timeout
    setTimeout(() => {
      onComplete();
    }, 6000);
  });
}

// Build / rebuild word cloud from current categories
function buildWordCloud() {
  const wordCloud = document.getElementById("word-cloud");
  if (!wordCloud) return;

  // insert a single explanation box only once (prevents duplicates)
  if (!document.getElementById("word-cloud-explanation")) {
    const explanationBox = document.createElement("div");
    explanationBox.id = "word-cloud-explanation";
    explanationBox.className = "explanation-box-wrapper";
    explanationBox.innerHTML =
      '<p class="explanation-box text-center small p-2">These filter words are fetched from keywords on the Zenodo records. <a href="https://zenodo.org/doi/10.5281/zenodo.7953307" target="_blank" rel="noopener">Official EURAF agroforestry typologies</a> are shown in <span class="album-keyword"><strong>bold green</strong></span>.</p>';
    wordCloud.parentNode.insertBefore(explanationBox, wordCloud);
  }

  // Build new mapping (categories already populated incrementally)
  wordCloud.innerHTML = `<button class="word-filter" data-filter="*">All 📷 <sup>${photos.length}</sup></button>`;

  const sortedSanitizedKeywords = Object.keys(categories).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" })
  );

  for (const sanitizedKeyword of sortedSanitizedKeywords) {
    const originalKeyword = categories[sanitizedKeyword].keyword;
    const isAlbum = albumKeywordsSanitized.includes(sanitizedKeyword);
    const additionalClass = isAlbum ? "album-keyword" : "";
    wordCloud.innerHTML += `<button class="word-filter ${additionalClass}" data-filter=".${sanitizedKeyword}">${originalKeyword} <sup>${categories[sanitizedKeyword].count}</sup></button>`;
  }

  // re-bind word filter events
  $(document).off("click", ".word-filter");
  $(document).on("click", ".word-filter", function () {
    const filterValue = $(this).attr("data-filter");
    $(".word-filter").removeClass("active");
    $(this).addClass("active");

    // apply client-side filter and show active chip
    applyFilterValue(filterValue);
    setActiveFilterChip(filterValue);

    if (window.innerWidth <= 768) {
      const wordcloudDrawer = document.getElementById("wordcloudDrawer");
      if (wordcloudDrawer) wordcloudDrawer.classList.remove("visible");
    }
  });
}

// Pagination creation (based on total photos when finished)
async function setupPagination() {
  const totalPages = Math.ceil(photos.length / photosPerPage);
  const existingPagination = document.getElementById("gallery-pagination");
  if (existingPagination) existingPagination.remove();
  if (totalPages <= 1) return;

  const paginationContainer = document.createElement("div");
  paginationContainer.id = "gallery-pagination";
  paginationContainer.className =
    "gallery-pagination d-flex align-items-center justify-content-center text-center";

  let buttonsHTML = "";
  for (let i = 1; i <= totalPages; i++) {
    buttonsHTML += `<button class="page-btn btn btn-sm mx-1${i === currentPage ? " active" : ""
      }" data-page="${i}">${i}</button>`;
  }

  const pagesDiv = document.createElement("div");
  pagesDiv.innerHTML = buttonsHTML;
  pagesDiv.className = "pages-btn-group";
  paginationContainer.appendChild(pagesDiv);

  const wrapper = document.getElementById("wrapper");
  if (wrapper)
    wrapper.parentNode.insertBefore(paginationContainer, wrapper.nextSibling);

  document.querySelectorAll(".page-btn").forEach((btn) => {
    btn.addEventListener("click", async function () {
      currentPage = parseInt(this.getAttribute("data-page"));
      // simply rebuild gallery view (client-side pagination over the already fetched photos)
      buildGalleryPaginated(currentPage);
      document
        .querySelectorAll(".page-btn")
        .forEach((b) => b.classList.remove("active"));
      this.classList.add("active");
    });
  });
}

// Build paginated view from already fetched photos (client-side)
function buildGalleryPaginated(page) {
  if (!gallery) return;
  gallery.innerHTML = '<div class="grid-sizer"></div>';
  const sortedPhotos = photos
    .slice()
    .sort(
      (a, b) =>
        new Date(b.metadata.publication_date) -
        new Date(a.metadata.publication_date)
    );
  const startIdx = (page - 1) * photosPerPage;
  const endIdx = startIdx + photosPerPage;
  const paginated = sortedPhotos.slice(startIdx, endIdx);
  appendPhotosToGallery(paginated);
}

// --- remaining helper functions copied from existing file (sanitize, BuildLink2Gmap, Magnific popup, map handlers, animateCounter, etc.) ---
function sanitizeKeyword(keyword) {
  return keyword
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "")
    .toLowerCase();
}

function ConvertDDToDMS(D, lng) {
  return {
    dir: D < 0 ? (lng ? "W" : "S") : lng ? "E" : "N",
    deg: 0 | (D < 0 ? (D = -D) : D),
    min: 0 | (((D += 1e-9) % 1) * 60),
    sec: (0 | (((D * 60) % 1) * 6000)) / 100,
  };
}

function BuildLink2Gmap(LonDD, LatDD) {
  latDMS = ConvertDDToDMS(LatDD, false);
  lonDMS = ConvertDDToDMS(LonDD, true);
  str = "https://www.google.com/maps/place/";

  str1 =
    latDMS["deg"] +
    "°" +
    latDMS["min"] +
    "'" +
    latDMS["sec"] +
    "''" +
    latDMS["dir"] +
    "+";
  str2 =
    lonDMS["deg"] +
    "°" +
    lonDMS["min"] +
    "'" +
    lonDMS["sec"] +
    "''" +
    lonDMS["dir"] +
    "/@" +
    LatDD +
    "," +
    LonDD +
    ",1000m";
  str3 = str1.concat(str2);
  str4 = str.concat(str3);
  return str4;
}

function initMagnificPopup() {
  $(".popup-btn").magnificPopup({
    type: "image",
    gallery: {
      enabled: true,
    },
    image: {
      titleSrc: function (item) {
        let title = item.el.attr("data-title");
        let authors = item.el.attr("data-authors");
        let year = item.el.attr("data-year");
        let doi = item.el.attr("data-doi");

        return `${title} <br> <small>by ${authors} (${year})<br><a href="${doi}" target="_blank">Full resolution and source to cite:  ${doi}</a></small>`;
      },
    },
  });
}

// Map toggle handlers (unchanged DOM show/hide but ensure markers use filteredPhotos)
if (openMapBtn) {
  openMapBtn.addEventListener("click", function () {
    document.getElementById("gallery").style.display = "none";
    document.getElementById("gallery-map").style.display = "block";
    openMapBtn.style.display = "none";
    if (openGalleryBtn) openGalleryBtn.style.display = "block";

    // initialize map and generate markers for the current filtered set
    initGalleryMap();
    generateMapMarkers(filteredPhotos.length ? filteredPhotos : photos);
  });
}
if (openGalleryBtn) {
  openGalleryBtn.addEventListener("click", function () {
    document.getElementById("gallery").style.display = "block";
    document.getElementById("gallery-map").style.display = "none";
    if (openMapBtn) openMapBtn.style.display = "block";
    openGalleryBtn.style.display = "none";
    // re-render gallery from current filteredPhotos so the view is up-to-date
    try {
      renderFilteredGallery();
      updateTopProgress();
    } catch (e) {
      console.warn("Error updating gallery on toggle:", e);
    }
  });
}

// small helper to safely escape text inserted into popup HTML
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Initialize the Leaflet map and base layer (no markers)
function initGalleryMap() {
  if (window.galleryMap) return;

  // create map centered on Europe
  window.galleryMap = L.map("gallery-map").setView([54, 10], 4);

  // Base layers: OSM Mapnik (default) and an aerial imagery (Esri World Imagery)
  const osmMapnik = L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
      subdomains: ["a", "b", "c"],
      detectRetina: true,
    }
  );

  const esriAerial = L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    {
      attribution:
        "Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community",
      maxZoom: 19,
      detectRetina: true,
    }
  );

  // add default layer (OSM Mapnik)
  osmMapnik.addTo(window.galleryMap);

  // add layer switcher control so users can toggle to aerial imagery
  try {
    const baseLayers = {
      OpenStreetMap: osmMapnik,
      "Esri World Imagery": esriAerial,
    };
    if (!window.galleryBaseLayerControl) {
      window.galleryBaseLayerControl = L.control
        .layers(baseLayers, null, { collapsed: false })
        .addTo(window.galleryMap);
    }
  } catch (e) {
    console.warn("Could not add base layer control", e);
  }

  // Europe bounding box (southWest, northEast)
  europeBounds = L.latLngBounds(L.latLng(34.0, -25.0), L.latLng(72.0, 45.0));

  // Constrain panning/zoom and set reasonable limits
  window.galleryMap.setMaxBounds(europeBounds.pad(0.4));
  window.galleryMap.options.minZoom = 3;
  window.galleryMap.options.maxZoom = 18;

  // prepare a marker cluster group for markers (clusters overlapping markers)
  if (!mapMarkersLayer) {
    // use marker clustering for dense / overlapping points
    try {
      mapMarkersLayer = L.markerClusterGroup({
        // reduce cluster radius so clustering is less aggressive
        maxClusterRadius: 20,
        // show individual markers at closer zoom levels
        disableClusteringAtZoom: 13,
        // when at max zoom, spiderfy overlapping markers
        spiderfyOnMaxZoom: true,
        // don't show the grey coverage circle on hover (cleaner)
        showCoverageOnHover: false,
        // zoom to bounds when clicking a cluster
        zoomToBoundsOnClick: true,
        // performance option for many markers
        chunkedLoading: true,
        // custom cluster icon to keep clusters compact
        iconCreateFunction: function (cluster) {
          const count = cluster.getChildCount();
          let size = "small";
          if (count > 50) size = "large";
          else if (count > 10) size = "medium";
          return L.divIcon({
            html: "<div><span>" + count + "</span></div>",
            className: "marker-cluster marker-cluster-" + size,
            iconSize: L.point(30, 30),
          });
        },
      });
    } catch (e) {
      // fallback to plain layer group if markercluster is not available
      console.warn(
        "MarkerCluster plugin not available, falling back to layerGroup",
        e
      );
      mapMarkersLayer = L.layerGroup();
    }
    mapMarkersLayer.addTo(window.galleryMap);
  }
}

// Generate / refresh markers from a given photo list (defaults to photos array)
function generateMapMarkers(list = photos) {
  if (!window.galleryMap) initGalleryMap();
  if (!mapMarkersLayer)
    mapMarkersLayer = L.layerGroup().addTo(window.galleryMap);

  mapMarkersLayer.clearLayers();
  const markers = [];

  for (const photo of list) {
    const custom_props = photo.metadata?.custom;
    const latDD = custom_props?.["dwc:decimalLatitude"]?.[0];
    const lonDD = custom_props?.["dwc:decimalLongitude"]?.[0];
    if (!latDD || !lonDD) continue;

    const filename =
      (photo.files && photo.files[0] && photo.files[0].key) || "";
    const image_url_200 = filename
      ? `https://zenodo.org/api/iiif/record:${photo.id}:${filename}/full/200,/0/default.png`
      : "";
    const title = photo.metadata?.title || "";
    const authors = (photo.metadata?.creators || [])
      .map((c) => c.name)
      .join(", ");
    const year = photo.metadata?.publication_date
      ? new Date(photo.metadata.publication_date).getFullYear()
      : "";
    const doi_url = photo.doi ? `https://www.doi.org/${photo.doi}` : "";

    const popupHtml = `
      <div class="map-popup">
        <div class="map-popup-title">${escapeHtml(title)}</div>
        ${authors || year
        ? `<div class="map-popup-meta"><small>by ${escapeHtml(authors)} ${year ? `(${escapeHtml(String(year))})` : ""
        }</small></div>`
        : ""
      }
        ${image_url_200
        ? `<div class="map-popup-img"><img src="${image_url_200}" alt="${escapeHtml(
          title
        )}"></div>`
        : ""
      }
        ${doi_url
        ? `<div class="map-popup-doi"><a href="${doi_url}" target="_blank" rel="noopener">Full resolution and source to cite</a></div>`
        : ""
      }
      </div>
    `;

    // create a themed divIcon so individual markers match gallery colors
    const customIcon = L.divIcon({
      className: "custom-marker-wrapper",
      html: '<div class="custom-marker-pin"></div>',
      iconSize: [20, 28],
      iconAnchor: [10, 28],
      popupAnchor: [0, -26],
    });

    const marker = L.marker([parseFloat(latDD), parseFloat(lonDD)], {
      icon: customIcon,
    }).bindPopup(popupHtml, { maxWidth: 360, className: "custom-map-popup" });
    // add to cluster layer (or plain layerGroup)
    mapMarkersLayer.addLayer(marker);

    markers.push(marker);
  }

  // Fit view to markers or to Europe bounds
  if (markers.length) {
    const group = L.featureGroup(markers);
    try {
      window.galleryMap.fitBounds(group.getBounds().pad(0.15));
    } catch (e) {
      // ignore fit errors
    }
  } else if (europeBounds) {
    window.galleryMap.fitBounds(europeBounds.pad(0.05));
  }
}

// Backwards-compatible showGalleryMap: initialize map and add markers from current photos
function showGalleryMap() {
  initGalleryMap();
  generateMapMarkers(photos);
}

// Counter animation
function animateCounter(targetElement, start, end, duration) {
  if (!targetElement) return;
  let range = Math.max(0, end - start);
  let current = start;
  let increment = range / Math.max(1, duration / 16);
  function updateCounter() {
    current += increment;
    if (current >= end) {
      targetElement.innerText = Math.round(end);
    } else {
      targetElement.innerText = Math.round(current);
      requestAnimationFrame(updateCounter);
    }
  }
  requestAnimationFrame(updateCounter);
}

async function loadhtmlContent(htmlpage, ObjID2inject) {
  try {
    // Fetch the content from addphotos.html
    const response = await fetch(htmlpage);

    // Check if the fetch request was successful
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    // Convert the response into HTML text
    const htmlContent = await response.text();

    // Insert the HTML content into the div
    document.getElementById(ObjID2inject).innerHTML = htmlContent;
  } catch (error) {
    console.error("Error loading addphotos.html:", error);
    document.getElementById(ObjID2inject).innerHTML =
      "<p>Failed to load content. Please try again later.</p>";
  }
}

// wire open/close for the filter drawer
document.getElementById("open-filter")?.addEventListener("click", () => {
  const d = document.getElementById("wordcloudDrawer");
  if (d) d.classList.toggle("visible");
});
document.getElementById("close-filter")?.addEventListener("click", () => {
  const d = document.getElementById("wordcloudDrawer");
  if (d) d.classList.remove("visible");
});

// --- ADD: wire open/close for the Add Photo drawer and lazy-load its content ---
document
  .getElementById("open-add-photos")
  ?.addEventListener("click", async () => {
    const d = document.getElementById("addPhotosDrawer");
    if (!d) return;
    
    // Load Markdown instructions if not already loaded
    await loadZenodoInstructions();
    
    d.classList.toggle("visible");
  });
document.getElementById("close-add-photos")?.addEventListener("click", () => {
  const d = document.getElementById("addPhotosDrawer");
  if (d) d.classList.remove("visible");
});

// Helper: render the gallery from filteredPhotos (clears previous content and reuses appendPhotosToGallery)
function renderFilteredGallery() {
  if (!gallery) return;
  // destroy isotope so appendPhotosToGallery starts clean
  try {
    if ($(".grid").data("isotope")) {
      $(".grid").isotope("destroy");
    }
  } catch (e) {
    console.debug("renderFilteredGallery: isotope destroy failed", e);
  }
  isotopeInitialized = false;
  // clear gallery
  gallery.innerHTML = '<div class="grid-sizer"></div>';
  // append filtered photos (appendPhotosToGallery will init isotope)
  appendPhotosToGallery(filteredPhotos);
  // update map markers to reflect current filtered view
  if (window.galleryMap) {
    generateMapMarkers(filteredPhotos);
  }
}

// Helper: apply a filter value from the button's data-filter (supports ".kw-xxx", ".xxx" or "*")
function applyFilterValue(filterValue) {
  if (!filterValue || filterValue === "*" || filterValue === "all") {
    filteredPhotos = photos.slice();
  } else {
    const raw = String(filterValue).replace(/^\./, ""); // remove leading dot if present
    // support optional "kw-" prefix
    const sanitizedKey = raw.startsWith("kw-") ? raw.slice(3) : raw;
    filteredPhotos = photos.filter((p) => {
      const kws = (p.metadata?.keywords || []).map((k) => sanitizeKeyword(k));
      return kws.includes(sanitizedKey);
    });
  }
  // render view and update UI
  renderFilteredGallery();
  updateTopProgress();
}

// Show a single active filter chip to the left of the visualizations counter
function setActiveFilterChip(filterValue) {
  const container = document.getElementById("active-filters");
  if (!container) return;

  // normalize filter key (remove leading dot)
  let key = String(filterValue || "").replace(/^\./, "");
  if (!key || key === "*" || key === "all") {
    // clear any chip
    container.innerHTML = "";
    currentActiveFilter = null;
    return;
  }

  // if prefixed kw- remove it for display
  const displayKey = key.startsWith("kw-") ? key.slice(3) : key;
  currentActiveFilter = displayKey;

  // get original label if available
  const label =
    (categories[displayKey] && categories[displayKey].keyword) || displayKey;

  container.innerHTML = `
    <div class="filter-chip" data-key="${escapeHtml(displayKey)}">
      <span class="chip-label">${escapeHtml(label)}</span>
      <span class="chip-clear" title="Remove filter">&times;</span>
    </div>
  `;

  // wire clear action
  const clearBtn = container.querySelector(".chip-clear");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      clearActiveFilter();
    });
  }
}

function clearActiveFilter() {
  const container = document.getElementById("active-filters");
  if (container) container.innerHTML = "";
  currentActiveFilter = null;
  // reset filters
  applyFilterValue("*");
  // visually unselect buttons
  document
    .querySelectorAll(".word-filter")
    .forEach((b) => b.classList.remove("active"));
}

// Function to load and display Zenodo instructions from Markdown file
async function loadZenodoInstructions() {
  const contentContainer = document.getElementById("add-photos-content");
  if (!contentContainer) return;
  
  // Check if instructions are already loaded
  if (contentContainer.dataset.loaded === "true") return;
  
  try {
    const response = await fetch('./zenodo-upload-instructions.md');
    if (!response.ok) throw new Error('Failed to load instructions');
    
    const markdownText = await response.text();
    var converter = new showdown.Converter()
    // converter.setFlavor('github');
    converter.setOption('disableForced4SpacesIndentedSublists', true);
    converter.setOption('headerLevelStart', 4)
    /*converter.setOption('smartIndentationFix', true);*/
    const htmlContent = converter.makeHtml(markdownText);
    
    // Replace the existing content
    contentContainer.innerHTML = `
      <div class="instructions-section">
        ${htmlContent}
      </div>
    `;
    
    // Mark as loaded
    contentContainer.dataset.loaded = "true";
    
  } catch (error) {
    console.warn('Could not load Zenodo instructions from Markdown file:', error);
    // Keep existing HTML content as fallback
  }
}

// Simple Markdown to HTML converter for basic formatting
function simpleMarkdownToHtml(markdown) {
  let html = markdown;
  
  // Headers - skip H1 titles, only convert H2 and H3
  html = html.replace(/^### (.*$)/gim, '<p><strong>$1</strong></p>');
  html = html.replace(/^## (.*$)/gim, '<p><strong>$1</strong></p>');
  // Remove H1 headers entirely (don't convert to HTML)
  html = html.replace(/^# .*$/gim, '');
  
  // Bold text
  html = html.replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>');
  
  // Italic text
  html = html.replace(/\*(.*?)\*/gim, '<em>$1</em>');
  
  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/gim, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  
  // Code inline
  html = html.replace(/`([^`]+)`/gim, '<code>$1</code>');
  
  // Lists - convert markdown lists to HTML
  // Handle numbered lists
  html = html.replace(/^\s*\d+\.\s+(.*)$/gim, '<li class="numbered">$1</li>');
  // Handle bullet lists  
  html = html.replace(/^\s*[-*]\s+(.*)$/gim, '<li class="bullet">$1</li>');
  
  // Wrap consecutive <li> elements in <ol> or <ul>
  html = html.replace(/(<li class="numbered">.*?<\/li>(?:\s*<li class="numbered">.*?<\/li>)*)/gim, function(match, listItems) {
    return `<ol>${listItems.replace(/ class="numbered"/g, '')}</ol>`;
  });
  
  html = html.replace(/(<li class="bullet">.*?<\/li>(?:\s*<li class="bullet">.*?<\/li>)*)/gim, function(match, listItems) {
    return `<ul>${listItems.replace(/ class="bullet"/g, '')}</ul>`;
  });
  
  // Paragraphs - split by double line breaks
  const paragraphs = html.split(/\n\s*\n/);
  html = paragraphs.map(p => {
    p = p.trim();
    if (!p) return '';
    // Don't wrap if already wrapped in HTML tags
    if (p.match(/^<(h[1-6]|ul|ol|li|div|p)/)) return p;
    return `<p>${p}</p>`;
  }).join('\n');
  
  // Emoji highlighting for new content
  html = html.replace(/🆕/g, '<span style="background-color: yellow;">🆕</span>');
  
  // Convert line breaks to <br> within paragraphs
  html = html.replace(/\n/g, '<br>');
  
  return html;
}
