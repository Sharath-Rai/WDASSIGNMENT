const OPENAI_API_KEY = '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';
const SERP_API_KEY = '7f579a54abd2f9ab777ac3514d08b006d830a131220a61768c12a3a38ff2131e';

const locationInput = document.getElementById('location');
const getLocationBtn = document.getElementById('getLocationBtn');
const searchBtn = document.getElementById('searchBtn');
const radiusSelect = document.getElementById('radius');
const categorySelect = document.getElementById('category');
const dateSelect = document.getElementById('date');
const loadingElement = document.getElementById('loading');
const resultsSection = document.getElementById('results');
const eventsContainer = document.getElementById('eventsContainer');

getLocationBtn.addEventListener('click', getCurrentLocation);
searchBtn.addEventListener('click', searchEvents);

function getCurrentLocation() {
    if (navigator.geolocation) {
        getLocationBtn.disabled = true;
        getLocationBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Locating...';
        
        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const { latitude, longitude } = position.coords;
                try {
                    const locationName = await reverseGeocodeWithOpenAI(latitude, longitude);
                    locationInput.value = locationName;
                    getLocationBtn.innerHTML = '<i class="fas fa-location-arrow"></i> Use Current Location';
                    getLocationBtn.disabled = false;
                } catch (error) {
                    console.error('Error getting location name:', error);
                    locationInput.value = `${latitude}, ${longitude}`;
                    getLocationBtn.innerHTML = '<i class="fas fa-location-arrow"></i> Use Current Location';
                    getLocationBtn.disabled = false;
                }
            },
            (error) => {
                console.error('Error getting location:', error);
                alert('Could not get your location. Please enter it manually.');
                getLocationBtn.innerHTML = '<i class="fas fa-location-arrow"></i> Use Current Location';
                getLocationBtn.disabled = false;
            }
        );
    } else {
        alert('Geolocation is not supported by your browser. Please enter your location manually.');
    }
}
async function reverseGeocodeWithOpenAI(lat, lng) {
    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: "gpt-3.5-turbo",
                messages: [
                    {
                        role: "system",
                        content: "You are a helpful assistant that provides the name of the nearest city or town when given latitude and longitude coordinates. Respond only with the location name in the format 'City, State' or similar."
                    },
                    {
                        role: "user",
                        content: `What is the name of the location at coordinates ${lat}, ${lng}? Respond only with the location name.`
                    }
                ],
                temperature: 0.7,
                max_tokens: 64
            })
        });

        const data = await response.json();
        return data.choices[0].message.content.trim();
    } catch (error) {
        console.error('Error with OpenAI geocoding:', error);
        return `${lat}, ${lng}`;
    }
}

async function searchEvents() {
    const location = locationInput.value.trim();
    const radius = radiusSelect.value;
    const category = categorySelect.value;
    const dateRange = dateSelect.value;
    
    if (!location) {
        alert('Please enter a location');
        return;
    }
    
    loadingElement.style.display = 'block';
    resultsSection.style.display = 'none';
    eventsContainer.innerHTML = '';
    
    try {
        const processedLocation = await processLocationWithOpenAI(location);
        let query = `events in ${processedLocation}`;
        if (category !== 'all') {
            query += ` ${category} events`;
        }
        const dateFilter = getDateFilter(dateRange);
        const events = await searchWithSERP(query, processedLocation, radius, dateFilter);
        displayEvents(events);
    } catch (error) {
        console.error('Error searching events:', error);
        eventsContainer.innerHTML = `
            <div class="no-events">
                <i class="fas fa-exclamation-triangle fa-3x"></i>
                <h3>Error loading events</h3>
                <p>${error.message}</p>
                <p>Please try again later or with different search parameters.</p>
            </div>
        `;
    } finally {
        loadingElement.style.display = 'none';
        resultsSection.style.display = 'block';
    }
}
async function processLocationWithOpenAI(location) {
    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: "gpt-3.5-turbo",
                messages: [
                    {
                        role: "system",
                        content: "You are a helpful assistant that standardizes location names. Given a location input, return just the standardized city and state/country name in the format 'City, State' or 'City, Country'. If the input is already good, return it as-is."
                    },
                    {
                        role: "user",
                        content: `Standardize this location for an event search: ${location}. Respond only with the location name.`
                    }
                ],
                temperature: 0.3,
                max_tokens: 64
            })
        });

        const data = await response.json();
        return data.choices[0].message.content.trim();
    } catch (error) {
        console.error('Error processing location with OpenAI:', error);
        return location;
    }
}
function getDateFilter(dateRange) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    switch (dateRange) {
        case 'today':
            return {
                start: today,
                end: new Date(today.getTime() + 24 * 60 * 60 * 1000)
            };
        case 'week':
            return {
                start: today,
                end: new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)
            };
        case 'month':
            const nextMonth = new Date(today);
            nextMonth.setMonth(nextMonth.getMonth() + 1);
            return {
                start: today,
                end: nextMonth
            };
        default:
            return null;
    }
}

