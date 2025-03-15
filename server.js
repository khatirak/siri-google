require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { google } = require("googleapis");
const chrono = require('chrono-node');

const app = express();
const PORT = process.env.PORT || 3000;    // for when running on local device

app.use(cors(), express.json());

// Create OAuth2 client 
const oauth2Client = new google.auth.OAuth2(
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET,
  process.env.REDIRECT_URI
);

// Create calendar instance - moved from config
const calendar = google.calendar({
  version: 'v3',
  auth: oauth2Client
});

// utility functions 
// - get/format date range
// - format time
// - build event list express.response
// - extract titles
// - create event object
// - clean data
// - extract data
// - centralised error handling

/**
 * Format date range for calendar API
 * @param {Date} date - The target date
 * @returns {Object} Object with timeMin and timeMax properties
 */
const getDateRange = (date = new Date()) => {
  const targetDate = new Date(date);
  return {
    timeMin: new Date(targetDate.setHours(0, 0, 0, 0)).toISOString(),
    timeMax: new Date(targetDate.setHours(23, 59, 59, 999)).toISOString()
  };
};

/**
 * Format time for display
 * @param {string} dateTimeStr - ISO date string
 * @returns {string} Formatted time string
 */
const formatTime = (dateTimeStr) => {
  return new Date(dateTimeStr)
    .toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Dubai'
    });
};

/**
 * Format date for display
 * @param {string} dateTimeStr - ISO date string
 * @returns {string} Formatted date string
 */
const formatDate = (dateTimeStr) => {
  return new Date(dateTimeStr)
    .toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      timeZone: 'Asia/Dubai'
    });
};

/**
 * Build event list response
 * @param {Array} events - List of calendar events
 * @param {string} dateContext - Context string (e.g., "today" or specific date)
 * @returns {string} Formatted response for Siri
 */
const buildEventListResponse = (events, dateContext) => {
  if (events.length === 0) {
    return `You have no events scheduled for ${dateContext}.`;
  }
  
  let response = `For ${dateContext}, you have ${events.length} event${events.length > 1 ? 's' : ''}. `;
  
  events.forEach(event => {
    const time = formatTime(event.start.dateTime || event.start.date);
    response += `${event.summary} at ${time}. `;
  });
  
  return response;
};

/**
 * Parse event text to extract title
 * @param {string} eventText - Full event text
 * @param {Array} parsedDate - Chrono parsed date results
 * @returns {string} Extracted event title
 */
const extractEventTitle = (eventText, parsedDate) => {
  let eventTitle = eventText;
  parsedDate.forEach(date => {
    eventTitle = eventTitle.replace(date.text, '').trim();
  });
  return eventTitle;
};

/**
 * Create event object for Google Calendar API
 * @param {string} title - Event title
 * @param {Object} parsedDate - Chrono parsed date
 * @returns {Object} Google Calendar event object
 */
const createEventObject = (title, parsedDate) => {
  return {
    summary: title,
    start: {
      dateTime: parsedDate.start.date().toISOString(),
      timeZone: 'Asia/Dubai',
    },
    end: {
      dateTime: parsedDate.end 
        ? parsedDate.end.date().toISOString()
        : new Date(parsedDate.start.date().getTime() + 60 * 60 * 1000).toISOString(),
      timeZone: 'Asia/Dubai',
    },
  };
};

/**
 * Clean and extract search title from event text
 * @param {string} eventText - Text containing event details
 * @param {Array} parsedDate - Chrono parsed date results
 * @returns {string} Cleaned search title
 */
const extractSearchTitle = (eventText, parsedDate) => {
  let searchTitle = eventText.toLowerCase();
  
  if (parsedDate && parsedDate.length > 0) {
    parsedDate.forEach(date => {
      searchTitle = searchTitle.replace(date.text, '').trim();
    });
  }
  
  return searchTitle
    .replace(/\b(cancel|delete|remove)\b/gi, '')
    .trim();
};

/**
 * Find matching event by title
 * @param {Array} events - List of calendar events
 * @param {string} searchTitle - Title to search for
 * @returns {Object|null} Matching event or null
 */
const findMatchingEvent = (events, searchTitle) => {
  return events.find(event => 
    event.summary.toLowerCase().includes(searchTitle) ||
    searchTitle.includes(event.summary.toLowerCase())
  );
};

/**
 * Centralized error handler for API responses
 * @param {Error} error - The error object
 * @param {Object} res - Express response object
 * @param {string} customMessage - Optional custom error message
 */
const handleApiError = (error, res, customMessage = "Sorry, I couldn't process your request right now.") => {
  console.error('Calendar API Error:', error);
  return res.json({
    error: error.message,
    siriResponse: customMessage
  });
};
// ROUTES =============================================================================================================

