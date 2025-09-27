// app.js - extracted from index.html
// ...existing code from <script>...</script> in index.html...
// All the JavaScript logic from your <script> tag goes here, unchanged except for removal of <script> tags.
// For brevity, only the first and last lines are commented here.

// Configuration - Update this with your Vercel deployment URL
const API_BASE_URL = ''; // Use relative URLs for API calls

// Detect if we're running locally
const IS_LOCAL = window.location.hostname === 'localhost' || 
                 window.location.hostname === '127.0.0.1' ||
                 window.location.port === '3000';

// Mock data for fallback
const mockPlaces = [
    { id: 1, name: "Joe's Coffee Shop", address: "123 Main St, New York, NY", rating: 4.2, totalReviews: 847 },
    { id: 2, name: "Pizza Palace", address: "456 Oak Ave, New York, NY", rating: 3.8, totalReviews: 523 },
    { id: 3, name: "The Book Nook", address: "789 Pine Rd, New York, NY", rating: 4.7, totalReviews: 312 }
];

const mockReviews = [
    {
        id: 1,
        author: "Sarah M.",
        rating: 5,
        text: "Amazing coffee and friendly staff! I ordered their specialty latte and tried the blueberry muffin. The atmosphere is perfect for working, with plenty of outlets and comfortable seating. The staff was very attentive and refilled my water glass without asking. Would definitely recommend this place for remote work or casual meetings.",
        categories: ["Useful"],
        localClassification: true,
        classificationReason: "Local rule-based classification"
    },
    {
        id: 2,
        author: "Mike T.",
        rating: 1,
        text: "I heard this place is terrible! Never been there myself but people say it's awful!!!",
        categories: ["Rant Without Visit"],
        localClassification: true,
        classificationReason: "Local rule-based classification"
    },
    {
        id: 3,
        author: "Emma K.",
        rating: 4,
        text: "Went there last week and ordered the pasta. Good coffee, nice ambiance. Service was a bit slow but the quality made up for it. The staff was friendly and the atmosphere was cozy.",
        categories: ["Useful"],
        localClassification: false,
        classificationReason: "ML model classification"
    },
    {
        id: 4,
        author: "PromoDeals123",
        rating: 5,
        text: "Visit our website for amazing deals! Click here: www.fake-deals.com Call us now at 555-123-4567. AMAZING DEAL!!!",
        categories: ["Advertisements", "Spam"],
        localClassification: true,
        classificationReason: "Local rule-based classification"
    },
    {
        id: 5,
        author: "TestUser456",
        rating: 5,
        text: "Great!!!!! AMAZING DEAL!!! Click here now!!!",
        categories: ["Spam"],
        localClassification: true,
        classificationReason: "Local rule-based classification"
    },
    {
        id: 6,
        author: "AI_Classified",
        rating: 3,
        text: "This review was classified by the ML model because it doesn't match any obvious local patterns.",
        categories: ["Useful"],
        localClassification: false,
        classificationReason: "ML model classification"
    }
];

// DOM elements
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const headerElement = document.querySelector('.header');
const placesList = document.getElementById('placesList');
const reviewsSection = document.getElementById('reviewsSection');
const reviewsGrid = document.getElementById('reviewsGrid');
const filterBtns = document.querySelectorAll('.filter-btn');
const searchScope = document.getElementById('searchScope');
const mainContainer = document.getElementById('mainContainer');

// Tab elements
const tabSearch = document.getElementById('tabSearch');
const tabTest = document.getElementById('tabTest');
const searchTab = document.getElementById('searchTab');
const testTab = document.getElementById('testTab');
const searchScopeContainer = document.getElementById('searchScopeContainer');

// Global variables
let currentReviews = [];
let selectedPlace = null;
let allPlaces = [];
let reviewsByPlace = {};

// Event listeners
searchBtn.addEventListener('click', handleSearch);
searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleSearch();
});

filterBtns.forEach(btn => {
    btn.addEventListener('click', () => handleFilter(btn.dataset.category));
});

