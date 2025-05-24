/**
 * PassionPay YouTube Search API - Version 1.0
 * Fetches relevant "day in the life" videos based on user passions
 * Integrates with search results to show career insights
 */

import 'dotenv/config';
import { google } from 'googleapis';

/**
 * Corrects common typos in user queries
 * @param {string} query - Original user query
 * @returns {string} - Corrected query
 */
function fixTypos(query) {
  if (!query) return '';
  
  // Convert to lowercase for consistent processing
  let fixed = query.toLowerCase();
  
  // Common typo corrections
  const typoMap = {
    'wiht': 'with',
    'workign': 'working',
    'programing': 'programming',
    'develper': 'developer',
    'enginer': 'engineer',
    'finace': 'finance',
    'finacial': 'financial',
    'analyts': 'analyst',
    'analyist': 'analyst',
    'buisness': 'business',
    'markting': 'marketing',
    'managment': 'management',
    'desing': 'design',
    'helthcare': 'healthcare'
  };
  
  // Replace typos
  for (const [typo, correction] of Object.entries(typoMap)) {
    fixed = fixed.replace(new RegExp(typo, 'g'), correction);
  }
  
  return fixed;
}

/**
 * Maps user queries to standardized professional fields
 * @param {string} query - Normalized user query
 * @returns {string} - Professional field for video search
 */
function mapQueryToProfessionalField(query) {
  // Category mappings for better search results
  const categoryMap = {
    // Finance related terms
    'finance': 'financial analyst',
    'financial': 'financial analyst',
    'stock': 'stock trader',
    'stocks': 'stock trader',
    'investing': 'investment analyst',
    'investment': 'investment banker',
    'banking': 'banker',
    'trading': 'trader',
    'accounting': 'accountant',
    'numbers': 'financial analyst',
    'money': 'financial advisor',
    
    // Tech related terms
    'coding': 'software developer',
    'code': 'programmer',
    'programming': 'software developer',
    'software': 'software engineer',
    'web': 'web developer',
    'data': 'data scientist',
    'ai': 'AI engineer',
    'machine learning': 'machine learning engineer',
    
    // Healthcare related terms
    'healthcare': 'healthcare administrator',
    'medical': 'medical professional',
    'doctor': 'physician',
    'medicine': 'doctor',
    'nursing': 'nurse',
    'health': 'healthcare professional',
    
    // Business related terms
    'business': 'business professional',
    'marketing': 'marketing manager',
    'sales': 'sales professional',
    'management': 'manager',
    'leadership': 'executive',
    
    // Creative fields
    'design': 'designer',
    'art': 'artist',
    'creative': 'creative professional',
    'writing': 'writer',
    'content': 'content creator'
  };
  
  // Special cases for combined terms
  if ((query.includes('number') || query.includes('numbers')) && 
      (query.includes('stock') || query.includes('stocks'))) {
    return 'financial analyst';
  }
  
  // Check if any category keywords are in the query
  for (const [keyword, profession] of Object.entries(categoryMap)) {
    if (query.includes(keyword)) {
      return profession;
    }
  }
  
  // If no match, extract meaningful words (filter out common words)
  const commonWords = ['love', 'like', 'enjoy', 'want', 'with', 'and', 'the', 'for', 'that', 'have', 'this', 'work', 'working'];
  const words = query.split(' ');
  const meaningfulWords = words.filter(word => 
    word.length > 3 && !commonWords.includes(word)
  );
  
  if (meaningfulWords.length > 0) {
    return meaningfulWords.join(' ') + ' professional';
  }
  
  // Default fallback
  return query + ' professional';
}

// YouTube API configuration
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const youtube = google.youtube({
  version: 'v3',
  auth: YOUTUBE_API_KEY
});

// Career mapping for better YouTube results
const CAREER_KEYWORD_MAPPING = {
  // Finance and investment related keywords
  'finance': 'financial analyst',
  'investment': 'investment banker',
  'investing': 'investment analyst',
  'stock': 'stock trader',
  'stocks': 'stock trader',
  'trading': 'stock trader',
  'numbers': 'financial analyst',
  'accounting': 'accountant',
  'money': 'financial advisor',
  'banking': 'banker',
  'wealth': 'wealth manager',
  'fund': 'fund manager',
  'hedge': 'hedge fund analyst',
  
  // Technology related keywords
  'coding': 'software developer',
  'programming': 'programmer',
  'software': 'software engineer',
  'tech': 'technology professional',
  'data': 'data scientist',
  'ai': 'ai engineer',
  'machine learning': 'machine learning engineer',
  
  // Healthcare related keywords
  'medicine': 'doctor',
  'healthcare': 'healthcare professional',
  'medical': 'medical professional',
  'health': 'healthcare worker',
  'doctor': 'physician',
  'nurse': 'nursing professional',
  
  // Creative fields
  'design': 'designer',
  'art': 'artist',
  'writing': 'writer',
  'create': 'creative professional',
  'film': 'filmmaker',
  'video': 'videographer',
  'music': 'musician',
  
  // Business related
  'business': 'business professional',
  'marketing': 'marketing professional',
  'sales': 'sales professional',
  'entrepreneur': 'entrepreneur',
  'startup': 'startup founder'
};

/**
 * Analyzes a query to determine the most relevant career field
 * Works with misspelled and conversational queries
 * @param {string} query - User search query
 * @returns {string} - Professional field for YouTube search
 */
