// Debug mode - set to true to prevent API calls to Zenodo
const DEBUG_MODE = false;

const DEFAULT_SECONDS_PER_SLIDE = 5
const SLIDESHOW_INTERVAL_KEY = 'gallery_slideshow_interval_seconds_v1';

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

const communities = ["euraf-media"]

var currentPage = 1;
const photosPerPage = 10000;
var photos = [];
var filteredPhotos = []; // <-- new: current filtered subset
var displayedPhotos = []; // photos currently rendered in the gallery
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

// Sorting state
let currentSort = { field: "date", direction: "desc" };
const SORT_CACHE_KEY = 'gallery_sort_options_v1';

// --- Zenodo hits cache helpers ---
const ZENODO_CACHE_KEY = 'zenodo_hits_cache_v1';
const ZENODO_CACHE_TIMESTAMP_KEY = 'zenodo_hits_cache_timestamp_v1';
const ZENODO_CACHE_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000; // 1 year

const gallery = document.getElementById("gallery");

// Isotope grid state
let isotopeGrid = null;
let isotopeInitialized = false;

// Word cloud categories state
let categories = {};

// Patch DOMContentLoaded to apply filter from URL after setup
const origDOMContentLoaded = document.addEventListener;
document.addEventListener = function(type, listener, options) {
  if (type === "DOMContentLoaded") {
    origDOMContentLoaded.call(document, type, async function(event) {
      await listener(event);
      // (filter from URL now handled after async setup in DOMContentLoaded above)
    }, options);
  } else {
    origDOMContentLoaded.call(document, type, listener, options);
  }
};


document.addEventListener("DOMContentLoaded", async () => {
    setupSortControls();
    setInitialColumns();
    showTopProgressBar();

    /*******
     *  1) CHECK URL
     */

    // Auto-switch to map view if URL ends with /map, and restore zoom/center if present
    const url = new URL(window.location);
    let shouldShowMap = url.pathname.endsWith('/map');
    let mapZoom = null, mapLat = null, mapLng = null;
    if (shouldShowMap) {
        // Parse zoom/center from URL params if present
        if (url.searchParams.has('zoom')) mapZoom = parseInt(url.searchParams.get('zoom'), 10);
        if (url.searchParams.has('lat')) mapLat = parseFloat(url.searchParams.get('lat'));
        if (url.searchParams.has('lng')) mapLng = parseFloat(url.searchParams.get('lng'));
        document.getElementById('gallery').style.display = 'none';
        document.getElementById('gallery-map').style.display = 'block';
        document.querySelectorAll('.btn-map').forEach(b => b.style.display = 'none');
        document.querySelectorAll('.btn-gallery').forEach(b => b.style.display = 'inline-block');
        document.body.classList.add('gallery-map-visible');
        initGalleryMap();
        if (window.galleryMap) {
          setTimeout(() => window.galleryMap.invalidateSize(true), 0);
        }
        // If zoom/center present, set map view after map is ready
        if (window.galleryMap && mapZoom && mapLat && mapLng) {
            window.galleryMap.setView([mapLat, mapLng], mapZoom);
        }
    } else {
        document.querySelectorAll('.btn-map').forEach(b => b.style.display = 'block');
        document.getElementById('gallery').style.display = 'block';
        document.getElementById('gallery-map').style.display = 'none';
        document.body.classList.remove('gallery-map-visible');
    }

    /*******
     *  1) LOAD PHOTOS
     */

    /*******
     *  1.1) LOAD PHOTOS FROM CACHE
     */

    // Check cache status for warning messages
    var { expired, zenodoCache } = loadZenodoCache();
    var cacheIsEmpty = Object.keys(zenodoCache).length === 0;
    if (cacheIsEmpty) {
        showTemporaryWarning("Welcome! We're loading the photo gallery for the first time. This may take a bit longer than usual. Thank you for your patience.", 5000);
    } else if (expired) {
        showTemporaryWarning("Checking for new photo updates. This may take a moment while we refresh the gallery. Thank you for your patience.", 5000);
    }
    // Only use cache if not expired and cache is complete
    let cachedIds = expired ? [] : Object.keys(zenodoCache);
    let cachedPhotos = cachedIds.map(id => zenodoCache[id]);
    // Sort cachedPhotos by publication date descending (most recent first)
    cachedPhotos.sort((a, b) => {
        let ad = new Date(a.metadata?.publication_date || 0);
        let bd = new Date(b.metadata?.publication_date || 0);
        return bd - ad;
    });

    try {
        var incompleteCache = true

        // Fetch total count from Zenodo (size=1, fast)
        try {
            totalRecords = await fetchTotalCount(communities);
        } catch (err) {
            showTemporaryWarning("Could not load the gallery (network or server error). Please check your connection and try again.", 7000);
            console.warn("Could not fetch total count:", err);
            totalRecords = null;
            // If count check fails, fallback to normal cache logic
        }

        if (!expired && cachedPhotos.length > 0) {
          
            if (cachedPhotos.length < totalRecords) {
                expired = true;
                // Show the same warning as for expired cache
                showTemporaryWarning("Checking for new photo updates. This may take a moment while we refresh the gallery. Thank you for your patience.", 5000);

            } else if (cachedPhotos.length === totalRecords) {
                // Cache is complete and not expired, just load cached photos and render them
                photos = [];
                cachedPhotos.forEach(photo => {
                if (!renderedRecordIds.has(photo.id)) {
                    photos.push(photo);
                    renderedRecordIds.add(photo.id);
                }
                });
                // Render photos in the gallery
                appendPhotosToGallery(photos);
                updateTopProgress();
                incompleteCache = false
                console.debug(`Loaded ${photos.length} photos from cache (no fetch needed)`);
            }
        }

        /*******
         *  1.2) LOAD PHOTOS FROM ZENODO IN  BATCHES
         */
        var stopFetching = false
        if (incompleteCache) {
          for (const community of communities) {
              // Otherwise, fetch in batches of 25
              let apiUrl = `https://zenodo.org/api/records?size=25&sort=mostrecent&communities=${community}&type=image`;
              while (apiUrl && !stopFetching) {
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

                  const newBatch = [];
                  for (const h of hits) {
                      if (renderedRecordIds.has(h.id)) {
                          // Already loaded, stop fetching further
                          stopFetching = true;
                          break;
                      }
                      photos.push(h);
                      renderedRecordIds.add(h.id);
                      zenodoCache[h.id] = h;
                      newBatch.push(h);
                  }
                  saveZenodoCache(zenodoCache);

                  // Append new photos to gallery as they arrive
                  if (newBatch.length > 0) {
                      appendPhotosToGallery(newBatch);
                  }
                  // Update loading bar after each batch
                  updateTopProgress();
                  if (stopFetching) break;
                  // follow pagination (Zenodo returns full URL in data.links.next)
                  apiUrl = data.links && data.links.next ? data.links.next : null;
              }
          }
        }

        // After fetch, all photos have already been appended progressively
        console.debug(`Fetched ${photos.length} photos from Zenodo (cache + new)`);

        /*****
         *  
         */

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

        // After all setup, apply filter from URL if present
        let urlFilter = getFilterFromUrl();
        if (urlFilter) {
          // Sanitize the filter value to match internal keyword format
          urlFilter = sanitizeKeyword(urlFilter);
          currentActiveFilter = urlFilter;
          buildWordCloud(); // ensure word cloud buttons exist and highlight
          applyFilterValue(`.${urlFilter}`);
        }

        // Ensure pins are generated if map is visible (for direct /map entry)
        const mapEl = document.getElementById('gallery-map');
        if (mapEl && mapEl.style.display === 'block' && window.galleryMap) {
          generateMapMarkers(filteredPhotos);
        }

        // After all photos are loaded, apply the current sorting
        buildGalleryPaginated(currentPage);

    } catch (err) {
        // Show a user-friendly error message if not already shown
        showTemporaryWarning("Could not load the gallery (network or server error from Zenodo endpoint). Please check your connection and try again.", 7000);
        console.error("Error fetching Zenodo photos:", err);
    }
})

