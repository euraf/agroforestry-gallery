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

var currentPage = 1; // Initialize current page
const photosPerPage = 10000; // Number of photos to fetch per page
// Sanitize and store the keywords for case-insensitive comparison
var photos = [];
var totalVisualizations = 0;
const albumKeywordsSanitized = albumKeywords.map((keyword) =>
  sanitizeKeyword(keyword)
);

// Fetch photos and build the gallery on page load
document.addEventListener("DOMContentLoaded", async () => {
  photos = await fetchZenodoPhotos(); // Fetch photos from Zenodo
  totalVisualizations = photos.reduce(
    (sum, photo) => sum + (photo.stats?.views || 0),
    0
  ); // Calculate total visualizations

  // Animate the visualization counter
  const counterElement = document.getElementById("visualization-count");
  animateCounter(counterElement, 0, totalVisualizations, 2000);

  await setupPagination(); // Setup pagination buttons
  buildWordCloud();
  buildGallery(photos, currentPage); // Build the gallery and word cloud
});

async function setupPagination() {
  const totalPages = Math.ceil(photos.length / photosPerPage);
  const existingPagination = document.getElementById("gallery-pagination");
  if (existingPagination) {
    existingPagination.remove();
  }
  if (totalPages <= 1) {
    return;
  }
  const paginationContainer = document.createElement("div");
  paginationContainer.id = "gallery-pagination";
  paginationContainer.className =
    "gallery-pagination d-flex align-items-center justify-content-center text-center";

  let buttonsHTML = "";
  for (let i = 1; i <= totalPages; i++) {
    buttonsHTML += `<button class="page-btn btn btn-sm mx-1${
      i === currentPage ? " active" : ""
    }" data-page="${i}">${i}</button>`;
  }

  const pagesDiv = document.createElement("div");
  pagesDiv.innerHTML = buttonsHTML;
  pagesDiv.className = "pages-btn-group";
  paginationContainer.appendChild(pagesDiv);

  const wrapper = document.getElementById("wrapper");
  wrapper.parentNode.insertBefore(paginationContainer, wrapper.nextSibling);

  document.querySelectorAll(".page-btn").forEach((btn) => {
    btn.addEventListener("click", async function () {
      currentPage = parseInt(this.getAttribute("data-page"));
      buildGallery(photos, currentPage);
      document
        .querySelectorAll(".page-btn")
        .forEach((b) => b.classList.remove("active"));
      this.classList.add("active");
    });
  });
}

// Fetch data from Zenodo API
async function fetchZenodoPhotos() {
  let communities = ["euraf-media"]; // Zenodo communities
  let allPhotos = [];

  for (let community of communities) {
    let apiUrl = `https://zenodo.org/api/records?q=communities:${community} AND resource_type.type:image`;
    let response = await fetch(apiUrl); // Fetch data from Zenodo
    let data = await response.json(); // Parse the response as JSON

    if (data.hits && data.hits.hits.length > 0) {
      allPhotos = allPhotos.concat(data.hits.hits); // Append the photos to the allPhotos array
    }
  }
  //console.log(allPhotos)
  footermessage.innerHTML =
    " Fetched " + allPhotos.length + " photos from zenodo";
  return allPhotos; // Return all the photos
}

