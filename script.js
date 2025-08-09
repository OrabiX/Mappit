// ==================== GLOBAL VARIABLES ====================
let map;
let colorIndex = 0;
let selectedCountryLayer = null;
let capitalMarker;
let currentLanguage = 'en';
const capitalCoordinates = {};

const colorPalette = [
  '#efd31a', '#b856a1', '#f4ae1a', '#915ba6', '#f26b29',
  '#518bca', '#ef4923', '#28beb5', '#ef2f44', '#67bf6b',
  '#eb468a', '#a2cd48'
];

const capitalPhrases = {
  en: { popup: "Capital", announcement: "the capital city is" },
  ar: { popup: "العاصمة", announcement: "العاصمة هي" },
  es: { popup: "La capital", announcement: "La capital es" },
  fr: { popup: "La capitale", announcement: "La capitale est" },
  zh: { popup: "首都", announcement: "首都是" }
};

const specialCases = {
  "North Cyprus": { code: "CYN", name: "North Cyprus" },
  "Kosovo": { code: "KOS", name: "Kosovo" },
  "France": { code: "FRA", name: "France" },
  "French Guiana": { code: "GUF", name: "French Guiana" },
  "Norway": { code: "NOR", name: "Norway" },
  "Somaliland": { code: "SOL", name: "Somaliland" },
  "Baikonur": { code: "BRK", name: "Baikonur" }
};

const starIcon = L.icon({
  iconUrl: 'star-icon.png',
  iconSize: [15, 15],
  iconAnchor: [12, 12],
  popupAnchor: [0, -12]
});

// ==================== UTILITY FUNCTIONS ====================

function getNextColor() {
  const color = colorPalette[colorIndex];
  colorIndex = (colorIndex + 1) % colorPalette.length;
  return color;
}

function style() {
  return {
    fillColor: getNextColor(),
    weight: 0.1,
    opacity: 1,
    color: 'black',
    fillOpacity: 0.7
  };
}

function resetCountryStyle(layer) {
  layer.setStyle({ fillColor: getNextColor(), fillOpacity: 0.7 });
}

function getLanguageCode() {
  const codes = { en: 'en-US', ar: 'ar-SA', es: 'es-ES', fr: 'fr-FR', zh: 'zh-CN' };
  return codes[currentLanguage.toLowerCase()] || 'en-US';
}

async function getTranslation(key, language) {
  try {
    const response = await fetch(`/data/languages/lang_${language}.json`);
    const langData = await response.json();
    return langData[key] || key;
  } catch (error) {
    console.error("Error fetching language data:", error);
    return key;
  }
}

function setSpeechLanguage(text) {
  const speech = new SpeechSynthesisUtterance(text);
  const langCode = getLanguageCode();

  function speakWithVoice() {
    const voices = window.speechSynthesis.getVoices();
    speech.lang = langCode;
    const selectedVoice = voices.find(v => v.lang === langCode);
    if (selectedVoice) speech.voice = selectedVoice;
    window.speechSynthesis.speak(speech);
  }

  if (window.speechSynthesis.getVoices().length === 0) {
    window.speechSynthesis.onvoiceschanged = speakWithVoice;
  } else {
    speakWithVoice();
  }
}

async function updateTextForLanguage(language) {
  const elements = document.querySelectorAll('.country-name');
  for (const element of elements) {
    const translation = await getTranslation(element.id, language);
    element.innerText = translation || element.id;
  }
}

function setLanguage(languageCode) {
  currentLanguage = languageCode;
  document.documentElement.lang = languageCode;
  document.documentElement.dir = (languageCode === 'ar') ? 'rtl' : 'ltr';

  // Update any static page text
  updateTextForLanguage(languageCode);

  // Re-trigger click on the selected country to update popup content
  if (selectedCountryLayer) {
    selectedCountryLayer.fire("click");
  }
}

// ==================== LANGUAGE SELECTOR ====================

function initLanguageSelector() {
  const langSelector = document.getElementById("language-selector");
  const languageOptions = document.getElementById("language-options");
  const announcement = document.getElementById("language-announcement");

  // Toggle language dropdown
  langSelector.addEventListener("click", (e) => {
    e.stopPropagation();
    const isHidden = languageOptions.style.display === "none" || !languageOptions.style.display;
    languageOptions.style.display = isHidden ? "block" : "none";
    languageOptions.setAttribute("aria-hidden", !isHidden);
    langSelector.setAttribute("aria-expanded", isHidden.toString());
  });

  // Handle language changes
  document.querySelectorAll(".language-option").forEach((button) => {
    button.addEventListener("click", () => {
      const selectedLanguage = button.getAttribute("data-language");
      setLanguage(selectedLanguage); // Updates text and re-fires popup
      announcement.textContent = `Language changed to ${button.textContent}`;
      languageOptions.style.display = "none";
    });
  });

  // Close dropdown when clicking outside
  document.addEventListener("click", (event) => {
    if (!document.querySelector(".language-wrapper").contains(event.target)) {
      languageOptions.style.display = "none";
      languageOptions.setAttribute("aria-hidden", "true");
      langSelector.setAttribute("aria-expanded", "false");
    }
  });
}