/*********
 *  ZENODO PHOTOS HANDLING
 */
function loadZenodoCache() {
  try {
    const raw = localStorage.getItem(ZENODO_CACHE_KEY);
    const ts = localStorage.getItem(ZENODO_CACHE_TIMESTAMP_KEY);
    if (!raw || !ts) return { expired: true, zenodoCache: {} };
    const zenodoCache = JSON.parse(raw);
    const age = Date.now() - parseInt(ts, 10);
    if (isNaN(age) || age > ZENODO_CACHE_MAX_AGE_MS) {
      return { expired: true, zenodoCache };
    }
    return { expired: false, zenodoCache };
  } catch (e) {
    return { expired: true, zenodoCache: {} };
  }
}

// Append an array of photos to the gallery DOM and wire up lazy loading
function appendPhotosToGallery(newPhotos) {
  if (!gallery) return;

  // Build HTML for new photos and update categories incrementally
  const elements = [];
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
          htmlCoords = `<a href="${photoLink2Gmap}" target="_blank" class="icon-overlay globe-bottom-right">&#127757;</a>`;
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
      div.innerHTML = `
        <a href="${large_image_url}" class="popup-btn" data-title="${title}" data-authors="${(
          photo.metadata?.creators || []
        )
          .map((c) => c.name)
          .join(", ")}" data-year="${photo.metadata?.publication_date
          ? new Date(photo.metadata.publication_date).getFullYear()
          : ""
        }" data-doi="${doi_url}">
          <div class="photo-img-wrapper" style="position:relative;">
            <img class="img-fluid lazy" src="${thumbnail_url}" data-src="${thumbnail_url}" alt="${title}" loading="lazy">
            ${htmlCoords}
          </div>
        </a>
      `;
      div.dataset.photoId = id;
      elements.push(div);
    } catch (err) {
      console.error("Error preparing photo element", err);
    }
  }

  // Add to DOM
  elements.forEach(el => gallery.appendChild(el));

  // Initialize or update Isotope
  if (!isotopeInitialized) {
    isotopeGrid = new Isotope(gallery, {
      itemSelector: '.grid-item',
      layoutMode: 'masonry',
      percentPosition: true,
      masonry: {
        columnWidth: '.grid-sizer'
      },
      transitionDuration: '0.4s'
    });
    isotopeInitialized = true;
  } else {
    isotopeGrid.appended(elements);
    isotopeGrid.reloadItems();
    isotopeGrid.layout();
  }

  // Wait for each image to load, then trigger Isotope layout for a more responsive experience
  imagesLoaded(gallery).on('progress', function() {
    if (isotopeGrid) {
      isotopeGrid.layout();
    }
  });

  // Re-init magnific popup so new items are included
  initMagnificPopup();

  // update top progress after adding these photos
  updateTopProgress();
}

