jQuery('#portfolio').mixItUp({  

    selectors: {
      target: '.tile',
      filter: '.filter',
      sort: '.sort-btn'
    },
    
        animation: {
        animateResizeContainer: false,
        effects: 'fade scale'
      }
  
  });

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
    return allPhotos; // Return all the photos
    
}

async function buildGalleryAndWordCloud(photos) {
    let totalVisualizations = 0;
    //const gallery = document.getElementById('gallery');//<div id="portfolio"> 
    const gallery = document.getElementById('portfolio');
    const wordCloud = document.getElementById('word-cloud');
    const explanationBox = document.createElement('div');
    explanationBox.innerHTML = '<span class="explanation-box album-keyword"><strong>Bold</strong> and <span class="word-boxed">boxed</span> indicates an <a href="https://zenodo.org/doi/10.5281/zenodo.7953307" target="_blank">official EURAF agroforestry typology</a>.</span>';
    //wordCloud.before(explanationBox); // Insert explanation before word cloud
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
            
            const item = `
                <div class="tile ${category_classes} ">
                    <a href="${image_url_500}" class="popup-btn" data-title="${title}" data-authors="${authors}" data-year="${year}" data-doi="${doi_url}">
                        <img src="${image_url_500}" alt="${title}" >
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
    //wordCloud.innerHTML = `<span class="word-filter" data-filter="*">All 📷 <sup>${photos.length}</sup></span>`;
    for (const sanitizedKeyword in categories) {
        const originalKeyword = keywordMap[sanitizedKeyword];
        const isAlbum = albumKeywordsSanitized.includes(sanitizedKeyword);
        const additionalClass = isAlbum ? 'album-keyword' : '';
       // wordCloud.innerHTML += `<span class="word-filter ${additionalClass}" data-filter=".${sanitizedKeyword}">${originalKeyword} <sup>${categories[sanitizedKeyword]}</sup></span>`;
    }

    // // Animate the visualization counter
    // const counterElement = document.getElementById('visualization-count');
    // animateCounter(counterElement, 0, totalVisualizations, 2000);

    // // Initialize Isotope and Magnific Popup
    // initIsotope();
    // initMagnificPopup();
}
function sanitizeKeyword(keyword) {
    return keyword
        .trim() // Remove leading/trailing spaces
        .replace(/[^a-zA-Z0-9]+/g, '') // Remove all non-alphanumeric characters (spaces, parentheses, etc.)
        .toLowerCase(); // Convert to lowercase
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
  function ConvertDDToDMS(D, lng) {
    return {
      dir: D < 0 ? (lng ? "W" : "S") : lng ? "E" : "N",
      deg: 0 | (D < 0 ? (D = -D) : D),
      min: 0 | (((D += 1e-9) % 1) * 60),
      sec: (0 | (((D * 60) % 1) * 6000)) / 100,
    };
  }
  function sanitizeKeyword(keyword) {
    return keyword
        .trim() // Remove leading/trailing spaces
        .replace(/[^a-zA-Z0-9]+/g, '') // Remove all non-alphanumeric characters (spaces, parentheses, etc.)
        .toLowerCase(); // Convert to lowercase
}

// Fetch photos and build the gallery on page load
document.addEventListener('DOMContentLoaded', async () => {
    let photos = await fetchZenodoPhotos(); // Fetch photos from Zenodo
    buildGalleryAndWordCloud(photos); // Build the gallery and word cloud
});