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
  
  // First look for data + tech/problem combinations as a special case
  if ((query.includes('data') || query.includes('analytics')) && 
      (query.includes('tech') || query.includes('problem') || query.includes('solve'))) {
    return 'data scientist';
  }

  // Next, look for multiple tech-related keywords
  const techTerms = ['coding', 'code', 'programming', 'software', 'web', 'data', 'ai', 'tech', 'computer', 'algorithm'];
  const techCount = techTerms.filter(term => query.includes(term)).length;
  if (techCount >= 2) {
    return 'software engineer';
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
    
    // Check if the query is already a job title (passed from search.js)
    let searchQuery;
    const jobTitlePattern = /^(senior |junior |lead |chief |principal |staff )?(data scientist|software engineer|developer|analyst|manager|designer|engineer|consultant|architect|specialist|administrator|technician)s?$/i;
    
    if (jobTitlePattern.test(normalizedQuery)) {
      // If the query is already a job title, use it directly
      searchQuery = `day in the life of a ${normalizedQuery} tech company`;
      console.log('Using job title directly for search:', normalizedQuery);
    } else {
      // Otherwise map the query to a professional field
      const professionalField = mapQueryToProfessionalField(normalizedQuery);
      
      // Construct a more specific search query based on the professional field
      if (professionalField === 'data scientist' || normalizedQuery.includes('data scientist')) {
        searchQuery = 'day in the life of a data scientist tech company';
      } else if (professionalField.includes('software') || professionalField.includes('developer') || professionalField.includes('programmer')) {
        searchQuery = 'day in the life of a software engineer tech company';
      } else if (professionalField.includes('analyst')) {
        searchQuery = 'day in the life of a business analyst tech';
      } else {
        // Default query format
        searchQuery = `day in the life of ${professionalField}`;
      }
    }
    
    console.log(`Searching YouTube for: "${searchQuery}"`);
    
    // Add keywords to exclude irrelevant videos
    const blockedTerms = ['-tree', '-gardening', '-landscaping', '-fake', '-workout', '-gym', '-comedy', '-prank'];
    const enhancedQuery = searchQuery + ' ' + blockedTerms.join(' ');
    
    console.log(`Enhanced YouTube query: ${enhancedQuery}`);
    
    // Search for videos with additional parameters for better quality results
    const searchResponse = await youtube.search.list({
      part: 'snippet',
      q: enhancedQuery,
      type: 'video',
      maxResults: 15,  // Increased to have more candidates to filter from
      videoEmbeddable: 'true',
      relevanceLanguage: 'en',
      safeSearch: 'moderate',
      order: 'relevance'       // Order by relevance
    });
    
    // If no videos found
    if (!searchResponse.data.items || searchResponse.data.items.length === 0) {
      console.log('No videos found');
      return res.status(404).send('No relevant videos found');
    }
    
    // Get video IDs from search results
    const videoIds = searchResponse.data.items.map(item => item.id.videoId);
    
    if (videoIds.length === 0) {
      return res.status(404).send('No videos found');
    }
    
    // Create a list of relevant keywords based on the job query to filter results
    const relevantKeywords = [];
    
    if (normalizedQuery.includes('data') || searchQuery.includes('data scientist')) {
      relevantKeywords.push('data', 'scientist', 'analytics', 'analysis');
    } else if (normalizedQuery.includes('software') || normalizedQuery.includes('developer') || searchQuery.includes('software engineer')) {
      relevantKeywords.push('software', 'developer', 'engineer', 'coding', 'programming');
    } else if (normalizedQuery.includes('analyst')) {
      relevantKeywords.push('analyst', 'analysis', 'business');
    }
    
    console.log('Filtering videos with relevant keywords:', relevantKeywords);
    
    // Get video details to check duration
    const videoResponse = await youtube.videos.list({
      part: 'contentDetails,statistics,snippet',
      id: videoIds.join(',')
    });
    
    // Score and filter videos by relevance, title keywords, and duration
    const videos = videoResponse.data.items.map(video => {
      // Base score
      let score = 0;
      
      // Score based on title and description relevance
      const title = video.snippet.title.toLowerCase();
      const description = video.snippet.description.toLowerCase();
      
      // Check for relevant keywords
      if (relevantKeywords.length > 0) {
        relevantKeywords.forEach(keyword => {
          if (title.includes(keyword)) score += 5;
          if (description.includes(keyword)) score += 2;
        });
      }
      
      // Check for specific job-related phrases
      if (title.includes('day in the life')) score += 10;
      if (title.includes('career') || title.includes('job')) score += 5;
      
      // Check for educational content
      if (title.includes('how to become') || title.includes('tutorial')) score += 3;
      
      // Check for unwanted content (reduce score)
      const unwantedTerms = ['prank', 'funny', 'fake', 'joke', 'gardening', 'tree', 'gym'];
      unwantedTerms.forEach(term => {
        if (title.includes(term)) score -= 15;
      });
      
      // Parse duration (prefer 3-8 minute videos)
      const duration = video.contentDetails.duration;
      const match = duration.match(/PT(\d+)M(\d+)?S?/);
      if (match) {
        const minutes = parseInt(match[1], 10);
        if (minutes >= 3 && minutes <= 8) score += 5;
      }
      
      return { video, score };
    })
    .sort((a, b) => b.score - a.score) // Sort by score (descending)
    .map(item => item.video);
    
    // If no videos after filtering
    if (videos.length === 0) {
      // Just use the first video from the original response
      videos.push(videoResponse.data.items[0]);
    }
    
    console.log(`Selected video score: ${videos[0].snippet.title}`);
    
    // Get the best video (highest score after filtering)
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
    
    // Return just the video content without the outer container
    const html = `
      <div class="video-container aspect-w-16 aspect-h-9">
        ${videoInfo.embedHtml}
      </div>
      <div class="p-4">
        <h4 class="font-medium text-gray-800">${videoInfo.title}</h4>
        <p class="text-xs text-gray-500 mt-1">Channel: ${videoInfo.channelTitle} • ${Number(videoInfo.viewCount).toLocaleString()} views</p>
      </div>
    `;
    
    res.setHeader('Content-Type', 'text/html');
    res.status(200).send(html);
    
  } catch (error) {
    console.error('YouTube API error:', error);
    res.status(500).send(`Error searching YouTube: ${error.message}`);
  }
}
