const albumKeywords = [
    "Silvopastoral", "Silvoarable", "Permanent crop", "Agro-silvo-pasture",
    "Landscape features", "Urban agroforestry", "Wood pasture", "Tree alley cropping",
    "Coppice alley cropping", "Multi-layer gardens (on agricultural land)",
    "Orchard intercropping", "Orchard grazing", "Alternating cropping and grazing",
    "Hedges, trees in groups, trees in lines, individual trees", "Forest grazing",
    "Multi-layer gardens (on forest land)", "Homegardens, allotments, etc"
];
var currentPage = 1; // Initialize current page
const photosPerPage = 10000; // Number of photos to fetch per page
// Sanitize and store the keywords for case-insensitive comparison
var photos = []
var totalVisualizations = 0
const albumKeywordsSanitized = albumKeywords.map(keyword => sanitizeKeyword(keyword));

// Fetch photos and build the gallery on page load
document.addEventListener('DOMContentLoaded', async () => {
    photos = await fetchZenodoPhotos(); // Fetch photos from Zenodo
    totalVisualizations = photos.reduce((sum, photo) => sum + (photo.stats?.views || 0), 0); // Calculate total visualizations

    // Animate the visualization counter
    const counterElement = document.getElementById('visualization-count');
    animateCounter(counterElement, 0, totalVisualizations, 2000);

    await setupPagination(); // Setup pagination buttons
    buildWordCloud();
    buildGallery(photos, currentPage); // Build the gallery and word cloud
});