function buildWordCloud() {
  const wordCloud = document.getElementById("word-cloud");
  const explanationBox = document.createElement("div");
  explanationBox.innerHTML =
    '<p class="explanation-box text-center small p-2">These filter words are fetched from keywords on the Zenodo records. <a href="https://zenodo.org/doi/10.5281/zenodo.7953307" target="_blank">Official EURAF agroforestry typologies</a> are shown in <span class="album-keyword"><strong>bold green</strong></span>.</p>';
  wordCloud.before(explanationBox); // Insert explanation before word cloud
  let categories = {};

  // Iterate through the photos
  for (const photo of photos) {
    // Track categories for the word cloud
    if (photo.metadata.keywords) {
      photo.metadata.keywords.forEach((kw) => {
        const sanitizedKeyword = sanitizeKeyword(kw);
        if (!categories[sanitizedKeyword]) {
          categories[sanitizedKeyword] = {
            keyword: kw,
            count: 0,
          };
        }
        categories[sanitizedKeyword].count++;
      });
    }
  }

  // Build word cloud
  wordCloud.innerHTML = `<button class="word-filter" data-filter="*">All 📷 <sup>${photos.length}</sup></button>`;

  // Get all sanitized keywords and sort them alphabetically
  const sortedSanitizedKeywords = Object.keys(categories).sort((a, b) => {
    // Sort case-insensitive
    return a.localeCompare(b, undefined, { sensitivity: "base" });
  });

  for (const sanitizedKeyword of sortedSanitizedKeywords) {
    const originalKeyword = categories[sanitizedKeyword].keyword;
    const isAlbum = albumKeywordsSanitized.includes(sanitizedKeyword);
    const additionalClass = isAlbum ? "album-keyword" : "";
    wordCloud.innerHTML += `<button class="word-filter ${additionalClass}" data-filter=".${sanitizedKeyword}">${originalKeyword} <sup>${categories[sanitizedKeyword].count}</sup></button>`;
    footermessage.innerHTML = `Building filter for ${originalKeyword}`;
  }
}

