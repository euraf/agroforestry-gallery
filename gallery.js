const albumKeywords = [
    "Silvopastoral", "Silvoarable", "Permanent crop", "Agro-silvo-pasture",
    "Landscape features", "Urban agroforestry", "Wood pasture", "Tree alley cropping",
    "Coppice alley cropping", "Multi-layer gardens (on agricultural land)",
    "Orchard intercropping", "Orchard grazing", "Alternating cropping and grazing",
    "Hedges, trees in groups, trees in lines, individual trees", "Forest grazing",
    "Multi-layer gardens (on forest land)", "Homegardens, allotments, etc"
];
// Sanitize and store the keywords for case-insensitive comparison
const albumKeywordsSanitized = albumKeywords.map(keyword => sanitizeKeyword(keyword));

// Fetch photos and build the gallery on page load
document.addEventListener('DOMContentLoaded', async () => {
    let photos = await fetchZenodoPhotos(); // Fetch photos from Zenodo
    buildGalleryAndWordCloud(photos); // Build the gallery and word cloud
    // Wait for all images to load before initializing Isotope
    var $grid = $('.grid').imagesLoaded(function () {
        $grid.isotope({
            itemSelector: '.grid-item',
            percentPosition: true,
            masonry: {
                columnWidth: '.grid-sizer' // Use the grid-sizer for column width
            }
        });
    });

    // Filter items when button is clicked
    $('.filter-button-group').on('click', 'button', function () {
        var filterValue = $(this).attr('data-filter');
        $grid.isotope({ filter: filterValue });
    });
});




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

async function buildGalleryAndWordCloud(photos) {
    let totalVisualizations = 0;
    const gallery = document.getElementById('gallery');
    const wordCloud = document.getElementById('word-cloud');
    const explanationBox = document.createElement('div');
    explanationBox.innerHTML = '<span class="explanation-box "><strong>Bold</strong> and <span class="album-keyword">green</span> indicates an <a href="https://zenodo.org/doi/10.5281/zenodo.7953307" target="_blank">official EURAF agroforestry typology</a>.</span>';
    wordCloud.before(explanationBox); // Insert explanation before word cloud
    let categories = {};
    let keywordMap = {}; // Map for sanitized keyword to original

    // Iterate through the photos
    for (const photo of photos) {
        try {
            const id = photo.id;
            const filename = photo.files[0].key;
            const image_url_500 = `https://zenodo.org/api/iiif/record:${id}:${filename}/full/500,/0/default.png`;
            const doi_url = `https://www.doi.org/${photo.doi}`;
            const title = photo.metadata.title || 'Untitled';
            footermessage.innerHTML= `Processing ${photo.title}`

            // Increment visualization counter if available
            if (photo.stats && photo.stats.views) {
                totalVisualizations += photo.stats.views;
            }

            // // Crop the image and handle errors
            // const croppedImage = await cropImage(image_url_500);
            // if (!croppedImage) {
            //     // Log the problematic image
            //     console.warn(`Problem with image URL: ${image_url_500}, DOI: ${doi_url}`);
            //     continue; // Skip to the next image if this one fails
            // }

            // Collect authors and year
            const authors = photo.metadata.creators.map(creator => creator.name).join(', ');
            const year = new Date(photo.metadata.publication_date).getFullYear();

            // Handle geographic coordinates if present
            let htmlCoords = "";
            if (photo.metadata.custom) {
                const latDD = photo.metadata.custom["dwc:decimalLatitude"]?.[0];
                const lonDD = photo.metadata.custom["dwc:decimalLongitude"]?.[0];
                if (latDD && lonDD) {
                    const photoLink2Gmap = BuildLink2Gmap(lonDD, latDD);
                    htmlCoords = `<a href="${photoLink2Gmap}" target="_blank" class="icon-overlay">&#127757;</a>`;
                }
            }

            // Collect and sanitize keywords for the word cloud
            let category_classes = '';
            if (photo.metadata.keywords) {
                category_classes = photo.metadata.keywords.map(kw => {
                    const sanitizedKeyword = sanitizeKeyword(kw);
                    keywordMap[sanitizedKeyword] = kw; // Store original keyword
                    return sanitizedKeyword;
                }).join(' ');
            }

            // Create the gallery item with lazy loading for the images
            // const item = `
            //     <div class="item ${category_classes} col-lg-3 col-md-4 col-6 col-sm">
            //         <a href="${image_url_500}" class="popup-btn" data-title="${title}" data-authors="${authors}" data-year="${year}" data-doi="${doi_url}">
            //             <img class="img-fluid lazy" src="${image_url_500}" data-src="${image_url_500}" alt="${title}" loading="lazy">
            //             ${htmlCoords} <!-- World icon with link -->
            //         </a>
            //     </div>`;
            const item = `
                <div class="grid-item ${category_classes} ">
                    <a href="${image_url_500}" class="popup-btn" data-title="${title}" data-authors="${authors}" data-year="${year}" data-doi="${doi_url}">
                        <img class="img-fluid lazy" src="${image_url_500}" data-src="${image_url_500}" alt="${title}" loading="lazy">
                        ${htmlCoords} <!-- World icon with link -->
                    </a>
                </div>`;
            gallery.innerHTML += item;

            // <div class="grid-item a">
            //                 <img src="http://placehold.it/800x600" alt="">
            //             </div>

            // Track categories for the word cloud
            if (photo.metadata.keywords) {
                photo.metadata.keywords.forEach(kw => {
                    const sanitizedKeyword = sanitizeKeyword(kw);
                    if (!categories[sanitizedKeyword]) {
                        categories[sanitizedKeyword] = 0;
                    }
                    categories[sanitizedKeyword]++;
                });
            }
        } catch (error) {
            console.error(`Error processing photo: ${photo.id}`, error);
        }

    }

    // Build word cloud
    
    wordCloud.innerHTML = `<button class="word-filter" data-filter="*">All 📷 <sup>${photos.length}</sup></button>`;
    for (const sanitizedKeyword in categories) {
        const originalKeyword = keywordMap[sanitizedKeyword];
        const isAlbum = albumKeywordsSanitized.includes(sanitizedKeyword);
        const additionalClass = isAlbum ? 'album-keyword' : '';
        // wordCloud.innerHTML += `<span class="word-filter ${additionalClass}" data-filter=".${sanitizedKeyword}">${originalKeyword} <sup>${categories[sanitizedKeyword]}</sup></span>`;
        wordCloud.innerHTML += `<button class="word-filter ${additionalClass}" data-filter=".${sanitizedKeyword}">${originalKeyword} <sup>${categories[sanitizedKeyword]}</sup></button>`;
        footermessage.innerHTML= `Building filter for ${originalKeyword}`
    }

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
    // Animate the visualization counter
    const counterElement = document.getElementById('visualization-count');
    animateCounter(counterElement, 0, totalVisualizations, 2000);

    
    
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