// Call it on page load
document.addEventListener("DOMContentLoaded", initLanguageSelector);


// ==================== EVENT HANDLERS ====================

function onEachFeature(feature, layer) {
  layer.on("click", async () => {
    if (!capitalCoordinates) return;

    if (selectedCountryLayer && selectedCountryLayer !== layer) {
      resetCountryStyle(selectedCountryLayer);
      selectedCountryLayer.closePopup();
    }

    if (selectedCountryLayer === layer) {
      resetCountryStyle(layer);
      layer.closePopup();
      selectedCountryLayer = null;
      if (capitalMarker) map.removeLayer(capitalMarker);
      return;
    }

    // Highlight country
    layer.setStyle({ fillColor: "#ff7800", fillOpacity: 0.5 });

    // Get country info
    let countryCode = feature.properties.ISO_A3 || feature.properties.ISO_A2;
    let countryName = feature.properties.NAME_EN;
    if (specialCases[countryName]) {
      countryCode = specialCases[countryName].code;
      countryName = specialCases[countryName].name;
    }

    // Translations
    const translatedCountryName = await getTranslation(countryName, currentLanguage);
    const capitalInfo = capitalCoordinates[countryCode] || { name: "Unknown Capital", coordinates: null };
    const translatedCapitalName = await getTranslation(`${countryName}_capital`, currentLanguage);

    const capitalLabel = capitalPhrases[currentLanguage]?.popup || "Capital";
    const announcementLabel = capitalPhrases[currentLanguage]?.announcement || "the capital city is";

    const flagPath = `/flags/${countryCode}.png`;
    const flagImage = `<img src='${flagPath}' alt='${translatedCountryName} flag' width='50px' onerror='this.src="/flags/default.png"' />`;

    // Popup content
    const popupContent = `
      <div>
        <h2><b>${translatedCountryName}</b></h2>
        ${flagImage}
        <p>${capitalLabel}: ${translatedCapitalName} <span>★</span></p>
      </div>
    `;

    layer.bindPopup(popupContent).openPopup();
    map.fitBounds(layer.getBounds());

    setSpeechLanguage(`${translatedCountryName}, ${announcementLabel} ${translatedCapitalName}`);

    selectedCountryLayer = layer;

    if (capitalMarker) map.removeLayer(capitalMarker);
    if (capitalInfo.coordinates) {
      capitalMarker = L.marker(capitalInfo.coordinates, { icon: starIcon }).addTo(map);
    }
  });
}

// ==================== DATA FETCHING ====================

function fetchCapitalData() {
  fetch('https://restcountries.com/v3.1/all?fields=cca3,capital,capitalInfo')
    .then(res => res.json())
    .then(data => {
      data.forEach(country => {
        const code = country.cca3;
        const name = country.capital?.[0] || 'No Capital';
        const coords = country.capitalInfo?.latlng || null;
        capitalCoordinates[code] = { name, coordinates: coords };
      });

      // Special capitals
      capitalCoordinates['CYN'] = { name: "North Nicosia", coordinates: [35.1856, 33.3823] };
      capitalCoordinates['GUF'] = { name: "Cayenne", coordinates: [4.9224, -52.3340] };
      capitalCoordinates['KOS'] = { name: "Prishtina", coordinates: [42.6629, 21.1655] };
      capitalCoordinates['SOL'] = { name: "Hargeisa", coordinates: [9.5600, 44.0650] };

      initializeMap();
    })
    .catch(err => console.error('Error fetching country data:', err));
}

// ==================== MAP INITIALIZATION ====================

function initializeMap() {
  map = L.map('map', {
    worldCopyJump: false,
    maxBounds: [[-90, -180], [90, 180]],
    maxBoundsViscosity: 1.0
  }).setView([20, 0], 2);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://carto.com/attributions">CARTO</a>',
    maxZoom: 10,
    minZoom: 2
  }).addTo(map);

  map.getContainer().style.backgroundColor = '#87CEEB';

  fetch('/data/countries.geojson')
    .then(res => res.json())
    .then(geojsonData => {
      L.geoJSON(geojsonData, { style, onEachFeature }).addTo(map);
    })
    .catch(err => console.error('Error loading GeoJSON:', err));
}

// ==================== EVENT LISTENERS ====================

document.getElementById('language-selector').addEventListener('click', () => {
  const options = document.getElementById('language-options');
  options.style.display = options.style.display === 'none' ? 'block' : 'none';
});

document.querySelectorAll('.language-option').forEach(option => {
  option.addEventListener('click', e => {
    setLanguage(e.target.getAttribute('data-language'));
  });
});

// ==================== START APP ====================
fetchCapitalData();