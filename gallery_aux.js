const footermessage = document.getElementById('footermessage');
// Toggle cache-busting flag (set to true in development, false in production)
const isCacheBustingEnabled = false;
// To collect problematic DOIs and image URLs
const problematicPhotos = [];

let total_visualizations = 0;

// Toggle word cloud off-canvas
const openFilterBtn = document.getElementById('open-filter');
const closeFilterBtn = document.getElementById('close-filter');
const wordcloudDrawer = document.getElementById('wordcloudDrawer');

// Toggle Add Photos off-canvas
const openAddPhotosBtn = document.getElementById('open-add-photos');
const closeAddPhotosBtn = document.getElementById('close-add-photos');
const addPhotosDrawer = document.getElementById('addPhotosDrawer');

// EVENT LISTENERS
document.addEventListener('DOMContentLoaded', async () => {
  await loadhtmlContent('./content/addphotos.html','add-photos-content');// load Add photos content on page load
  
  
})

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


async function loadhtmlContent(htmlpage,ObjID2inject) {
    
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

  
  async function getClimate(latDD,lonDD){
    objClimate = {}
    lastdecade_start = "2014-01-01";
    lastdecade_end = "2024-12-31";
    let apiUrl = `https://archive-api.open-meteo.com/v1/archive?latitude=${latDD}&longitude=${lonDD}&start_date=${lastdecade_start}&end_date=${lastdecade_start}&daily=temperature_2m_max,temperature_2m_min,rain_sum&timezone=GMT`;
    let response = await fetch(apiUrl); // Fetch data from Zenodo
    let data = await response.json(); // Parse the response as JSON
    
    if (data.daily && data.daily.time.length > 0) {
        temp_max = data.daily.temperature_2m_max; 
        temp_min = data.daily.temperature_2m_min; 
        temp_max = data.daily.rain_sum; 
    }
    return objClimate
  }