// Root route
app.get('/', (req, res) => {
  res.send('Siri Calendar API is running');
});

// Authentication routes
app.get('/auth/google', (req, res) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/calendar']
  });

  res.redirect(authUrl);
});

// get tokens if expired
app.get('/auth/google/callback', async (req, res) => {
  try {
    const { tokens } = await oauth2Client.getToken(req.query.code);
    oauth2Client.setCredentials(tokens);
    console.log('New tokens:', tokens);
    
    res.send('Auth successful! Check console for tokens');
  } catch (error) {
    console.error('Auth Error:', error);
    res.status(500).send('Auth failed');
  }
});

// EVENT ROUTES =============================================================================================================

// today's events route
app.get("/api/today", async (req, res) => {
  try {
    const { timeMin, timeMax } = getDateRange();

    const response = await calendar.events.list({
      calendarId: "primary", 
      timeMin, 
      timeMax, 
      singleEvents: true,
      orderBy: "startTime",
    });

    const events = response.data.items;
    const siriResponse = buildEventListResponse(events, "today");

    res.json({ siriResponse });
  } catch (error) { 
    handleApiError(error, res, "Sorry, I couldn't access your calendar right now.");
  }
});

// create event route
app.post("/api/create", async (req, res) => {
  try {
    const { eventText } = req.body;
    
    if (!eventText) {
      return res.json({
        siriResponse: "Please provide event details."
      });
    }

    const parsedDate = chrono.parse(eventText);
    
    if (!parsedDate || parsedDate.length === 0) {
      return res.json({
        siriResponse: "I couldn't understand the date and time for this event."
      });
    }

    const eventTitle = extractEventTitle(eventText, parsedDate);
    const event = createEventObject(eventTitle, parsedDate[0]);

    const response = await calendar.events.insert({
      calendarId: 'primary',
      resource: event,
    });

    const eventTime = formatTime(event.start.dateTime);
    const eventDate = formatDate(event.start.dateTime);

    return res.json({
      siriResponse: `Added "${eventTitle}" to your calendar for ${eventDate} at ${eventTime}.`
    });

  } catch (error) {
    handleApiError(error, res, "Sorry, I couldn't create the event right now.");
  }
});

// query event route
app.post("/api/query", async (req, res) => {
  try {
    const { dateText } = req.body;
    
    if (!dateText) {
      return res.json({
        siriResponse: "Please specify which day you'd like to check."
      });
    }

    const parsedDate = chrono.parse(dateText);
    
    if (!parsedDate || parsedDate.length === 0) {
      return res.json({
        siriResponse: "I couldn't understand which date you meant."
      });
    }

    const targetDate = parsedDate[0].start.date();
    const { timeMin, timeMax } = getDateRange(targetDate);

    const response = await calendar.events.list({
      calendarId: "primary",
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: "startTime",
    });

    const events = response.data.items;
    const formattedDate = formatDate(targetDate);
    const siriResponse = buildEventListResponse(events, formattedDate);

    return res.json({ siriResponse });
  } catch (error) {
    handleApiError(error, res, "Sorry, I couldn't check your calendar right now.");
  }
});

// delete event route 
app.post("/api/delete", async (req, res) => {
  try {
    const { eventText } = req.body;
    
    if (!eventText) {
      return res.json({
        siriResponse: "Please specify which event you'd like to cancel."
      });
    }

    const parsedDate = chrono.parse(eventText);
    
    let targetDate;
    if (!parsedDate || parsedDate.length === 0) {
      targetDate = new Date();
    } else {
      targetDate = parsedDate[0].start.date();
    }

    const { timeMin, timeMax } = getDateRange(targetDate);
    const searchTitle = extractSearchTitle(eventText, parsedDate);

    const response = await calendar.events.list({
      calendarId: "primary",
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: "startTime",
    });

    const events = response.data.items;
    const matchingEvent = findMatchingEvent(events, searchTitle);

    if (!matchingEvent) {
      const formattedDate = formatDate(targetDate);
      return res.json({
        siriResponse: `I couldn't find an event matching "${searchTitle}" for ${formattedDate}.`
      });
    }

    await calendar.events.delete({
      calendarId: 'primary',
      eventId: matchingEvent.id
    });

    const eventTime = formatTime(matchingEvent.start.dateTime || matchingEvent.start.date);

    return res.json({
      siriResponse: `I've cancelled "${matchingEvent.summary}" at ${eventTime}.`
    });

  } catch (error) {
    handleApiError(error, res, "Sorry, I couldn't cancel the event right now.");
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled Error:', err);
  res.status(500).json({
    error: "Internal server error",
    siriResponse: "Sorry, something went wrong. Please try again later."
  });
});

app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));

module.exports = app;