// Tab selector logic
tabSearch.addEventListener('click', () => {
    tabSearch.classList.add('active');
    tabTest.classList.remove('active');
    searchTab.style.display = '';
    testTab.classList.remove('show');
    if (searchScopeContainer) searchScopeContainer.style.display = '';
    // If there are search results, use 350px, else use initial 260px
    if (placesList && allPlaces && allPlaces.length > 0) {
        searchSection.style.minHeight = '350px';
        placesList.classList.add('show');
    } else {
        searchSection.style.minHeight = '260px';
        if (placesList) placesList.classList.remove('show');
    }
    // Show reviews section if a place is selected
    if (reviewsSection && selectedPlace) {
        reviewsSection.classList.add('show');
    } else if (reviewsSection) {
        reviewsSection.classList.remove('show');
    }
});
tabTest.addEventListener('click', () => {
    tabTest.classList.add('active');
    tabSearch.classList.remove('active');
    searchTab.style.display = 'none';
    testTab.classList.add('show');
    if (searchScopeContainer) searchScopeContainer.style.display = 'none';
    searchSection.style.minHeight = '350px';
    // Hide search results and reviews
    if (placesList) placesList.classList.remove('show');
    if (reviewsSection) reviewsSection.classList.remove('show');
});

// API function
async function searchPlacesWithAPI(searchQuery, location = 'New York, USA') {
    try {
        console.log('Calling API with query:', searchQuery);
        const response = await fetch(`/api/scrape-reviews`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                searchQuery,
                location
            })
        });
        if (!response.ok) {
            const errorData = await response.text();
            throw new Error(`API call failed: ${response.status} - ${errorData}`);
        }
        const result = await response.json();
        if (!result.success) {
            throw new Error(result.message || 'API call failed');
        }
        console.log('API call successful');
        return result.data;
    } catch (error) {
        console.error('Error calling API:', error);
        throw error;
    }
}

// Review categorization
function categorizeReview(reviewText, rating, authorName) {
    const text = reviewText.toLowerCase();
    const author = authorName.toLowerCase();
    const categories = [];
    if (text.includes('click here') || text.includes('visit') || text.includes('discount') || 
        text.includes('www.') || text.includes('http') || text.includes('promo') ||
        author.includes('promo') || author.includes('deal') || author.includes('bot')) {
        categories.push('Advertisements');
    }
    if (text.includes('!!!') || text.match(/[A-Z]{3,}/) || 
        text.includes('free money') || text.includes('prizes') || 
        author.includes('bot') || author.includes('spam')) {
        categories.push('Spam');
    }
    if (rating <= 2 && (text.includes('worst') || text.includes('terrible') || 
        text.includes('never going') || text.includes('awful')) && 
        text.length > 200) {
        categories.push('Rant Without Visit');
    }
    if (text.length < 50 || text.includes('okay i guess') || 
        text.includes('nothing special') || text.includes('meh')) {
        categories.push('Irrelevant Content');
    }
    if (categories.length === 0) {
        categories.push('Useful');
    }
    return categories;
}

// Transform API data
function transformApifyData(apifyResults) {
    const places = [];
    const reviewsByPlace = {};
    apifyResults.forEach((item, index) => {
        const place = {
            id: index + 1,
            name: item.title || item.name || 'Unknown Place',
            address: item.address || item.location || 'Unknown Address',
            rating: item.totalScore || item.rating || 0,
            totalReviews: item.reviewsCount || (item.reviews ? item.reviews.length : 0),
        };
        places.push(place);
        if (item.reviews && item.reviews.length > 0) {
            console.log('Raw API review data:', item.reviews);
            
            // Debug: Check specific review properties from API
            console.log('Review properties check:', item.reviews.map(r => ({
                text: (r.text || r.reviewText || '').substring(0, 30) + '...',
                hasClassifications: !!r.classifications,
                localClassification: r.localClassification,
                classificationReason: r.classificationReason
            })));
            
            reviewsByPlace[place.id] = item.reviews
                .filter(review => {
                    const text = review.text || review.reviewText || '';
                    return text.trim().length > 0;
                })
                .map((review, reviewIndex) => {
                    console.log('Processing review:', {
                        text: (review.text || review.reviewText || '').substring(0, 30) + '...',
                        photos: review.reviewImageUrls,
                        hasPhotos: !!review.reviewImageUrls?.length
                    });
                    
                    return {
                        id: reviewIndex + 1,
                        author: review.name || review.authorName || 'Anonymous',
                        rating: review.stars || review.rating || 0,
                        text: review.text || review.reviewText || 'No review text',
                        reviewImageUrls: review.reviewImageUrls || [],  // Preserve photo information
                        // Use the classifications from the API if available, otherwise fall back to local categorization
                        categories: review.classifications || categorizeReview(
                            review.text || review.reviewText || '',
                            review.stars || review.rating || 0,
                            review.name || review.authorName || ''
                        ),
                        // Preserve classification metadata from the API
                        localClassification: review.localClassification ?? false,
                        classificationReason: review.classificationReason || 'No classification info'
                    };
                });
        }
    });
    return { places, reviewsByPlace };
}

