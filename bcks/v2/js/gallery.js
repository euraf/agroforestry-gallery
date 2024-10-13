const footermessage = document.getElementById('footermessage');
// Toggle cache-busting flag (set to true in development, false in production)
const isCacheBustingEnabled = false;
// To collect problematic DOIs and image URLs
const problematicPhotos = [];

let total_visualizations = 0;
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
    explanationBox.innerHTML = '<span class="explanation-box album-keyword"><strong>Bold</strong> and <span class="word-boxed">boxed</span> indicates an <a href="https://zenodo.org/doi/10.5281/zenodo.7953307" target="_blank">official EURAF agroforestry typology</a>.</span>';
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

            // Crop the image and handle errors
            const croppedImage = await cropImage(image_url_500);
            if (!croppedImage) {
                // Log the problematic image
                console.warn(`Problem with image URL: ${image_url_500}, DOI: ${doi_url}`);
                continue; // Skip to the next image if this one fails
            }

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
            const item = `
                <div class="item ${category_classes} col-lg-3 col-md-4 col-6 col-sm">
                    <a href="${image_url_500}" class="popup-btn" data-title="${title}" data-authors="${authors}" data-year="${year}" data-doi="${doi_url}">
                        <img class="img-fluid lazy" src="${croppedImage}" data-src="${croppedImage}" alt="${title}" loading="lazy">
                        ${htmlCoords} <!-- World icon with link -->
                    </a>
                </div>`;
            gallery.innerHTML += item;

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
    
    wordCloud.innerHTML = `<span class="word-filter" data-filter="*">All 📷 <sup>${photos.length}</sup></span>`;
    for (const sanitizedKeyword in categories) {
        const originalKeyword = keywordMap[sanitizedKeyword];
        const isAlbum = albumKeywordsSanitized.includes(sanitizedKeyword);
        const additionalClass = isAlbum ? 'album-keyword' : '';
        wordCloud.innerHTML += `<span class="word-filter ${additionalClass}" data-filter=".${sanitizedKeyword}">${originalKeyword} <sup>${categories[sanitizedKeyword]}</sup></span>`;
        footermessage.innerHTML= `Building filter for ${originalKeyword}`
    }

    // Animate the visualization counter
    const counterElement = document.getElementById('visualization-count');
    animateCounter(counterElement, 0, totalVisualizations, 2000);

    // Initialize Isotope and Magnific Popup
    initIsotope();
    initMagnificPopup();
    footermessage.innerHTML= ``
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
                
                return `${title} <br> <small>by ${authors} (${year})<br><a href="${doi}" target="_blank">Full resolution and source to cite:  ${doi}</a></small>`;
            }
        }
    });
}

// Toggle word cloud off-canvas
const openFilterBtn = document.getElementById('open-filter');
const closeFilterBtn = document.getElementById('close-filter');
const wordcloudDrawer = document.getElementById('wordcloudDrawer');

// Toggle Add Photos off-canvas
const openAddPhotosBtn = document.getElementById('open-add-photos');
const closeAddPhotosBtn = document.getElementById('close-add-photos');
const addPhotosDrawer = document.getElementById('addPhotosDrawer');

// Toggle the visibility of the word cloud drawer
openFilterBtn.addEventListener('click', function() {
    wordcloudDrawer.classList.toggle('visible'); // Toggle the 'visible' class
    addPhotosDrawer.classList.remove('visible');
});

// Close the word cloud drawer
closeFilterBtn.addEventListener('click', function() {
    wordcloudDrawer.classList.remove('visible');
    
});
// Toggle the visibility of the Add Photos drawer
openAddPhotosBtn.addEventListener('click', function() {
    addPhotosDrawer.classList.toggle('visible'); // Toggle the 'visible' class
    
});

// Close the Add Photos drawer
closeAddPhotosBtn.addEventListener('click', function() {
    addPhotosDrawer.classList.remove('visible');
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
    const starBadge = document.getElementById('star-badge');
    starBadge.classList.add('show'); // Show star

    // Hide star after 1 second
    setTimeout(() => {
        starBadge.classList.remove('show');
    }, 1000);
}


async function loadAddPhotosContent(htmlpage,ObjID2inject) {
    
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
        console.error('Error loading addphotos.html:', error);
        document.getElementById(ObjID2inject).innerHTML = '<p>Failed to load content. Please try again later.</p>';
    }
}

async function cropImage(imageUrl) {
    try {
        // Check if the image URL is valid by sending a HEAD request
        const response = await fetch(imageUrl, { method: 'HEAD' });
        if (!response.ok) {
            throw new Error(`Bad request: ${response.status} ${response.statusText}`);
        }

        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.src = imageUrl;

        return new Promise((resolve, reject) => {
            img.onload = () => {
                // Use SmartCrop to crop the image to a square
                smartcrop.crop(img, { width: 150, height: 150 }).then(result => {
                    const crop = result.topCrop;
                    const canvas = document.createElement('canvas');
                    canvas.width = 150;
                    canvas.height = 150;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, crop.x, crop.y, crop.width, crop.height, 0, 0, 150, 150);
                    resolve(canvas.toDataURL()); // Return the cropped image
                }).catch(reject);
            };
            img.onerror = reject;
        });
    } catch (error) {
        console.error(`Failed to process image ${imageUrl}:`, error);
        return null; // Return null if the image fails to load or process
    }
}

// Fetch photos and build the gallery on page load
document.addEventListener('DOMContentLoaded', async () => {
    await loadAddPhotosContent('./content/addphotos.html','add-photos-content');// load Add photos content on page load
})