// Fetch total records count and most recent record using a very small response
async function fetchTotalCount(communities) {
  if (DEBUG_MODE) {
    console.log("DEBUG MODE: Skipping fetchTotalCount");
    return 0;
  }
  
  let sum = 0;
  for (const community of communities) {
    const url = `https://zenodo.org/api/records?communities=${encodeURIComponent(community)}&type=image&size=1`;
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

function saveZenodoCache(cache) {
  try {
    localStorage.setItem(ZENODO_CACHE_KEY, JSON.stringify(cache));
    localStorage.setItem(ZENODO_CACHE_TIMESTAMP_KEY, String(Date.now()));
  } catch (e) {}
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

/************
 *  TOP PROGRESS BAR
 */

const barContainer = document.getElementById("gallery-loading-bar-container");
const bar = document.getElementById("gallery-loading-bar");

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
  container.className = "top-progress-container";
  container.innerHTML = `
    <div class="top-progress-inner">
      <div id="top-progress-label" class="top-progress-label">Loading 0 photos</div>
      <div id="top-progress" class="top-progress">
        <div id="top-progress-bar" class="top-progress-bar"></div>
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
    if (pct >= 100) {
      topProgressLabel.textContent = `Loaded ${loaded} photos out of ${totalRecords} (${pct}%)`;
      if (topHideTimeout) clearTimeout(topHideTimeout);
      topHideTimeout = setTimeout(() => {
        const containerEl = document.getElementById("top-progress-container");
        if (containerEl) containerEl.classList.add("hidden");
        topHideTimeout = null;
      }, 2500);
    } else {
      container.classList.remove("hidden");
    }
  } else {
    // indeterminate mode: show count and a pulsing / growing width
    const pseudoPct = Math.min(95, Math.round((loaded % 20) * 5));
    topProgressBar.style.width = `${pseudoPct}%`;
    topProgressLabel.textContent = `Loading ${loaded} photos`;
    container.classList.remove("hidden");
  }
}

/************
 *  FILTERS SETUP
 */
document.querySelectorAll('.btn-filter').forEach(btn => {
  btn.addEventListener('click', () => {
    const d = document.getElementById('wordcloudDrawer');
    if (d) {
      // If word cloud is not present or empty, build it
      const wordCloud = document.getElementById('word-cloud');
      if (wordCloud && (!wordCloud.children.length || wordCloud.innerHTML.trim() === '')) {
        buildWordCloud();
      }
      // Always highlight the active filter in the word cloud
      if (currentActiveFilter) {
        setActiveFilterChip(`.${currentActiveFilter}`);
      } else {
        setActiveFilterChip('*');
      }
      d.classList.toggle('visible');
    }
  });
});
document.getElementById("close-filter")?.addEventListener("click", () => {
  const d = document.getElementById("wordcloudDrawer");
  if (d) d.classList.remove("visible");
});

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

  // re-bind word filter events (no jQuery)
  wordCloud.querySelectorAll('.word-filter').forEach(btn => {
    btn.addEventListener('click', function () {
      const filterValue = this.getAttribute('data-filter');
      wordCloud.querySelectorAll('.word-filter').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      // apply client-side filter and show active chip
      applyFilterValue(filterValue);
      setActiveFilterChip(filterValue);
      if (window.innerWidth <= 768) {
        const wordcloudDrawer = document.getElementById("wordcloudDrawer");
        if (wordcloudDrawer) wordcloudDrawer.classList.remove("visible");
      }
    });
  });

  // Highlight the correct button if a filter is active
  if (typeof currentActiveFilter === 'string' && currentActiveFilter.length > 0) {
    const btn = wordCloud.querySelector(`.word-filter[data-filter=".${currentActiveFilter}"]`);
    if (btn) btn.classList.add('active');
  } else {
    // Highlight 'All' if no filter is active
    const allBtn = wordCloud.querySelector('.word-filter[data-filter="*"]');
    if (allBtn) allBtn.classList.add('active');
  }
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
    // Unselect all filter buttons
    document.querySelectorAll('.word-filter').forEach(b => b.classList.remove('active'));
    // Select the 'All' button if present
    const allBtn = document.querySelector('.word-filter[data-filter="*"]');
    if (allBtn) allBtn.classList.add('active');
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

  // Visually select the correct filter button
  document.querySelectorAll('.word-filter').forEach(b => {
    const btnKey = b.getAttribute('data-filter');
    if (btnKey && btnKey.replace(/^\./, '') === displayKey) {
      b.classList.add('active');
    } else {
      b.classList.remove('active');
    }
  });
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

// Helper: apply a filter value from the button's data-filter (supports ".kw-xxx", ".xxx" or "*")
function applyFilterValue(filterValue, skipUrlUpdate) {
  if (!filterValue || filterValue === "*" || filterValue === "all") {
    filteredPhotos = photos.slice();
    currentActiveFilter = null;
  } else {
    const raw = String(filterValue).replace(/^\./, ""); // remove leading dot if present
    // support optional "kw-" prefix
    const sanitizedKey = raw.startsWith("kw-") ? raw.slice(3) : raw;
    filteredPhotos = photos.filter((p) => {
      const kws = (p.metadata?.keywords || []).map((k) => sanitizeKeyword(k));
      return kws.includes(sanitizedKey);
    });
    currentActiveFilter = sanitizedKey;
  }
  // render view and update UI
  buildGalleryPaginated(currentPage)
  updateTopProgress();
  generateMapMarkers(filteredPhotos, { fitToMarkers: true })
  // Update URL parameter unless told not to
  if (!skipUrlUpdate) {
    setFilterInUrl(filterValue);
  }
}

// URL filter sync helpers
function setFilterInUrl(filterValue) {
  const url = new URL(window.location);
  if (!filterValue || filterValue === '*' || filterValue === 'all') {
    url.searchParams.delete('filter');
  } else {
    url.searchParams.set('filter', filterValue.replace(/^\./, ''));
  }
  window.history.replaceState({}, '', url);
}

function getFilterFromUrl() {
  const url = new URL(window.location);
  return url.searchParams.get('filter');
}


/************
 *  MAP SETUP
 */

// Map globals (prevent ReferenceError when opening map / generating markers)
let mapMarkersLayer = null;
let europeBounds = null;
// Store last map state (zoom/center) when leaving map
let lastMapState = null;
// Store map event handler reference for removal
let mapMoveHandler = null;

// When clicking Map button
document.querySelectorAll('.btn-map').forEach(btn => {
  btn.addEventListener('click', function () {
    document.getElementById('gallery').style.display = 'none';
    document.getElementById('gallery-map').style.display = 'block';
    // Hide all map buttons, show all gallery buttons
    document.querySelectorAll('.btn-map').forEach(b => b.style.display = 'none');
    document.querySelectorAll('.btn-gallery').forEach(b => b.style.display = 'inline-block');
    // Hide sorting controls when switching to map view
    document.body.classList.add('gallery-map-visible');
    // Update URL to /map (SPA style) and add zoom/center from lastMapState if available
    const url = new URL(window.location);
    let base = url.pathname.replace(/\/map$/, '').replace(/\/gallery$/, '').replace(/\/+$/, '');
    url.pathname = base + '/map';
    let zoom, lat, lng;
    if (lastMapState) {
      zoom = lastMapState.zoom;
      lat = lastMapState.lat;
      lng = lastMapState.lng;
    } else if (window.galleryMap) {
      const center = window.galleryMap.getCenter();
      zoom = window.galleryMap.getZoom();
      lat = center.lat;
      lng = center.lng;
    }
    if (zoom && lat && lng) {
      url.searchParams.set('zoom', zoom);
      url.searchParams.set('lat', parseFloat(lat).toFixed(5));
      url.searchParams.set('lng', parseFloat(lng).toFixed(5));
    }
    window.history.replaceState({}, '', url);
    // initialize map and generate markers for the current filtered set
    initGalleryMap();
    if (window.galleryMap) {
      // Ensure Leaflet recalculates viewport after un-hiding the map container.
      setTimeout(() => window.galleryMap.invalidateSize(true), 0);
    }
    // If restoring, set map view
    if (lastMapState && window.galleryMap) {
      window.galleryMap.setView([parseFloat(lastMapState.lat), parseFloat(lastMapState.lng)], parseInt(lastMapState.zoom));
    }
    generateMapMarkers(filteredPhotos);
    
    // Add event to update URL on map move/zoom
    if (window.galleryMap && !window._mapUrlSync) {
      window.galleryMap.on('moveend zoomend', mapMoveHandler);
      window._mapUrlSync = true;
    }
  });
});

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
  /*window.galleryMap.setMaxBounds(europeBounds.pad(0.4));
  window.galleryMap.options.minZoom = 3;
  window.galleryMap.options.maxZoom = 18;*/

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

  mapMoveHandler = function() {
    const c = window.galleryMap.getCenter();
    const z = window.galleryMap.getZoom();
    const url2 = new URL(window.location);
    url2.searchParams.set('zoom', z);
    url2.searchParams.set('lat', c.lat.toFixed(5));
    url2.searchParams.set('lng', c.lng.toFixed(5));
    window.history.replaceState({}, '', url2);
    // Save to lastMapState
    lastMapState = { zoom: z, lat: c.lat, lng: c.lng };
  };
}

// Generate / refresh markers from a given photo list (defaults to photos array)
function generateMapMarkers(list = photos, options = {}) {
  const mapEl = document.getElementById("gallery-map");
  const mapIsVisible = !!mapEl && mapEl.style.display !== "none";

  // Avoid creating the map while hidden (it can produce an incorrect first render).
  if (!window.galleryMap && !mapIsVisible) return;
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

  // Fit view to markers or to Europe bounds, unless URL has zoom/center
  const url = new URL(window.location);
  const hasMapParams = url.searchParams.has('zoom') && url.searchParams.has('lat') && url.searchParams.has('lng');
  const forceFitToMarkers = !!options.fitToMarkers;
  if (forceFitToMarkers) {
    if (markers.length) {
      const group = L.featureGroup(markers);
      try {
        window.galleryMap.fitBounds(group.getBounds().pad(0.15));
      } catch (e) {
        // ignore fit errors
      }
    } else if (europeBounds) {
      // If the selected filter has no geotagged photos, keep a sensible Europe fallback.
      window.galleryMap.fitBounds(europeBounds.pad(0.05));
    }
  } else if (!hasMapParams) {
    if (!lastMapState && europeBounds) {
      // First map entry defaults to Europe extent for a consistent initial experience.
      window.galleryMap.fitBounds(europeBounds.pad(0.05));
    } else if (markers.length) {
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
  // Always (re)bind map move/zoom events to update URL after loading
  if (window.galleryMap && !window._mapUrlSync) {
    window.galleryMap.on('moveend zoomend', mapMoveHandler);
    window._mapUrlSync = true;
  }
}

// When changing to Gallery
function killMap() {
    // Remove map move/zoom event handler if present
      if (window.galleryMap && mapMoveHandler && document.getElementById('gallery-map').style.display !== 'none') {
      window.galleryMap.off('moveend zoomend', mapMoveHandler);
      window._mapUrlSync = false;
    }
    // Update URL to base '/' (SPA style) and always remove zoom/lat/lng
    const url = new URL(window.location);
    let base = url.pathname.replace(/\/map$/, '').replace(/\/gallery$/, '').replace(/\/+$/, '');
    url.pathname = base === '' ? '/' : base + '/';
    // Save current map state if map is present
    if (window.galleryMap && document.getElementById('gallery-map').style.display !== 'none') {
      const c = window.galleryMap.getCenter();
      const z = window.galleryMap.getZoom();
      lastMapState = { zoom: z, lat: c.lat, lng: c.lng };
    }
    // Remove zoom/lat/lng from URL regardless of map state
    url.searchParams.delete('zoom');
    url.searchParams.delete('lat');
    url.searchParams.delete('lng');
    window.history.replaceState({}, '', url);
}

/************
 *  GALLERY BUTTON
 */

document.querySelectorAll('.btn-gallery').forEach(btn => {
  btn.addEventListener('click', function () {
      killMap()
      // re-render gallery from current filteredPhotos so the view is up-to-date
      document.getElementById('gallery').style.display = 'block';
      document.getElementById('gallery-map').style.display = 'none';
      // Hide all gallery buttons, show all map buttons
      document.querySelectorAll('.btn-gallery').forEach(b => b.style.display = 'none');
      document.querySelectorAll('.btn-map').forEach(b => b.style.display = 'inline-block');
      // Show sorting controls when switching to gallery view
      document.body.classList.remove('gallery-map-visible');
      try {
        buildGalleryPaginated(currentPage);
        updateTopProgress();
      } catch (e) {
        console.warn('Error updating gallery on toggle:', e);
      }
  });
});

// Build paginated view from already fetched photos (client-side)
function buildGalleryPaginated(page) {
  if (!gallery) return;
  // Remove all items from Isotope and DOM
  if (isotopeGrid) {
    isotopeGrid.remove(isotopeGrid.getItemElements());
    isotopeGrid.layout();
  }
  gallery.innerHTML = '<div class="grid-sizer"></div>';
  let sortedPhotos = filteredPhotos
  if (currentSort.field === "date") {
    sortedPhotos.sort((a, b) => {
      let ad = new Date(a.metadata?.publication_date || 0);
      let bd = new Date(b.metadata?.publication_date || 0);
      return currentSort.direction === "asc" ? ad - bd : bd - ad;
    });
  } else if (currentSort.field === "title") {
    sortedPhotos.sort((a, b) => {
      let at = (a.metadata?.title || "").toLowerCase();
      let bt = (b.metadata?.title || "").toLowerCase();
      if (at < bt) return currentSort.direction === "asc" ? -1 : 1;
      if (at > bt) return currentSort.direction === "asc" ? 1 : -1;
      return 0;
    });
  }
  const startIdx = (page - 1) * photosPerPage;
  const endIdx = startIdx + photosPerPage;
  const paginated = sortedPhotos.slice(startIdx, endIdx);
  displayedPhotos = paginated.slice();
  // Render sorted photos directly
  appendPhotosToGallery(paginated);
  // No need to call Isotope sort, since DOM order matches sort
  if (isotopeGrid) {
    isotopeGrid.reloadItems();
    isotopeGrid.layout();
  }
  generateMapMarkers(paginated)
}

/***********
 *  ABOUT, ADD PHOTOS AND EMBED BUTTONS
 */

// Function to load and display Zenodo instructions from Markdown file
document.querySelectorAll('.btn-add-photos').forEach(btn => {
  btn.addEventListener('click', async () => {
    const addDrawer = document.getElementById('addPhotosDrawer');
    const embedDrawer = document.getElementById('embedDrawer');
    if (!addDrawer) return;
    // Close embed drawer if open
    if (embedDrawer && embedDrawer.classList.contains('visible')) {
      embedDrawer.classList.remove('visible');
    }
    // Load Markdown instructions if not already loaded
    await loadZenodoInstructions();
    addDrawer.classList.toggle('visible');
  });
});
document.getElementById("close-add-photos")?.addEventListener("click", () => {
  const d = document.getElementById("addPhotosDrawer");
  if (d) d.classList.remove("visible");
});
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
    converter.setOption('simpleLineBreaks', true)
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

// Function to load and display embedding instructions from Markdown file
document.querySelectorAll('.btn-embed').forEach(btn => {
  btn.addEventListener('click', async () => {
    const embedDrawer = document.getElementById('embedDrawer');
    const addDrawer = document.getElementById('addPhotosDrawer');
    if (!embedDrawer) return;
    // Close add photo drawer if open
    if (addDrawer && addDrawer.classList.contains('visible')) {
      addDrawer.classList.remove('visible');
    }
    // Load Markdown instructions if not already loaded
    await loadEmbeddingInstructions();
    embedDrawer.classList.toggle('visible');
  });
});
document.getElementById("close-embed")?.addEventListener("click", () => {
  const d = document.getElementById("embedDrawer");
  if (d) d.classList.remove("visible");
});
async function loadEmbeddingInstructions() {
  const contentContainer = document.getElementById("embed-content");
  if (!contentContainer) return;
  
  // Check if instructions are already loaded
  if (contentContainer.dataset.loaded === "true") return;
  
  try {
    const response = await fetch('./embedding-instructions.md');
    if (!response.ok) throw new Error('Failed to load embedding instructions');
    
    const markdownText = await response.text();
    var converter = new showdown.Converter()
    converter.setOption('disableForced4SpacesIndentedSublists', true);
    converter.setOption('headerLevelStart', 4)
    converter.setOption('simpleLineBreaks', true)
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
    console.warn('Could not load embedding instructions from Markdown file:', error);
    // Keep existing HTML content as fallback
  }
}

// Function to load README content into About modal
document.querySelectorAll('.btn-about').forEach(btn => {
  btn.addEventListener('click', async function () {
    await loadAboutContent();
    $("#aboutModal").modal("show");
  });
});
async function loadAboutContent() {
  const modalBody = document.getElementById("aboutModalBody");
  if (!modalBody) return;
  
  // Check if content is already loaded
  if (modalBody.dataset.loaded === "true") return;
  
  try {
    const response = await fetch('./README.md');
    if (!response.ok) throw new Error('Failed to load README');
    
    const markdownText = await response.text();
    
    // Extract the first section (everything before the first ## heading after the title)
    const lines = markdownText.split('\n');
    const firstSectionLines = [];
    let foundFirstHeading = false;
    
    for (const line of lines) {
      if (line.startsWith('## ') && foundFirstHeading) {
        break; // Stop at the first ## heading after we've started
      }
      if (line.startsWith('# ')) {
        foundFirstHeading = true;
      }
      firstSectionLines.push(line);
    }
    
    const firstSection = firstSectionLines.join('\n');
    
    // Convert to HTML using the same function as for instructions
    var converter = new showdown.Converter()
    // converter.setFlavor('github');
    converter.setOption('disableForced4SpacesIndentedSublists', true);
    converter.setOption('headerLevelStart', 4)
    converter.setOption('simpleLineBreaks', true)
    /*converter.setOption('smartIndentationFix', true);*/
    const htmlContent = converter.makeHtml(firstSection);
    
    modalBody.innerHTML = htmlContent;
    modalBody.dataset.loaded = "true";
    
  } catch (error) {
    console.warn('Could not load README content:', error);
    modalBody.innerHTML = '<p>Unable to load content. Please visit our <a href="https://github.com/euraf/agroforestry-gallery" target="_blank">GitHub repository</a> for more information.</p>';
  }
}

// --- SLIDESHOW FEATURE ---
// Add event listeners for both slideshow buttons
['open-slideshow-sm', 'open-slideshow-lg'].forEach(id => {
  const btn = document.getElementById(id);
  if (btn) {
    btn.addEventListener('click', () => startSlideshow(getSlideshowPhotos()));
  }
});

function getSlideshowPhotos() {
  // Prefer exactly what the user is currently seeing in the gallery.
  if (Array.isArray(displayedPhotos) && displayedPhotos.length > 0) {
    return displayedPhotos;
  }
  // Fallback for initial loading states.
  return filteredPhotos;
}

function formatCreatorName(name) {
  const raw = String(name || '').trim();
  if (!raw) return '';
  const parts = raw.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return raw;
  return `${parts.slice(1).join(' ')} ${parts[0]}`.replace(/\s+/g, ' ').trim();
}

function getSlideshowIntervalSeconds() {
  const raw = localStorage.getItem(SLIDESHOW_INTERVAL_KEY);
  const parsed = Number(raw);
  if (Number.isFinite(parsed) && parsed >= 1) {
    return parsed;
  }
  return DEFAULT_SECONDS_PER_SLIDE;
}

function setSlideshowIntervalSeconds(seconds) {
  const parsed = Number(seconds);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_SECONDS_PER_SLIDE;
  const normalized = Math.round(parsed);
  localStorage.setItem(SLIDESHOW_INTERVAL_KEY, String(normalized));
  return normalized;
}

async function animateOpacity(element, from, to, durationMs) {
  
  if (!element) return;
  const hasAnimate = typeof element.animate === 'function';
  
  if (hasAnimate) {
    try {
      await element
        .animate(
          [{ opacity: from }, { opacity: to }],
          {
            duration: durationMs,
            easing: 'ease',
            fill: 'forwards'
          }
        )
        .finished;
      return;
    } catch (e) {
      // Fallback below if animation is interrupted.
    }
  }

  element.style.opacity = String(from);
  element.style.transition = `opacity ${durationMs}ms ease`;
  requestAnimationFrame(() => {
    element.style.opacity = String(to);
  });
  await new Promise((resolve) => setTimeout(resolve, durationMs));
}

let slideshowSessionId = 0;

function startSlideshow(photos) {
  if (!photos || !photos.length) {
    showTemporaryWarning('No photos to show in slideshow.');
    return;
  }

  const sessionId = ++slideshowSessionId;

  // Create overlay if not exists
  let overlay = document.getElementById('slideshow-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'slideshow-overlay';
    overlay.innerHTML = `
      <div class="slideshow-content">
        <img id="slideshow-img" src="" alt="Slideshow Photo" />
        <button id="slideshow-prev" title="Previous">&#8592;</button>
        <button id="slideshow-next" title="Next">&#8594;</button>
        <button id="slideshow-exit" title="Exit">&times;</button>
        <div id="slideshow-caption"></div>
      </div>
    `;
    document.body.appendChild(overlay);
  }
  overlay.style.display = 'flex';

  // Clear previous run visual state so a reopened slideshow always starts clean.
  const initialImg = document.getElementById('slideshow-img');
  const initialCaption = document.getElementById('slideshow-caption');
  if (initialImg) {
    initialImg.removeAttribute('src');
    initialImg.alt = 'Slideshow Photo';
    initialImg.style.opacity = '0';
  }
  if (initialCaption) {
    initialCaption.textContent = '';
  }

  // Show controls initially
  overlay.classList.add('show-controls');
  if (overlay.requestFullscreen) {
    overlay.requestFullscreen();
  } else if (overlay.webkitRequestFullscreen) {
    overlay.webkitRequestFullscreen();
  } else if (overlay.msRequestFullscreen) {
    overlay.msRequestFullscreen();
  }

  // Hide controls after inactivity
  let controlsTimeout;
  function showControls() {
    overlay.classList.add('show-controls');
    clearTimeout(controlsTimeout);
    controlsTimeout = setTimeout(() => {
      overlay.classList.remove('show-controls');
    }, 2000);
  }
  overlay.addEventListener('mousemove', showControls);
  overlay.addEventListener('mousedown', showControls);
  overlay.addEventListener('touchstart', showControls);
  // Always show on keyboard nav
  overlay.addEventListener('keydown', showControls);

  let idx = 0;
  let secondsPerSlide = getSlideshowIntervalSeconds();
  let autoAdvanceTimer = null;
  let slideRequestId = 0;
  const fadeDurationMs = 500;

  const intervalInput = document.getElementById('slideshow-interval');
  if (intervalInput) {
    intervalInput.value = String(secondsPerSlide);
    intervalInput.onchange = () => {
      const updated = setSlideshowIntervalSeconds(intervalInput.value);
      secondsPerSlide = updated;
      intervalInput.value = String(updated);
      stopAutoAdvance();
      startAutoAdvance();
    };
  }

  function showPhoto(i, resetTimer = true) {
    // Loop: wrap index
    if (i < 0) idx = photos.length - 1;
    else if (i >= photos.length) idx = 0;
    else idx = i;
    const photo = photos[idx];
    const img = document.getElementById('slideshow-img');
    const caption = document.getElementById('slideshow-caption');
    // Try to use large image if available (Zenodo IIIF full/600)
    let largeUrl = '';
    if (photo.files && photo.files[0] && photo.id) {
      const filename = photo.files[0].key;
      largeUrl = `https://zenodo.org/api/iiif/record:${photo.id}:${filename}/full/600,/0/default.png`;
    }
    const nextSrc = largeUrl || photo.image_url || photo.url || '';
    const nextAlt = photo.title || '';
    const authorNames = (photo.metadata?.creators || [])
      .map((c) => formatCreatorName(c.name))
      .filter(Boolean)
      .join('; ');
    const nextCaption = authorNames
      ? `${photo.title || ''} — by ${authorNames}`
      : (photo.title || '');
    const requestId = ++slideRequestId;

    // Keep image and caption synchronized by committing both only when the slide is ready.
    const commitSlide = async () => {
      if (sessionId !== slideshowSessionId) return;
      if (requestId !== slideRequestId) return;

      const hasCurrentImage = !!img.getAttribute('src');
      
      if (hasCurrentImage) {
        await animateOpacity(img, 1, 0, fadeDurationMs);
        if (sessionId !== slideshowSessionId) return;
        if (requestId !== slideRequestId) return;
      } else {
        img.style.opacity = '0';
      }

      img.src = nextSrc;
      img.alt = nextAlt;
      caption.textContent = nextCaption;
      await animateOpacity(img, 0, 1, fadeDurationMs);
      if (sessionId !== slideshowSessionId) return;
      if (requestId !== slideRequestId) return;

      if (resetTimer) startAutoAdvance();
    };

    if (resetTimer) stopAutoAdvance();

    if (nextSrc) {
      const preload = new Image();
      preload.onload = commitSlide;
      preload.onerror = commitSlide;
      preload.src = nextSrc;
    } else {
      commitSlide();
    }
  }
  function startAutoAdvance() {
    if (autoAdvanceTimer) clearTimeout(autoAdvanceTimer);
    autoAdvanceTimer = setTimeout(() => {
      showPhoto(idx + 1, true);
    }, Math.max(1, secondsPerSlide) * 1000);
  }
  function stopAutoAdvance() {
    if (autoAdvanceTimer) clearTimeout(autoAdvanceTimer);
  }
  showPhoto(0);

  // Button handlers
  document.getElementById('slideshow-prev').onclick = () => { showPhoto(idx - 1, true); };
  document.getElementById('slideshow-next').onclick = () => { showPhoto(idx + 1, true); };
  document.getElementById('slideshow-exit').onclick = exitSlideshow;

  function exitSlideshow() {
    // Invalidate any in-flight image preload callbacks from this run.
    slideshowSessionId++;
    overlay.style.display = 'none';
    overlay.classList.remove('show-controls');
    stopAutoAdvance();
    // Remove event listeners to avoid leaks
    overlay.removeEventListener('mousemove', showControls);
    overlay.removeEventListener('mousedown', showControls);
    overlay.removeEventListener('touchstart', showControls);
    overlay.removeEventListener('keydown', showControls);
    overlay.removeEventListener('mousemove', pauseAndResume);
    overlay.removeEventListener('mousedown', pauseAndResume);
    overlay.removeEventListener('touchstart', pauseAndResume);
    overlay.removeEventListener('keydown', pauseAndResume);
    document.exitFullscreen?.();
  }

  // Pause auto-advance on user interaction, resume after
  function pauseAndResume() {
    stopAutoAdvance();
    startAutoAdvance();
  }
  overlay.addEventListener('mousemove', pauseAndResume);
  overlay.addEventListener('mousedown', pauseAndResume);
  overlay.addEventListener('touchstart', pauseAndResume);
  overlay.addEventListener('keydown', pauseAndResume);

  // Keyboard navigation
  overlay.tabIndex = 0;
  overlay.focus();
  overlay.onkeydown = (e) => {
    if (e.key === 'ArrowLeft') showPhoto(idx - 1, true);
    else if (e.key === 'ArrowRight') showPhoto(idx + 1, true);
    else if (e.key === 'Escape') exitSlideshow();
  };
}