/*
async function buildGallery(photos, currentPage) {
  debugger
  const gallery = document.getElementById("gallery");
  gallery.classList.add("gallery-hidden");
  const barContainer = document.getElementById("gallery-loading-bar-container");
  const bar = document.getElementById("gallery-loading-bar");
  const barText = document.getElementById("gallery-loading-bar-text");

  // Show loading bar
  if (barContainer) {
    barContainer.style.display = "block";
    bar.style.width = "0%";
    barText.textContent = "Loading photos...";
  }

  gallery.innerHTML = '<div class="grid-sizer"></div>'; // Clear previous items

  // Sort photos by publication date (descending: newest first)
  const sortedPhotos = photos.slice().sort((a, b) => {
    const dateA = new Date(a.metadata.publication_date);
    const dateB = new Date(b.metadata.publication_date);
    return dateB - dateA;
  });

  // Calculate start and end indices for pagination
  const startIdx = (currentPage - 1) * photosPerPage;
  const endIdx = startIdx + photosPerPage;
  const paginatedPhotos = sortedPhotos.slice(startIdx, endIdx);

  // Add items to gallery
  for (const photo of paginatedPhotos) {
    try {
      debugger
      const id = photo.id;
      const filename = photo.files[0].key;
      const image_url_500 = `https://zenodo.org/api/iiif/record:${id}:${filename}/full/500,/0/default.png`;
      const doi_url = `https://www.doi.org/${photo.doi}`;
      const title = photo.metadata.title || "Untitled";
      footermessage.innerHTML = `Processing ${photo.title}`;

      const authors = photo.metadata.creators
        .map((creator) => creator.name)
        .join(", ");
      const year = new Date(photo.metadata.publication_date).getFullYear();

      let htmlCoords = "";
      if (photo.metadata.custom) {
        const latDD = photo.metadata.custom["dwc:decimalLatitude"]?.[0];
        const lonDD = photo.metadata.custom["dwc:decimalLongitude"]?.[0];
        if (latDD && lonDD) {
          const photoLink2Gmap = BuildLink2Gmap(lonDD, latDD);
          htmlCoords = `<a href="${photoLink2Gmap}" target="_blank" class="icon-overlay">&#127757;</a>`;
        }
      }

      let category_classes = "";
      if (photo.metadata.keywords) {
        category_classes = photo.metadata.keywords
          .map((kw) => {
            return sanitizeKeyword(kw);
          })
          .join(" ");
      }

      const item = `
          <div class="grid-item ${category_classes} ">
              <a href="${image_url_500}" class="popup-btn" data-title="${title}" data-authors="${authors}" data-year="${year}" data-doi="${doi_url}">
                  <img class="img-fluid lazy" src="${image_url_500}" data-src="${image_url_500}" alt="${title}" loading="lazy" crossorigin="anonymous">
                  ${htmlCoords} <!-- World icon with link -->
              </a>
          </div>`;
      gallery.innerHTML += item;
    } catch (error) {
      console.error(`Error processing photo: ${photo.id}`, error);
    }
  }

  // Wait for all images to load and update the loading bar
  const images = Array.from(gallery.querySelectorAll("img"));
  let loaded = 0;
  const total = images.length;

// Start loading all images without waiting
images.forEach((img, index) => {
  // Set crossorigin before checking complete status
  img.crossOrigin = "anonymous";
  
  const updateProgress = () => {
    loaded++;
    // Update progress bar immediately
    if (bar) bar.style.width = `${(loaded / total) * 100}%`;
    if (barText) barText.textContent = `Loading photo ${loaded} of ${total}...`;
    
    // Hide loading bar when all images are done
    if (loaded >= total && barContainer) {
      setTimeout(() => {
        barContainer.style.display = "none";
      }, 500); // Small delay to show 100% completion
    }
  };

  // Check if image is already loaded
  if (img.complete && img.naturalWidth > 0) {
    updateProgress();
    return;
  }

  // Set up load/error handlers
  let hasResolved = false;
  
  const handleComplete = () => {
    if (!hasResolved) {
      hasResolved = true;
      updateProgress();
    }
  };

  img.addEventListener('load', handleComplete, { once: true });
  img.addEventListener('error', handleComplete, { once: true });
  
  // Fallback timeout
  setTimeout(() => {
    if (!hasResolved) {
      console.warn(`Image load timeout for: ${img.src}`);
      hasResolved = true;
      updateProgress();
    }
  }, 5000);

  // Trigger loading if needed
  if (img.src && !img.complete) {
    const originalSrc = img.src;
    img.src = '';
    img.src = originalSrc;
  }
});

// Don't wait for images - continue with Isotope setup
// The progress bar will update as images load in the background
/*
  await Promise.all(
    images.map((img, index) => {
      return new Promise((resolve) => {
        // Set crossorigin before checking complete status
        img.crossOrigin = "anonymous";
        
        const updateProgress = () => {
          loaded++;
          if (bar) bar.style.width = `${(loaded / total) * 100}%`;
          if (barText)
            barText.textContent = `Loading photo ${loaded} of ${total}...`;
          resolve();
        };

        // Check if image is already loaded
        if (img.complete && img.naturalWidth > 0) {
          updateProgress();
          return;
        }

        // Set up load/error handlers
        let hasResolved = false;
        
        const handleComplete = () => {
          if (!hasResolved) {
            hasResolved = true;
            updateProgress();
          }
        };

        img.addEventListener('load', handleComplete, { once: true });
        img.addEventListener('error', handleComplete, { once: true });
        
        // Fallback timeout in case neither event fires
        setTimeout(() => {
          if (!hasResolved) {
            console.warn(`Image load timeout for: ${img.src}`);
            hasResolved = true;
            updateProgress();
          }
        }, 10000); // 10 second timeout

        // Trigger loading if src is already set
        if (img.src && !img.complete) {
          // Force reload by setting src again
          const originalSrc = img.src;
          img.src = '';
          img.src = originalSrc;
        }
      });
    })
  );*/

  /*await Promise.all(
    images.map((img) => {
      return new Promise((resolve) => {
        if (img.complete) {
          loaded++;
          if (bar) bar.style.width = `${(loaded / total) * 100}%`;
          if (barText)
            barText.textContent = `Loading photo ${loaded} of ${total}...`;
          resolve();
        } else {
          img.onload = img.onerror = () => {
            loaded++;
            if (bar) bar.style.width = `${(loaded / total) * 100}%`;
            if (barText)
              barText.textContent = `Loading photo ${loaded} of ${total}...`;
            resolve();
          };
        }
      });
    })
  );

  // Hide loading bar when done
  if (barContainer) {
    barContainer.style.display = "none";
  }

  // Destroy previous Isotope instance if exists
  if ($(".grid").data("isotope")) {
    $(".grid").isotope("destroy");
  }

  var $grid = $(".grid").imagesLoaded(function () {
    $grid.isotope({
      itemSelector: ".grid-item",
      percentPosition: true,
      masonry: {
        columnWidth: ".grid-sizer",
      },
    });
    // Show gallery after Isotope is ready
    gallery.classList.remove("gallery-hidden");
  });

  // Filter items when button is clicked
  $(".filter-button-group").on("click", "button", function () {
    var filterValue = $(this).attr("data-filter");
    $grid.isotope({ filter: filterValue });
  });

  // Initialize Isotope after all items are added
  var $grid = $(".grid").imagesLoaded(function () {
    $grid.isotope({
      itemSelector: ".grid-item",
      percentPosition: true,
      masonry: {
        columnWidth: ".grid-sizer", // Ensure the columnWidth is set to .grid-sizer
      },
    });
    document.getElementById("open-map").style.display = "inline-block";
  });

  // Event listener for dynamically generated word filters
  $(document).on("click", ".word-filter", function () {
    var filterValue = $(this).attr("data-filter");
    $grid.isotope({ filter: filterValue });

    // Mark the clicked filter as active
    $(".word-filter").removeClass("active");
    $(this).addClass("active");
    // Close the word cloud on mobile if necessary
    if (window.innerWidth <= 768) {
      const wordcloudDrawer = document.getElementById("wordcloudDrawer");
      wordcloudDrawer.classList.remove("visible");
    }
  });

  initMagnificPopup();
  footermessage.innerHTML = ``;
}
*/

