// Fetch data from Zenodo API
// Fetch data from Zenodo API
async function fetchZenodoPhotos() {
    let communities = ['mvarc-media', 'euraf-media']; // Zenodo communities
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

// Build the gallery and the word cloud
function buildGalleryAndWordCloud(photos) {
    const gallery = document.getElementById('gallery');
    const wordCloud = document.getElementById('word-cloud');
    let categories = {};

    // Generate the gallery items
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

        // Create gallery item with data attributes
        let category_classes = photo.metadata.keywords ? photo.metadata.keywords.map(kw => kw.replace(/\s+/g, '-').toLowerCase()).join(' ') : '';
        let item = `
            <div class="item ${category_classes} col-lg-3 col-md-4 col-6 col-sm">
                <a href="${image_url_500}" class="popup-btn" data-title="${title}" data-authors="${authors}" data-year="${year}" data-doi="${doi_url}">
                    <img class="img-fluid" src="${image_url_200}" alt="${title}">
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
    });

    // Generate word cloud
    wordCloud.innerHTML = `<span class="word-filter" data-filter="*">All <sup>${photos.length}</sup></span>`;
    for (let category in categories) {
        let slug = category.replace(/\s+/g, '-').toLowerCase();
        wordCloud.innerHTML += `<span class="word-filter" data-filter=".${slug}">${category} <sup>${categories[category]}</sup></span>`;
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

    // Filter items when word cloud is clicked
    $('.word-filter').on('click', function() {
        $('.word-filter').removeClass('active');
        $(this).addClass('active');
        var filterValue = $(this).attr('data-filter');
        $grid.isotope({ filter: filterValue });
    });
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


document.addEventListener('DOMContentLoaded', async () => {
    let photos = await fetchZenodoPhotos(); // Fetch photos from Zenodo
    buildGalleryAndWordCloud(photos); // Build the gallery and word cloud
    initMagnificPopup(); // Initialize Magnific Popup after building the gallery
});