/*********
 *  SORT CONTROLS
 */

// Add sorting controls UI
function setupSortControls() {
  let controls = document.getElementById("gallery-sort-controls");

  // Bind events - Drop down for sorting method
  controls.querySelector("#sort-field").addEventListener("change", function() {
    currentSort.field = this.value;
    saveSortOptions();
    buildGalleryPaginated(currentPage);
  });

  // Bind events - Arrow button for sort direction
  const sortArrowBtn = controls.querySelector('#sort-arrow-btn');
  const sortArrowIcon = controls.querySelector('#sort-arrow-icon');
  sortArrowBtn.addEventListener('click', function() {
    currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
    sortArrowIcon.textContent = currentSort.direction === 'asc' ? '▲' : '▼';
    saveSortOptions();
    buildGalleryPaginated(currentPage);
  });

  // Set initial values from cache if present
  try {
    const raw = localStorage.getItem(SORT_CACHE_KEY);
    if (!raw) return;
    const opts = JSON.parse(raw);
    if (opts && typeof opts === 'object') {
      if (opts.field) currentSort.field = opts.field;
      if (opts.direction) currentSort.direction = opts.direction;
    }

    controls.querySelector("#sort-field").value = currentSort.field;
    sortArrowIcon.textContent = currentSort.direction === 'asc' ? '▲' : '▼';

  } catch (err) {
    console.warn("Could not fetch sort initial values from cache:", err);
  }
}

