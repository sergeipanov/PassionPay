/**
 * PassionPay YouTube Search API - Version 1.0
 * Fetches relevant "day in the life" videos based on user passions
 * Integrates with search results to show career insights
 */

import 'dotenv/config';
import { google } from 'googleapis';

// YouTube API configuration
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const youtube = google.youtube({
  version: 'v3',
  auth: YOUTUBE_API_KEY
});

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
    // Construct a search query based on the user's passion
    const searchQuery = `day in the life of ${query} professional`;
    
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