async function setupPagination() {
    const totalPages = Math.ceil(photos.length / photosPerPage);
    const existingPagination = document.getElementById('gallery-pagination');
    if (existingPagination) {
        existingPagination.remove();
    }
    if (totalPages <= 1) {
        return;
    }
    const paginationContainer = document.createElement('div');
    paginationContainer.id = 'gallery-pagination';
    paginationContainer.className = 'gallery-pagination d-flex align-items-center justify-content-center text-center';

    let buttonsHTML = '';
    for (let i = 1; i <= totalPages; i++) {
        buttonsHTML += `<button class="page-btn btn btn-sm mx-1${i === currentPage ? ' active' : ''}" data-page="${i}">${i}</button>`;
    }

    const pagesDiv = document.createElement('div');
    pagesDiv.innerHTML = buttonsHTML;
    pagesDiv.className = 'pages-btn-group';
    paginationContainer.appendChild(pagesDiv);

    const wrapper = document.getElementById('wrapper');
    wrapper.parentNode.insertBefore(paginationContainer, wrapper.nextSibling);

    document.querySelectorAll('.page-btn').forEach(btn => {
        btn.addEventListener('click', async function() {
            currentPage = parseInt(this.getAttribute('data-page'));
            buildGallery(photos, currentPage);
            document.querySelectorAll('.page-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
        });
    });
}

  // Fetch data from Zenodo API
async function fetchZenodoPhotos() {
    let communities = ['euraf-media']; // Zenodo communities
    let allPhotos = [];

    for (let community of communities) {
        let apiUrl = `https://zenodo.org/api/records/?q=communities:${community} AND resource_type.type:image`;
        let response = await fetch(apiUrl); // Fetch data from Zenodo
        let data = await response.json(); // Parse the response as JSON

        if (data.hits && data.hits.hits.length > 0) {
            allPhotos = allPhotos.concat(data.hits.hits); // Append the photos to the allPhotos array
        }
    }
    //console.log(allPhotos)
    footermessage.innerHTML=" Fetched " + allPhotos.length + " photos from zenodo"
    return allPhotos; // Return all the photos
}

function buildWordCloud() {
    const wordCloud = document.getElementById('word-cloud');
    const explanationBox = document.createElement('div');
    explanationBox.innerHTML = '<p class="explanation-box text-center small p-2"><em><a href="https://zenodo.org/doi/10.5281/zenodo.7953307" target="_blank">Official EURAF agroforestry typologies</a> are shown in <span class="album-keyword"><strong>bold green</strong></span>.</em></p>';
    wordCloud.before(explanationBox); // Insert explanation before word cloud
    let categories = {};

    // Iterate through the photos
    for (const photo of photos) {
        // Track categories for the word cloud
        if (photo.metadata.keywords) {
            photo.metadata.keywords.forEach(kw => {
                const sanitizedKeyword = sanitizeKeyword(kw);
                if (!categories[sanitizedKeyword]) {
                    categories[sanitizedKeyword] = {
                        keyword: kw,
                        count: 0
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
        return a.localeCompare(b, undefined, { sensitivity: 'base' });
    });

    for (const sanitizedKeyword of sortedSanitizedKeywords) {
        const originalKeyword = categories[sanitizedKeyword].keyword;
        const isAlbum = albumKeywordsSanitized.includes(sanitizedKeyword);
        const additionalClass = isAlbum ? 'album-keyword' : '';
        wordCloud.innerHTML += `<button class="word-filter ${additionalClass}" data-filter=".${sanitizedKeyword}">${originalKeyword} <sup>${categories[sanitizedKeyword].count}</sup></button>`;
        footermessage.innerHTML= `Building filter for ${originalKeyword}`;
    }
}

async function buildGallery(photos, currentPage) {
    const gallery = document.getElementById('gallery');
    // Hide gallery while loading
    gallery.classList.add('gallery-hidden');
    const barContainer = document.getElementById('gallery-loading-bar-container');
    const bar = document.getElementById('gallery-loading-bar');
    const barText = document.getElementById('gallery-loading-bar-text');

    // Show loading bar
    if (barContainer) {
        barContainer.style.display = 'block';
        bar.style.width = '0%';
        barText.textContent = 'Loading photos...';
    }

    gallery.innerHTML = '<div class="grid-sizer"></div>'; // Clear previous items

    // Calculate start and end indices for pagination
    const startIdx = (currentPage - 1) * photosPerPage;
    const endIdx = startIdx + photosPerPage;
    const paginatedPhotos = photos.slice(startIdx, endIdx);

    // Add items to gallery
    for (const photo of paginatedPhotos) {
        try {
            const id = photo.id;
            const filename = photo.files[0].key;
            const image_url_500 = `https://zenodo.org/api/iiif/record:${id}:${filename}/full/500,/0/default.png`;
            const doi_url = `https://www.doi.org/${photo.doi}`;
            const title = photo.metadata.title || 'Untitled';
            footermessage.innerHTML= `Processing ${photo.title}`

            const authors = photo.metadata.creators.map(creator => creator.name).join(', ');
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

            let category_classes = '';
            if (photo.metadata.keywords) {
                category_classes = photo.metadata.keywords.map(kw => {
                    return sanitizeKeyword(kw);
                }).join(' ');
            }

            const item = `
                <div class="grid-item ${category_classes} ">
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

    // Wait for all images to load and update the loading bar
    const images = Array.from(gallery.querySelectorAll('img'));
    let loaded = 0;
    const total = images.length;

    await Promise.all(images.map(img => {
        return new Promise(resolve => {
            if (img.complete) {
                loaded++;
                if (bar) bar.style.width = `${(loaded / total) * 100}%`;
                if (barText) barText.textContent = `Loading photo ${loaded} of ${total}...`;
                resolve();
            } else {
                img.onload = img.onerror = () => {
                    loaded++;
                    if (bar) bar.style.width = `${(loaded / total) * 100}%`;
                    if (barText) barText.textContent = `Loading photo ${loaded} of ${total}...`;
                    resolve();
                };
            }
        });
    }));

    // Hide loading bar when done
    if (barContainer) {
        barContainer.style.display = 'none';
    }

    // Destroy previous Isotope instance if exists
    if ($('.grid').data('isotope')) {
        $('.grid').isotope('destroy');
    }

    var $grid = $('.grid').imagesLoaded(function () {
        $grid.isotope({
            itemSelector: '.grid-item',
            percentPosition: true,
            masonry: {
                columnWidth: '.grid-sizer'
            }
        });
        // Show gallery after Isotope is ready
        gallery.classList.remove('gallery-hidden');
    });

    // Filter items when button is clicked
    $('.filter-button-group').on('click', 'button', function () {
        var filterValue = $(this).attr('data-filter');
        $grid.isotope({ filter: filterValue });
    });

    // Initialize Isotope after all items are added
    var $grid = $('.grid').imagesLoaded(function () {
        $grid.isotope({
            itemSelector: '.grid-item',
            percentPosition: true,
            masonry: {
                columnWidth: '.grid-sizer' // Ensure the columnWidth is set to .grid-sizer
            }
        });
    });

    // Event listener for dynamically generated word filters
    $(document).on('click', '.word-filter', function () {
        var filterValue = $(this).attr('data-filter');
        $grid.isotope({ filter: filterValue });

        // Mark the clicked filter as active
        $('.word-filter').removeClass('active');
        $(this).addClass('active');
        // Close the word cloud on mobile if necessary
        if (window.innerWidth <= 768) {
            const wordcloudDrawer = document.getElementById('wordcloudDrawer');
            wordcloudDrawer.classList.remove('visible');
        }
    });

    initMagnificPopup();
    footermessage.innerHTML= ``
}

function sanitizeKeyword(keyword) {
    return keyword
        .trim() // Remove leading/trailing spaces
        .replace(/[^a-zA-Z0-9]+/g, '') // Remove all non-alphanumeric characters (spaces, parentheses, etc.)
        .toLowerCase(); // Convert to lowercase
}


// Escape special characters for Isotope filtering
function escapeIsotopeFilterValue(value) {
    return value.replace(/[\[\]!"#$%&'()*+,.\/:;<=>?@\\^`{|}~]/g, '\\$&');
}

function initMagnificPopup() {
    $('.popup-btn').magnificPopup({
        type: 'image',
        gallery: {
            enabled: true
        },
        image: {
            titleSrc: function(item) {
                let title = item.el.attr('data-title');
                let authors = item.el.attr('data-authors');
                let year = item.el.attr('data-year');
                let doi = item.el.attr('data-doi');
                
                return `${title} <br> <small>by ${authors} (${year})<br><a href="${doi}" target="_blank">Full resolution and source to cite:  ${doi}</a></small>`;
            }
        }
    });
}