function saveSortOptions() {
  try {
    localStorage.setItem(SORT_CACHE_KEY, JSON.stringify(currentSort));
  } catch (e) {}
}


/********
 *  NUMBER OF COLUMNS
 */
function setInitialColumns() {
  let controls = document.getElementById("gallery-sort-controls");
  // Set initial columns from localStorage or default
  const colSel = controls.querySelector("#gallery-columns");
  let savedCols = localStorage.getItem('gallery_column_count');
  if (!savedCols) {
    // Set initial columns based on device width
    let initialCols = 3;
    if (window.innerWidth < 500) initialCols = 1;
    else if (window.innerWidth < 900) initialCols = 2;
    else if (window.innerWidth < 1200) initialCols = 3;
    else if (window.innerWidth < 1600) initialCols = 4;
    else initialCols = 5;
    colSel.value = initialCols;
    setGalleryColumns(initialCols);
    localStorage.setItem('gallery_column_count', initialCols);
  } else {
    colSel.value = savedCols;
    setGalleryColumns(parseInt(colSel.value, 10));
  }
  // Bind event
  colSel.addEventListener("change", function() {
    localStorage.setItem('gallery_column_count', this.value);
    setGalleryColumns(parseInt(this.value, 10));
  });
}

// Set the number of columns for the gallery grid
function setGalleryColumns(n) {
  const grid = document.getElementById('gallery');
  if (!grid) return;
  grid.classList.remove('columns-1','columns-2','columns-3','columns-4','columns-5');
  grid.classList.add('columns-' + n);
  // If Isotope is initialized, trigger a layout update
  if (isotopeGrid) {
    isotopeGrid.layout();
  }
}