// Main search handler
async function handleSearch() {
    const query = searchInput.value.trim();
    if (!query) return;
    // Animation handled by CSS
    // Determine search scope
    let finalQuery = query;
    let location = '';
    if (searchScope && searchScope.value === 'local') {
        // Append Singapore for local search
        finalQuery = `${query} Singapore`;
        location = 'Singapore';
    } else {
        location = '';
    }
    showLoading('Scraping Google Maps reviews...');
    try {
        const apifyResults = await searchPlacesWithAPI(finalQuery, location);
        
        // Debug: Log raw API response to see classification properties
        console.log('[UI] Raw API response:', apifyResults);
        console.log('[UI] First place reviews with classification properties:', 
            apifyResults[0]?.reviews?.map(r => ({
                text: (r.text || r.reviewText || '').substring(0, 30) + '...',
                localClassification: r.localClassification,
                classifications: r.classifications,
                classificationReason: r.classificationReason
            }))
        );
        
        const { places, reviewsByPlace: reviews } = transformApifyData(apifyResults);
        
        // Debug: Check if localClassification flags are preserved after transformation
        console.log('After transformApifyData, checking localClassification flags:');
        Object.values(reviews).forEach((placeReviews, placeIndex) => {
            console.log(`Place ${placeIndex + 1} reviews:`, placeReviews.map(r => ({
                text: r.text.substring(0, 30) + '...',
                localClassification: r.localClassification,
                categories: r.categories
            })));
        });
        
        allPlaces = places;
        reviewsByPlace = reviews;
        displayPlaces(places);
    } catch (error) {
        console.error('Error with API:', error);
        placesList.innerHTML = `
            <div class="error-message">
                <h3>API Error</h3>
                <p>${error.message}</p>
                <p style="margin-top: 10px; font-size: 0.9rem;">
                    Falling back to mock data for demonstration...
                </p>
            </div>
        `;
        setTimeout(() => {
            const results = mockPlaces.filter(place => 
                place.name.toLowerCase().includes(query.toLowerCase()) ||
                place.address.toLowerCase().includes(query.toLowerCase())
            );
            allPlaces = results;
            reviewsByPlace = { 1: mockReviews, 2: mockReviews, 3: mockReviews };
            displayPlaces(results);
        }, 2000);
    }
    // Animation handled by CSS
}

function showLoading(message = 'Loading...') {
    placesList.innerHTML = `
        <div class="loading">
            <div class="spinner"></div>
            <p>${message}</p>
            <p style="font-size: 0.9rem; color: #666; margin-top: 10px;">
                This may take 2-3 minutes...
            </p>
        </div>
    `;
    placesList.classList.add('show');
}

function displayPlaces(places) {
    if (places.length === 0) {
        placesList.innerHTML = '<p style="text-align: center; padding: 20px; color: #666;">No places found. Try a different search term.</p>';
        return;
    }
    placesList.innerHTML = places.map(place => `
        <div class="place-item" onclick="selectPlace(${place.id})">
            <div class="place-name">${place.name}</div>
            <div class="place-details">
                <span>${place.address}</span>
                <div class="rating">
                    <span class="stars">${generateStars(place.rating)}</span>
                    <span>${place.rating}</span>
                    <span>•</span>
                    <span>${place.totalReviews} reviews</span>
                </div>
            </div>
        </div>
    `).join('');
    // Auto-scroll to center the results
    setTimeout(() => {
        const rect = placesList.getBoundingClientRect();
        const scrollY = window.scrollY + rect.top + rect.height/2 - window.innerHeight/2;
        window.scrollTo({ top: scrollY, behavior: 'smooth' });
    }, 100);
}

