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
    return allPhotos; // Return all the photos
}

// Detect EXIF orientation for each image
function detectExifOrientation(imageUrl, callback) {
    let img = new Image();
    img.src = imageUrl;
    img.onload = function() {
        EXIF.getData(img, function() {
            let orientation = EXIF.getTag(this, "Orientation");

            if (orientation === 6 || orientation === 8) {
                callback('portrait'); // EXIF suggests it's portrait
            } else {
                callback('landscape'); // Default to landscape
            }
        });
    };
}

// Build the gallery and the word cloud with lazy-loaded images and EXIF orientation detection
function buildGalleryAndWordCloud(photos) {
    const gallery = document.getElementById('gallery');
    const wordCloud = document.getElementById('word-cloud');
    let categories = {};

    // Generate the gallery items with lazy loading
    photos.forEach(photo => {
        let id = photo.id;
        let filename = photo.files[0].key;
        let imageUrl_200 = `https://zenodo.org/api/iiif/record:${id}:${filename}/full/200,/0/default.png`;
        let imageUrl_500 = `https://zenodo.org/api/iiif/record:${id}:${filename}/full/500,/0/default.png`;
        let doiUrl = `https://www.doi.org/${photo.doi}`;
        let title = photo.metadata.title || 'Untitled';

        // Collect authors and year
        let authors = photo.metadata.creators.map(creator => creator.name).join(', ');
        let year = new Date(photo.metadata.publication_date).getFullYear();

        // Detect EXIF orientation
        detectExifOrientation(imageUrl_200, function(orientation) {
            let orientationClass = (orientation === 'portrait') ? 'portrait' : 'landscape';

            // Create gallery item with lazy loading for the images
            let categoryClasses = photo.metadata.keywords ? photo.metadata.keywords.map(kw => kw.replace(/\s+/g, '-').toLowerCase()).join(' ') : '';
            let item = `
                <div class="item ${orientationClass} ${categoryClasses} col-lg-3 col-md-4 col-6 col-sm">
                    <a href="${imageUrl_500}" class="popup-btn" data-title="${title}" data-authors="${authors}" data-year="${year}" data-doi="${doiUrl}">
                        <img class="img-fluid lazy" src="${imageUrl_200}" data-src="${imageUrl_500}" alt="${title}" loading="lazy">
                    </a>
                </div>`;
            gallery.innerHTML += item;

            // Collect categories for the word cloud
            if (photo.metadata.keywords) {
                photo.metadata.keywords.forEach(kw => {
                    if (!categories[kw]) {
                        categories[kw] = 0;
                    }
                    categories[kw]++;
                });
            }

            // Initialize Isotope and Magnific Popup after all items are added
            initIsotope();
            initMagnificPopup();
        });
    });

    // Generate word cloud
    wordCloud.innerHTML = `<span class="word-filter" data-filter="*">All <sup>${photos.length}</sup></span>`;
    for (let category in categories) {
        let slug = category.replace(/\s+/g, '-').toLowerCase();
        wordCloud.innerHTML += `<span class="word-filter" data-filter=".${slug}">${category} <sup>${categories[category]}</sup></span>`;
    }

    // Attach word cloud filtering after it's generated
    attachWordCloudFiltering();
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
}

// Attach word cloud filter events
function attachWordCloudFiltering() {
    var $grid = $('.portfolio-item').isotope(); // Isotope instance

    $('.word-filter').on('click', function() {
        $('.word-filter').removeClass('active');
        $(this).addClass('active');
        var filterValue = $(this).attr('data-filter');
        $grid.isotope({ filter: filterValue });

        // Close word cloud on mobile after filtering
        if (window.innerWidth <= 768) {
            const wordcloudDrawer = document.getElementById('wordcloudDrawer');
            wordcloudDrawer.classList.remove('visible');
        }
    });
}

// Initialize Magnific Popup for the gallery
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
                return `${title} <br> <small>by ${authors} (${year})</small><a href="${doi}" target="_blank">Source to cite: ${doi}</a>`;
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