async function buildGallery(photos, currentPage) {
  const gallery = document.getElementById("gallery");
  gallery.classList.add("gallery-hidden");
  const barContainer = document.getElementById("gallery-loading-bar-container");
  const bar = document.getElementById("gallery-loading-bar");
  const barText = document.getElementById("gallery-loading-bar-text");

  // Show loading bar
  if (barContainer) {
    barContainer.style.display = "block";
    bar.style.width = "0%";
    barText.textContent = "Loading photos...";
  }

  gallery.innerHTML = '<div class="grid-sizer"></div>'; // Clear previous items

  // Sort photos by publication date (descending: newest first)
  const sortedPhotos = photos.slice().sort((a, b) => {
    const dateA = new Date(a.metadata.publication_date);
    const dateB = new Date(b.metadata.publication_date);
    return dateB - dateA;
  });

  // Calculate start and end indices for pagination
  const startIdx = (currentPage - 1) * photosPerPage;
  const endIdx = startIdx + photosPerPage;
  const paginatedPhotos = sortedPhotos.slice(startIdx, endIdx);

  // Add items to gallery
  for (const photo of paginatedPhotos) {
    try {
      const id = photo.id;
      const filename = photo.files[0].key;
      const image_url_500 = `https://zenodo.org/api/iiif/record:${id}:${filename}/full/500,/0/default.png`;
      const doi_url = `https://www.doi.org/${photo.doi}`;
      const title = photo.metadata.title || "Untitled";
      footermessage.innerHTML = `Processing ${photo.title}`;

      const authors = photo.metadata.creators
        .map((creator) => creator.name)
        .join(", ");
      const year = new Date(photo.metadata.publication_date).getFullYear();

      let htmlCoords = "";
      if (photo.metadata.custom) {
        const latDD = photo.metadata.custom["dwc:decimalLatitude"]?.[0];
        const lonDD = photo.metadata.custom["dwc:decimalLongitude"]?.[0];
        if (latDD && lonDD) {
          const photoLink2Gmap = BuildLink2Gmap(lonDD, latDD);
          htmlCoords = `<a href="${photoLink2Gmap}" target="_blank" class="icon-overlay">&#127757;</a>`;
        }
      }

      let category_classes = "";
      if (photo.metadata.keywords) {
        category_classes = photo.metadata.keywords
          .map((kw) => {
            return sanitizeKeyword(kw);
          })
          .join(" ");
      }

      const item = `
          <div class="grid-item ${category_classes}" style="opacity: 0; transition: opacity 0.5s;">
              <a href="${image_url_500}" class="popup-btn" data-title="${title}" data-authors="${authors}" data-year="${year}" data-doi="${doi_url}">
                  <img class="img-fluid lazy" src="${image_url_500}" data-src="${image_url_500}" alt="${title}" loading="lazy">
                  ${htmlCoords} <!-- World icon with link -->
              </a>
          </div>`;
      gallery.innerHTML += item;
    } catch (error) {
      console.error(`Error processing photo: ${photo.id}`, error);
    }
  }

  // Show gallery immediately but items are hidden with opacity: 0
  gallery.classList.remove("gallery-hidden");

  // Initialize Isotope first
  if ($(".grid").data("isotope")) {
    $(".grid").isotope("destroy");
  }

  var $grid = $(".grid").isotope({
    itemSelector: ".grid-item",
    percentPosition: true,
    masonry: {
      columnWidth: ".grid-sizer",
    },
  });

  // Now load images and show them progressively
  const images = Array.from(gallery.querySelectorAll("img"));
  let loaded = 0;
  const total = images.length;

  // Start loading all images without waiting
  images.forEach((img, index) => {
    const gridItem = img.closest('.grid-item');
    
    const updateProgress = () => {
      loaded++;
      // Update progress bar immediately
      if (bar) bar.style.width = `${(loaded / total) * 100}%`;
      if (barText) barText.textContent = `Loading photo ${loaded} of ${total}...`;
      
      // Show this specific image by changing opacity
      gridItem.style.opacity = '1';
      
      // Relayout Isotope for this item
      $grid.isotope('layout');
      
      // Hide loading bar when all images are done
      if (loaded >= total && barContainer) {
        setTimeout(() => {
          barContainer.style.display = "none";
          document.getElementById("open-map").style.display = "inline-block";
          footermessage.innerHTML = ``;
        }, 500); // Small delay to show 100% completion
      }
    };

    // Check if image is already loaded
    if (img.complete && img.naturalWidth > 0) {
      updateProgress();
      return;
    }

    // Set up load/error handlers
    let hasResolved = false;
    
    const handleComplete = () => {
      if (!hasResolved) {
        hasResolved = true;
        updateProgress();
      }
    };

    img.addEventListener('load', handleComplete, { once: true });
    img.addEventListener('error', handleComplete, { once: true });
    
    // Fallback timeout
    setTimeout(() => {
      if (!hasResolved) {
        console.warn(`Image load timeout for: ${img.src}`);
        hasResolved = true;
        updateProgress();
      }
    }, 5000);

    // Trigger loading if needed
    if (img.src && !img.complete) {
      const originalSrc = img.src;
      img.src = '';
      img.src = originalSrc;
    }
  });

  // Set up filter events
  $(".filter-button-group").on("click", "button", function () {
    var filterValue = $(this).attr("data-filter");
    $grid.isotope({ filter: filterValue });
  });

  // Event listener for dynamically generated word filters
  $(document).on("click", ".word-filter", function () {
    var filterValue = $(this).attr("data-filter");
    $grid.isotope({ filter: filterValue });

    // Mark the clicked filter as active
    $(".word-filter").removeClass("active");
    $(this).addClass("active");
    // Close the word cloud on mobile if necessary
    if (window.innerWidth <= 768) {
      const wordcloudDrawer = document.getElementById("wordcloudDrawer");
      wordcloudDrawer.classList.remove("visible");
    }
  });

  initMagnificPopup();
}