window.selectPlace = function(placeId) {
    selectedPlace = allPlaces.find(p => p.id === placeId);
    document.getElementById('selectedPlaceName').textContent = selectedPlace.name;
    document.getElementById('selectedPlaceAddress').textContent = selectedPlace.address;
    document.getElementById('selectedPlaceStars').textContent = generateStars(selectedPlace.rating);
    document.getElementById('selectedPlaceRating').textContent = selectedPlace.rating;
    document.getElementById('selectedPlaceReviews').textContent = `${selectedPlace.totalReviews} reviews`;
    const placeReviews = reviewsByPlace[selectedPlace.id] || [];
    currentReviews = placeReviews;
    // Show only Useful reviews by default
    const usefulBtn = Array.from(filterBtns).find(btn => btn.dataset.category === 'Useful');
    filterBtns.forEach(btn => btn.classList.remove('active'));
    if (usefulBtn) usefulBtn.classList.add('active');
    const usefulReviews = currentReviews.filter(review => review.categories.includes('Useful'));
    displayReviews(usefulReviews);
    reviewsSection.classList.add('show');
    // Auto-scroll to center reviews section
    setTimeout(() => {
        const rect = reviewsSection.getBoundingClientRect();
        const scrollY = window.scrollY + rect.top + rect.height/2 - window.innerHeight/2;
        window.scrollTo({ top: scrollY, behavior: 'smooth' });
    }, 100);
}

function displayReviews(reviews) {
    // Debug: Check review data including photos
    console.log('[UI] Review data:', 
        reviews.map(r => ({
            text: r.text.substring(0, 30) + '...',
            localClassification: r.localClassification,
            categories: r.categories,
            hasPhotos: !!r.reviewImageUrls?.length,
            photoCount: r.reviewImageUrls?.length || 0
        }))
    );
    
    if (reviews.length === 0) {
        reviewsGrid.innerHTML = '<p style="text-align: center; padding: 40px; color: #666;">No reviews match the current filters.</p>';
        return;
    }
    reviewsGrid.innerHTML = reviews.map((review, index) => {
        const categoryTags = review.categories.map(cat => {
            const className = cat.toLowerCase().replace(/\s+/g, '-');
            return `<span class="category-tag category-${className}">${cat}</span>`;
        }).join('');
        
        const classificationBadge = review.localClassification 
            ? `<span class="classification-badge local" data-tooltip="${review.classificationReason || 'Classified by rule-based filters'}">🔍 Rules</span>`
            : `<span class="classification-badge ml" data-tooltip="${review.classificationReason || 'This review was classified by our pretrained model'}">🤖 Model</span>`;
            
        return `
        <div class="review-card" style="animation-delay: ${index * 0.1}s">
            <div class="review-header">
                <div class="reviewer-info">
                    <div class="reviewer-avatar">
                        ${review.author.charAt(0).toUpperCase()}
                    </div>
                    <div class="reviewer-details">
                        <h4>${review.author}</h4>
                    </div>
                </div>
                <div class="review-rating">
                    ${generateStars(review.rating)}
                </div>
            </div>
            <div class="review-text">${review.text}</div>
            <div class="review-categories">
                ${categoryTags}
                <div class="classification-indicator">
                    ${review.reviewImageUrls && review.reviewImageUrls.length > 0 ? 
                        `<span class="photo-indicator" data-tooltip="This review contains ${review.reviewImageUrls.length} photo${review.reviewImageUrls.length > 1 ? 's' : ''}" style="margin-right: 8px;">📸</span>` 
                        : ''}
                    ${classificationBadge}
                </div>
            </div>
        </div>
        `;
    }).join('');
}