function determineCareerField(query) {
  // Clean up and normalize the query
  const normalizedQuery = query.toLowerCase()
    .replace(/wiht/g, 'with')  // Common typo
    .replace(/workign/g, 'working') // Common typo
    .replace(/\s+/g, ' ')
    .trim();
  
  // Special case for number-related careers
  if (
    (normalizedQuery.includes('number') && normalizedQuery.includes('stock')) ||
    (normalizedQuery.includes('numbers') && normalizedQuery.includes('stocks'))
  ) {
    return 'financial analyst';
  }
  
  // Check for finance-related terms
  if (
    normalizedQuery.includes('stocks') ||
    normalizedQuery.includes('finance') ||
    normalizedQuery.includes('investment') ||
    normalizedQuery.includes('financial') ||
    normalizedQuery.includes('trading') ||
    normalizedQuery.includes('money') ||
    normalizedQuery.includes('banking')
  ) {
    return 'financial analyst';
  }
  
  // Look for career keywords in the mapping
  for (const [keyword, profession] of Object.entries(CAREER_KEYWORD_MAPPING)) {
    if (normalizedQuery.includes(keyword)) {
      return profession;
    }
  }
  
  // If we couldn't determine a specific career, extract meaningful words
  const words = normalizedQuery.split(' ');
  const meaningfulWords = words.filter(word => 
    word.length > 3 && 
    !['love', 'like', 'want', 'with', 'and', 'the', 'for', 'that', 'have', 'this'].includes(word)
  );
  
  if (meaningfulWords.length > 0) {
    return meaningfulWords.join(' ');
  }
  
  // Default fallback
  return query;
}

// Handler for YouTube search
export default async function handler(req, res) {
  // Get the search query from the request
  const { query } = req.query;
  
  if (!query) {
    return res.status(400).send('Please provide a search query');
  }
  
  if (!YOUTUBE_API_KEY) {
    console.error('YouTube API key is not configured');
    return res.status(500).send('YouTube integration is not available');
  }

  try {
    // Clean up common typos and normalize the query
    const normalizedQuery = fixTypos(query);
    
    // Map the query to a relevant professional field
    const professionalField = mapQueryToProfessionalField(normalizedQuery);
    
    // Construct a standardized search query
    const searchQuery = `day in the life of ${professionalField}`;
    
    console.log(`Searching YouTube for: "${searchQuery}"`);
    
    // Search for videos
    const searchResponse = await youtube.search.list({
      part: 'snippet',
      q: searchQuery,
      type: 'video',
      maxResults: 5,
      videoEmbeddable: 'true',
      relevanceLanguage: 'en',
      safeSearch: 'moderate'
    });
    
    // If no videos found
    if (!searchResponse.data.items || searchResponse.data.items.length === 0) {
      console.log('No videos found');
      return res.status(404).send('No relevant videos found');
    }
    
    // Get video IDs to fetch duration
    const videoIds = searchResponse.data.items.map(item => item.id.videoId);
    
    // Get video details to check duration
    const videoResponse = await youtube.videos.list({
      part: 'contentDetails,statistics,snippet',
      id: videoIds.join(',')
    });
    
    // Filter videos by duration (roughly 3-8 minutes)
    const videos = videoResponse.data.items.filter(video => {
      const duration = video.contentDetails.duration;
      // Parse ISO 8601 duration format (PT#M#S)
      const match = duration.match(/PT(\d+)M(\d+)S/);
      if (!match) return false;
      
      const minutes = parseInt(match[1], 10);
      return minutes >= 3 && minutes <= 8; // Videos between 3-8 minutes
    });
    
    // If no videos of appropriate length
    if (videos.length === 0) {
      // Just use the first video regardless of length
      videos.push(videoResponse.data.items[0]);
    }
    
    // Get the best video (first one after filtering)
    const bestVideo = videos[0];
    
    // Return the video information
    const videoInfo = {
      id: bestVideo.id,
      title: bestVideo.snippet.title,
      description: bestVideo.snippet.description,
      thumbnail: bestVideo.snippet.thumbnails.high.url,
      channelTitle: bestVideo.snippet.channelTitle,
      viewCount: bestVideo.statistics.viewCount,
      embedHtml: `<iframe width="100%" height="225" src="https://www.youtube.com/embed/${bestVideo.id}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`
    };
    
    // Return a nice HTML snippet
    const html = `
      <div class="mt-6 bg-white rounded-md shadow-md overflow-hidden">
        <div class="p-4 bg-blue-50 border-b border-blue-100">
          <h3 class="text-lg font-semibold text-blue-700">Day in the Life: ${query}</h3>
          <p class="text-sm text-gray-600">Watch this video to see what it's like to work in this field</p>
        </div>
        <div class="video-container aspect-w-16 aspect-h-9">
          ${videoInfo.embedHtml}
        </div>
        <div class="p-4">
          <h4 class="font-medium text-gray-800">${videoInfo.title}</h4>
          <p class="text-xs text-gray-500 mt-1">Channel: ${videoInfo.channelTitle} • ${Number(videoInfo.viewCount).toLocaleString()} views</p>
        </div>
      </div>
    `;
    
    res.setHeader('Content-Type', 'text/html');
    res.status(200).send(html);
    
  } catch (error) {
    console.error('YouTube API error:', error);
    res.status(500).send(`Error searching YouTube: ${error.message}`);
  }
}
