
// llink to location in map:
// https://www.google.com/maps/place/37°44'14.7"N+7°49'15.9"W/@37.737415,-7.8236673

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
    return allPhotos; // Return all the photos
    
}

// Build the gallery and the word cloud with lazy-loaded images
function buildGalleryAndWordCloud(photos) {
    const gallery = document.getElementById('gallery');
    const wordCloud = document.getElementById('word-cloud');
    let categories = {};
    let keywordMap = {}; // This will map original keywords to their sanitized versions

    // Generate the gallery items with lazy loading
    photos.forEach(photo => {
        let id = photo.id;
        let filename = photo.files[0].key;
        let image_url_200 = `https://zenodo.org/api/iiif/record:${id}:${filename}/full/200,/0/default.png`;
        let image_url_500 = `https://zenodo.org/api/iiif/record:${id}:${filename}/full/500,/0/default.png`;
        let doi_url = `https://www.doi.org/${photo.doi}`;
        let title = photo.metadata.title || 'Untitled';

        // Collect authors and year
        let authors = photo.metadata.creators.map(creator => creator.name).join(', ');
        let year = new Date(photo.metadata.publication_date).getFullYear();

        // Check if the photo has geographic coordinates
        let flagHasCoords = false;
        let htmlCoords = "";
        let latDD = null;
        let lonDD = null;
        let photoLink2Gmap = null;

        if ("custom" in photo.metadata) { // Check if there is a custom field for coordinates
            if ("dwc:decimalLongitude" in photo.metadata.custom) {
                lonDD = photo.metadata.custom["dwc:decimalLongitude"][0];
            }
            if ("dwc:decimalLatitude" in photo.metadata.custom) {
                latDD = photo.metadata.custom["dwc:decimalLatitude"][0];
            }
            flagHasCoords = true;
        }

        // Build the Google Maps link if coordinates are available
        if (flagHasCoords) {
            photoLink2Gmap = BuildLink2Gmap(lonDD, latDD);
            htmlCoords = `<a href="${photoLink2Gmap}" target="_blank" class="icon-overlay">&#127757;</a>`; // World icon link
        }

        // Collect and sanitize keywords, while storing the mapping between original and sanitized versions
        let category_classes = '';
        if (photo.metadata.keywords) {
            category_classes = photo.metadata.keywords.map(kw => {
                let sanitizedKeyword = sanitizeKeyword(kw);
                keywordMap[sanitizedKeyword] = kw; // Map sanitized to original
                return sanitizedKeyword;
            }).join(' ');
        }

        // Create gallery item with lazy loading for the images
        let item = `
            <div class="item ${category_classes} col-lg-3 col-md-4 col-6 col-sm">
                <a href="${image_url_500}" class="popup-btn" data-title="${title}" data-authors="${authors}" data-year="${year}" data-doi="${doi_url}">
                    <img class="img-fluid lazy" src="${image_url_500}" data-src="${image_url_500}" alt="${title}" loading="lazy">
                </a>
                ${htmlCoords} <!-- World icon with link -->
            </div>`;
        gallery.innerHTML += item;

        // Collect categories for the word cloud
        if (photo.metadata.keywords) {
            photo.metadata.keywords.forEach(kw => {
                let sanitizedKeyword = sanitizeKeyword(kw);
                if (!categories[sanitizedKeyword]) {
                    categories[sanitizedKeyword] = 0;
                }
                categories[sanitizedKeyword]++;
            });
        }
    });

    // Generate word cloud using the original keyword for display, but sanitized for filtering
    wordCloud.innerHTML = `<span class="word-filter" data-filter="*">All <sup>${photos.length}</sup></span>`;
    for (let sanitizedKeyword in categories) {
        let originalKeyword = keywordMap[sanitizedKeyword]; // Get the original keyword
        wordCloud.innerHTML += `<span class="word-filter" data-filter=".${sanitizedKeyword}">${originalKeyword} <sup>${categories[sanitizedKeyword]}</sup></span>`;
    }

    // Initialize Isotope and Magnific Popup
    initIsotope();
    initMagnificPopup();
}