function sanitizeKeyword(keyword) {
  return keyword
    .trim() // Remove leading/trailing spaces
    .replace(/[^a-zA-Z0-9]+/g, "") // Remove all non-alphanumeric characters (spaces, parentheses, etc.)
    .toLowerCase(); // Convert to lowercase
}

// Escape special characters for Isotope filtering
function escapeIsotopeFilterValue(value) {
  return value.replace(/[\[\]!"#$%&'()*+,.\/:;<=>?@\\^`{|}~]/g, "\\$&");
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

document.getElementById("open-map").addEventListener("click", function () {
  document.getElementById("gallery").style.display = "none";
  document.getElementById("gallery-map").style.display = "block";
  document.getElementById("open-map").style.display = "none";
  document.getElementById("open-gallery").style.display = "block";
  showGalleryMap();
});

document.getElementById("open-gallery").addEventListener("click", function () {
  document.getElementById("gallery").style.display = "block";
  document.getElementById("gallery-map").style.display = "none";
  document.getElementById("open-map").style.display = "block";
  document.getElementById("open-gallery").style.display = "none";
});

function showGalleryMap() {
  if (window.galleryMap) return; // Only initialize once
  window.galleryMap = L.map("gallery-map").setView([48, 10], 4); // Center Europe

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap contributors",
  }).addTo(window.galleryMap);

  // photos should be your array of photo objects with decimal_lat and decimal_lon
  photos.forEach((photo) => {
    const id = photo.id;
    const filename = photo.files[0].key;
    const image_url_500 = `https://zenodo.org/api/iiif/record:${id}:${filename}/full/500,/0/default.png`;
    var custom_props = photo.metadata?.custom;
    if (custom_props) {
      const latDD = custom_props["dwc:decimalLatitude"]?.[0];
      const lonDD = custom_props["dwc:decimalLongitude"]?.[0];
      if (latDD && lonDD) {
        L.marker([latDD, lonDD])
          .addTo(window.galleryMap)
          .bindPopup(
            `<strong>${photo.title}</strong><br><img class="mt-2" src="${image_url_500}" style="max-width:150px;margin-right: auto;margin-left: auto;">`
          );
      }
    }
  });
}

const footermessage = document.getElementById("footermessage");
// Toggle cache-busting flag (set to true in development, false in production)
const isCacheBustingEnabled = false;
// To collect problematic DOIs and image URLs
const problematicPhotos = [];

let total_visualizations = 0;

// Toggle word cloud off-canvas
const openFilterBtn = document.getElementById("open-filter");
const closeFilterBtn = document.getElementById("close-filter");
const wordcloudDrawer = document.getElementById("wordcloudDrawer");

// Toggle Add Photos off-canvas
const openAddPhotosBtn = document.getElementById("open-add-photos");
const closeAddPhotosBtn = document.getElementById("close-add-photos");
const addPhotosDrawer = document.getElementById("addPhotosDrawer");

// EVENT LISTENERS
document.addEventListener("DOMContentLoaded", async () => {
  await loadhtmlContent("./content/addphotos.html", "add-photos-content"); // load Add photos content on page load
});

// Toggle the visibility of the word cloud drawer
openFilterBtn.addEventListener("click", function () {
  wordcloudDrawer.classList.toggle("visible"); // Toggle the 'visible' class
  addPhotosDrawer.classList.remove("visible");
});

// Close the word cloud drawer
closeFilterBtn.addEventListener("click", function () {
  wordcloudDrawer.classList.remove("visible");
});
// Toggle the visibility of the Add Photos drawer
openAddPhotosBtn.addEventListener("click", function () {
  addPhotosDrawer.classList.toggle("visible"); // Toggle the 'visible' class
});

// Close the Add Photos drawer
closeAddPhotosBtn.addEventListener("click", function () {
  addPhotosDrawer.classList.remove("visible");
});

function ConvertDDToDMS(D, lng) {
  return {
    dir: D < 0 ? (lng ? "W" : "S") : lng ? "E" : "N",
    deg: 0 | (D < 0 ? (D = -D) : D),
    min: 0 | (((D += 1e-9) % 1) * 60),
    sec: (0 | (((D * 60) % 1) * 6000)) / 100,
  };
}

function BuildLink2Gmap(LonDD, LatDD) {
  // link syntax
  //https://www.google.com/maps/place/37°44'14.7"N+7°49'15.9"W/@37.737415,-7.8236673
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
  //console.log(str4);
  return str4;
}

// Function to animate the counter
function animateCounter(targetElement, start, end, duration) {
  let range = end - start;
  let current = start;
  let increment = range / (duration / 8); // Approximate 60fps (16ms per frame)
  let stepTime = Math.abs(Math.floor(duration / range));

  function updateCounter() {
    current += increment;
    if (current >= end) {
      targetElement.innerText = Math.round(end); // Ensure it ends on the exact number
    } else {
      targetElement.innerText = Math.round(current);
      // Check if we hit a multiple of 100
      if (Math.round(current) % 100 === 0) {
        showStarBadge(); // Show star animation when a multiple of 100 is reached
      }
      requestAnimationFrame(updateCounter);
    }
  }
  requestAnimationFrame(updateCounter);
}

// Function to show the star badge
function showStarBadge() {
  const starBadge = document.getElementById("star-badge");
  starBadge.classList.add("show"); // Show star

  // Hide star after 1 second
  setTimeout(() => {
    starBadge.classList.remove("show");
  }, 1000);
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