function handleFilter(category) {
    filterBtns.forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    if (category === 'all') {
        displayReviews(currentReviews);
    } else {
        const filtered = currentReviews.filter(review => 
            review.categories.includes(category)
        );
        displayReviews(filtered);
    }
}

function generateStars(rating) {
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;
    const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);
    return '★'.repeat(fullStars) + 
           (hasHalfStar ? '☆' : '') + 
           '☆'.repeat(emptyStars);
}


const testBtn = document.getElementById('testBtn');
const testInput = document.getElementById('testInput');
const testResult = document.getElementById('testResult');
const testStarRating = document.getElementById('testStarRating');
let testSelectedRating = 0;

// Initially disable the test button
testBtn.disabled = true;
testBtn.classList.add('disabled');

// Function to check if we can enable the test button
function checkEnableTestButton() {
    const hasRating = testSelectedRating > 0;
    const hasText = testInput.value.trim().length > 0;
    testBtn.disabled = !(hasRating && hasText);
    testBtn.classList.toggle('disabled', !(hasRating && hasText));
}

if (testStarRating) {
    const stars = testStarRating.querySelectorAll('.star');
    stars.forEach((star, idx) => {
        star.addEventListener('click', function() {
            testSelectedRating = idx + 1;
            stars.forEach((s, i) => {
                s.classList.toggle('selected', i < testSelectedRating);
            });
            checkEnableTestButton();
        });
        star.addEventListener('mouseover', function() {
            stars.forEach((s, i) => {
                s.classList.toggle('hovered', i <= idx);
            });
        });
        star.addEventListener('mouseout', function() {
            stars.forEach((s, i) => {
                s.classList.remove('hovered');
            });
        });
    });
}

// Listen for changes in the test input
testInput.addEventListener('input', checkEnableTestButton);
testBtn.addEventListener('click', async () => {
    const text = testInput.value.trim();
    if (!text) {
        testResult.textContent = 'Please enter a review.';
        return;
    }
    testResult.innerHTML = '<span style="color:#888">Classifying...</span>';
    try {
        const apiUrl = window.location.origin + '/api/classify-review';
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                reviewText: text,
                rating: testSelectedRating
            })
        });
        if (!response.ok) throw new Error('API error: ' + response.status);
        const result = await response.json();
        if (result.success && result.data && result.data.predictions) {
            const categories = result.data.predictions.map(p => p.label);
            const isLocal = result.data.local_classification || false;
            
            // Create classification badge
            const classificationBadge = isLocal 
                ? `<span class="classification-badge local" data-tooltip="${result.data.classification_reason || 'Classified by rule-based filters'}">🔍 Rules</span>`
                : `<span class="classification-badge ml" data-tooltip="${result.data.classification_reason || 'This review was classified by our pretrained model'}">🤖 Model</span>`;
            
            // Create category tags
            const categoryTags = categories.map(cat => 
                `<span class="category-tag category-${cat.toLowerCase().replace(/\s+/g,'-')}">${cat}</span>`
            ).join(' ');
            
            testResult.innerHTML = `
                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
                    <span>Classified as:</span>
                    ${classificationBadge}
                </div>
                <div>${categoryTags}</div>
            `;
        } else {
            testResult.innerHTML = '<span style="color:#c62828">Classification failed.</span>';
        }
    } catch (err) {
        testResult.innerHTML = '<span style="color:#c62828">Error: ' + err.message + '</span>';
    }
});
searchInput.addEventListener('input', (e) => {
    if (e.target.value.length === 0) {
        placesList.classList.remove('show');
    }
});

if (searchScopeContainer) searchScopeContainer.style.display = '';

// Simple animation fallback for very slow connections
function initializePageAnimations() {
    const searchSection = document.querySelector('.search-section');
    
    if (!searchSection) return;
    
    // Fallback: ensure search section is visible after 3 seconds regardless
    setTimeout(() => {
        if (window.getComputedStyle(searchSection).opacity === '0') {
            document.body.classList.add('no-animations');
        }
    }, 3000);
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializePageAnimations);
} else {
    initializePageAnimations();
}