// Initialize Isotope for filtering
function initIsotope() {
    var $grid = $('.portfolio-item').isotope({
        itemSelector: '.item',
        layoutMode: 'fitRows',
        percentPosition: true,
        masonry: {
            columnWidth: '.item'
        }
    });

    // Re-layout after images are loaded
    $grid.imagesLoaded().progress(function() {
        $grid.isotope('layout');
    });

    // Filter items when word cloud filter is clicked
    $('.word-filter').on('click', function() {
        $('.word-filter').removeClass('active');
        $(this).addClass('active');

        let filterValue = $(this).attr('data-filter');
        $grid.isotope({ filter: filterValue });

        // Close the word cloud on mobile if necessary
        if (window.innerWidth <= 768) {
            const wordcloudDrawer = document.getElementById('wordcloudDrawer');
            wordcloudDrawer.classList.remove('visible');
        }
    });
}
//     // Close the word cloud on mobile if necessary
//     if (window.innerWidth <= 768) {
//         const wordcloudDrawer = document.getElementById('wordcloudDrawer');
//         wordcloudDrawer.classList.remove('visible');
//     }
// });
// }

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
                return `${title} <br> <small>by ${authors} (${year})</small><a href="${doi}" target="_blank">Source to cite:  ${doi}</a>`;
            }
        }
    });
}

// Toggle word cloud off-canvas
const openFilterBtn = document.getElementById('open-filter');
const closeFilterBtn = document.getElementById('close-filter');
const wordcloudDrawer = document.getElementById('wordcloudDrawer');

// Toggle the visibility of the word cloud drawer
openFilterBtn.addEventListener('click', function() {
    wordcloudDrawer.classList.toggle('visible'); // Toggle the 'visible' class
});

// Close the word cloud drawer
closeFilterBtn.addEventListener('click', function() {
    wordcloudDrawer.classList.remove('visible');
});

// Fetch photos and build the gallery on page load
document.addEventListener('DOMContentLoaded', async () => {
    let photos = await fetchZenodoPhotos(); // Fetch photos from Zenodo
    buildGalleryAndWordCloud(photos); // Build the gallery and word cloud
});

function ConvertDDToDMS(D, lng) {
    return {
      dir: D < 0 ? (lng ? "W" : "S") : lng ? "E" : "N",
      deg: 0 | (D < 0 ? (D = -D) : D),
      min: 0 | (((D += 1e-9) % 1) * 60),
      sec: (0 | (((D * 60) % 1) * 6000)) / 100,
    };
  }

  function BuildLink2Gmap(LonDD, LatDD){
    // link syntax
    //https://www.google.com/maps/place/37°44'14.7"N+7°49'15.9"W/@37.737415,-7.8236673
    latDMS = ConvertDDToDMS(LatDD, false);
    lonDMS = ConvertDDToDMS(LonDD, true);
    str = "https://www.google.com/maps/place/"
    
    str1 = latDMS['deg']+"°"+latDMS['min']+"'"+latDMS['sec']+"''"+latDMS['dir']+"+"
    str2 = lonDMS['deg']+"°"+lonDMS['min']+"'"+lonDMS['sec']+"''"+lonDMS['dir']+"/@"+LatDD+","+LonDD+",1000m"
    str3 = str1.concat(str2) 
    str4 = str.concat(str3)
    //console.log(str4);
    return str4;
  }
 
  function sanitizeKeyword(keyword) {
    return keyword
        .trim() // Remove leading/trailing spaces
        .replace(/[^a-zA-Z0-9]+/g, '') // Remove all non-alphanumeric characters (spaces, parentheses, etc.)
        .toLowerCase(); // Convert to lowercase
}