/*********
 *  REFRESH GALLERY BUTTON
 */
var updateBtn = document.getElementById('refresh-gallery-btn');
if (updateBtn) {
    updateBtn.addEventListener('click', fullUpdateLocalStoragePhotos);
}

// LocalStorage full update button handler ---
function fullUpdateLocalStoragePhotos() {
  // Remove all gallery-related localStorage keys
  localStorage.removeItem('galleryPhotos');
  localStorage.removeItem('zenodo_hits_cache_v1');
  localStorage.removeItem('zenodo_hits_cache_timestamp_v1');
  localStorage.removeItem('gallery_sort_options_v1');
  // Optionally, reload the page to trigger a fresh load
  showTemporaryWarning('LocalStorage photos cleared. Reloading...');
  setTimeout(function() { location.reload(); }, 1200);
}

/**********
 *  MESSAGES
 */
// Show a temporary, self-disappearing warning message
function showTemporaryWarning(message, duration = 4000) {
  let warnEl = document.getElementById('gallery-temp-warning');
  if (!warnEl) {
    warnEl = document.createElement('div');
    warnEl.id = 'gallery-temp-warning';
    warnEl.className = 'gallery-temp-warning';
    document.body.appendChild(warnEl);
  }
  warnEl.textContent = message;
  warnEl.style.display = 'block';
  setTimeout(() => { warnEl.classList.add('visible'); }, 10);
  setTimeout(() => {
    warnEl.classList.remove('visible');
    setTimeout(() => { warnEl.style.display = 'none'; }, 600);
  }, duration);
}


/*********
 *  HELPER FUNCTIONS
 */

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