async function searchWithSERP(query, location, radius, dateFilter) {
    const url = `https://serpapi.com/search.json?q=${encodeURIComponent(query)}&location=${encodeURIComponent(location)}&hl=en&gl=us&api_key=${SERP_API_KEY}`;
    
    try {
        const response = await fetch(url);
        const data = await response.json();
        if (data.events_results) {
            return await enhanceEventDescriptions(data.events_results);
        }
        const events = [];
        
        if (data.organic_results) {
            for (const result of data.organic_results) {
                if (result.title && result.link && (result.title.toLowerCase().includes('event') || 
                    result.title.toLowerCase().includes('ticket') || 
                    result.snippet?.toLowerCase().includes('event'))) {
                    
                    events.push({
                        title: result.title,
                        link: result.link,
                        date: 'Check website for dates',
                        location: location,
                        description: result.snippet || 'Event details available on the website',
                        image: 'https://via.placeholder.com/300x180?text=Event+Image'
                    });
                }
            }
        }
        if (events.length > 0) {
            return await enhanceEventDescriptions(events);
        }
        return await enhanceEventDescriptions(getMockEvents(location));
    } catch (error) {
        console.error('Error with SERP API:', error);
        return await enhanceEventDescriptions(getMockEvents(location));
    }
}
async function enhanceEventDescriptions(events) {
    if (!events || events.length === 0 || events[0].isMock) {
        return events;
    }

    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: "gpt-3.5-turbo",
                messages: [
                    {
                        role: "system",
                        content: "You are a helpful assistant that improves event descriptions. Given a list of events, return the same list with enhanced descriptions that are more engaging and informative while keeping the original meaning. Maintain the exact same JSON structure."
                    },
                    {
                        role: "user",
                        content: `Improve these event descriptions: ${JSON.stringify(events)}`
                    }
                ],
                temperature: 0.5
            })
        });

        const data = await response.json();
        return JSON.parse(data.choices[0].message.content);
    } catch (error) {
        console.error('Error enhancing descriptions with OpenAI:', error);
        return events;
    }
}
function displayEvents(events) {
    if (!events || events.length === 0) {
        eventsContainer.innerHTML = `
            <div class="no-events">
                <i class="fas fa-calendar-times fa-3x"></i>
                <h3>No events found</h3>
                <p>Try adjusting your search criteria or expanding the search radius.</p>
            </div>
        `;
        return;
    }
    
    eventsContainer.innerHTML = '';
    
    events.forEach(event => {
        const eventCard = document.createElement('div');
        eventCard.className = 'event-card';
        
        eventCard.innerHTML = `
            <div class="event-image" style="background-image: url('${event.image || 'https://via.placeholder.com/300x180?text=Event+Image'}')"></div>
            <div class="event-details">
                <h3>${event.title}</h3>
                <div class="event-date">
                    <i class="far fa-calendar-alt"></i>
                    <span>${event.date || 'Date not specified'}</span>
                </div>
                <div class="event-location">
                    <i class="fas fa-map-marker-alt"></i>
                    <span>${event.location || 'Location not specified'}</span>
                </div>
                <p class="event-description">${event.description || 'Event details available on the website.'}</p>
                <a href="${event.link}" class="event-link" target="_blank">More Info</a>
            </div>
        `;
        
        eventsContainer.appendChild(eventCard);
    });
}
function getMockEvents(location) {
    const categories = ['Music', 'Sports', 'Arts', 'Family', 'Business'];
    const mockEvents = [];
    
    for (let i = 1; i <= 6; i++) {
        const randomDays = Math.floor(Math.random() * 30);
        const eventDate = new Date();
        eventDate.setDate(eventDate.getDate() + randomDays);
        
        mockEvents.push({
            title: `${categories[i % categories.length]} Event ${i}`,
            link: 'https://example.com/event',
            date: eventDate.toLocaleDateString('en-US', { 
                weekday: 'short', 
                month: 'short', 
                day: 'numeric',
                year: 'numeric'
            }),
            location: location || 'Various Locations',
            description: `Join us for an exciting ${categories[i % categories.length].toLowerCase()} event featuring special guests and activities for all ages.`,
            image: `https://source.unsplash.com/random/300x180/?${categories[i % categories.length].toLowerCase()},event`,
            isMock: true
        });
    }
    
    return mockEvents;
}