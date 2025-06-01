/**
 * PassionPay Search API - Clean Version
 * Semantic job search using job description embeddings
 */

import 'dotenv/config';
import aiplatform, { helpers } from '@google-cloud/aiplatform';
import { MongoClient } from 'mongodb';

// GCP Credentials setup for Vercel
if (process.env.GOOGLE_CREDENTIALS) {
  try {
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON = JSON.stringify(credentials);
    
    if (!process.env.GCP_PROJECT_ID && credentials.project_id) {
      process.env.GCP_PROJECT_ID = credentials.project_id;
    }
    
    console.log('Using GCP credentials from environment variable');
  } catch (error) {
    console.error('Error parsing GOOGLE_CREDENTIALS:', error.message);
  }
}

const { PredictionServiceClient } = aiplatform.v1;

// Configuration 
const PROJECT_ID = process.env.GCP_PROJECT_ID;
const LOCATION = process.env.GCP_LOCATION || 'us-central1';
const PUBLISHER = 'google';
const MODEL_ID = process.env.GCP_EMBEDDING_MODEL || 'textembedding-gecko';

// MongoDB Configuration
const MONGODB_URI = process.env.MONGODB_URI;
const MONGO_DATABASE_NAME = 'passion_pay_db';
const COLLECTION_NAME = 'all_jobs';
const VECTOR_INDEX_NAME = 'default';
const EMBEDDING_FIELD_NAME = 'job_description_embedding';

const MIN_RELEVANCE_SCORE = 0.70;

// Initialize Vertex AI client
let predictionServiceClient;
try {
  if (PROJECT_ID) {
    const clientOptions = {
      apiEndpoint: `${LOCATION}-aiplatform.googleapis.com`
    };
    
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
      try {
        clientOptions.credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
        console.log('Using credentials from environment variable');
      } catch (credError) {
        console.error('Error parsing credentials JSON:', credError);
      }
    }
    
    predictionServiceClient = new PredictionServiceClient(clientOptions);
    console.log('PredictionServiceClient initialized globally with project:', PROJECT_ID);
  } else {
    console.error('GCP_PROJECT_ID environment variable is not set.');
  }
} catch (error) {
  console.error('Error initializing PredictionServiceClient:', error);
}

// MongoDB connection
async function connectToMongoDB() {
  try {
    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    console.log('Connected to MongoDB Atlas');
    const db = client.db(MONGO_DATABASE_NAME);
    return { client, db };
  } catch (error) {
    console.error('MongoDB connection error:', error);
    throw error;
  }
}

// Generate embeddings from Vertex AI
async function getEmbedding(textToEmbed) {
  if (!textToEmbed || textToEmbed.trim() === '') {
    console.error('getEmbedding: No text provided to embed.');
    return null;
  }

  try {
    const endpoint = `projects/${PROJECT_ID}/locations/${LOCATION}/publishers/${PUBLISHER}/models/${MODEL_ID}`;
    
    const instances = [
      helpers.toValue({
        content: textToEmbed,
        task_type: "RETRIEVAL_QUERY"
      }),
    ];
    
    const parameters = helpers.toValue({
      autoTruncate: true
    });
    
    const request = { endpoint, instances, parameters };

    console.log('Sending embedding request to Vertex AI...');
    const [response] = await predictionServiceClient.predict(request);
    console.log('Got response from Vertex AI');
    
    if (response && response.predictions && response.predictions.length > 0) {
      const prediction = helpers.fromValue(response.predictions[0]);
      
      // Find embedding array in response
      const findEmbedding = (obj) => {
        if (!obj || typeof obj !== 'object') return null;
        for (const key in obj) {
          if (Array.isArray(obj[key]) && obj[key].length >= 768) {
            console.log(`Found potential embedding array in field '${key}' with ${obj[key].length} elements`);
            return obj[key];
          } else if (typeof obj[key] === 'object') {
            const result = findEmbedding(obj[key]);
            if (result) return result;
          }
        }
        return null;
      };
      
      const embeddingArray = findEmbedding(prediction);
      if (embeddingArray) {
        return embeddingArray.map(v => Number(v));
      }
    }

    console.error('No valid embeddings found in response');
    return null;
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw error;
  }
}

// Perform vector search in MongoDB
async function performVectorSearch(embeddingVector, filters = {}, limit = 20) {
  try {
    if (!embeddingVector || !Array.isArray(embeddingVector)) {
      console.error('Invalid embedding vector:', embeddingVector);
      throw new Error('Invalid embedding vector format');
    }
    
    const numericVector = embeddingVector.map(v => Number(v));
    console.log(`Vector search using ${numericVector.length} dimensions on ${COLLECTION_NAME}.${VECTOR_INDEX_NAME}`);
    
    const { db } = await connectToMongoDB();
    const collection = db.collection(COLLECTION_NAME);

    // Build pipeline
    const pipeline = [
      {
        $vectorSearch: {
          index: VECTOR_INDEX_NAME,
          path: EMBEDDING_FIELD_NAME,
          queryVector: numericVector,
          numCandidates: 150,
          limit: limit,
        },
      }
    ];

    // Add filters if provided
    if (Object.keys(filters).length > 0) {
      const filterStage = { $match: {} };
      
      if (filters.remote !== undefined) {
        const remoteValue = filters.remote === 'true' || filters.remote === true;
        filterStage.$match.remote = remoteValue;
      }
      
      if (filters.minSalary) {
        const minSalaryValue = parseInt(filters.minSalary, 10);
        const salaryFilter = {
          $or: [
            { salary_min: { $gte: minSalaryValue } },
            { salary_max: { $gte: minSalaryValue } },
            { salary_median: { $gte: minSalaryValue } },
            { salary_in_usd: { $gte: minSalaryValue } }
          ]
        };
        filterStage.$match = { ...filterStage.$match, ...salaryFilter };
      }
      
      if (Object.keys(filterStage.$match).length > 0) {
        pipeline.push(filterStage);
      }
    }
    
    // Project fields
    pipeline.push({
      $project: {
        _id: 0,
        score: { $meta: 'vectorSearchScore' },
        job_id: 1,
        job_title: 1,
        company_name: 1,
        location: 1,
        salary_in_usd: 1,
        salary_min: 1,
        salary_median: 1,
        salary_max: 1,
        salary_currency: 1,
        experience_level: 1,
        work_type: 1,
        remote: 1,
        job_description: 1,
      }
    });
    
    pipeline.push({ $limit: limit });

    const searchResults = await collection.aggregate(pipeline).toArray();
    return searchResults;
  } catch (error) {
    console.error('MongoDB vector search error:', error);
    throw error;
  }
}

// Format results as HTML
function formatResults(results) {
  if (!results || results.length === 0) {
    return '<p class="text-gray-500">No matching jobs found. Try refining your search.</p>';
  }

  let html = '<ul class="space-y-4">';
  
  results.forEach(result => {
    const company = result.company_name || 'N/A';
    const location = result.location || 'N/A';
    const remote = result.remote ? '<span class="text-xs text-green-600">(Remote)</span>' : '';
    
    // Format salary
    let salaryDisplay = 'N/A';
    if (result.salary_min && result.salary_max) {
      salaryDisplay = `$${Math.round(result.salary_min/1000)}k - $${Math.round(result.salary_max/1000)}k`;
    } else if (result.salary_min) {
      salaryDisplay = `$${Math.round(result.salary_min/1000)}k+`;
    } else if (result.salary_median) {
      salaryDisplay = `$${Math.round(result.salary_median/1000)}k (Median)`;
    } else if (result.salary_in_usd) {
      const salaryValue = typeof result.salary_in_usd === 'string' ? 
        parseFloat(result.salary_in_usd.replace(/[^\d.-]/g, '')) : 
        result.salary_in_usd;
      salaryDisplay = `$${Math.round(salaryValue/1000)}k`;
    }

    const experience = result.experience_level || 'N/A';
    const workType = result.work_type || 'N/A';
    const score = result.score ? result.score.toFixed(4) : 'N/A';
    
    // Job description
    const descriptionText = result.job_description || '';
    const previewLength = 150;
    const descriptionPreview = descriptionText.length > 0 ? descriptionText.substring(0, previewLength) : '';
    
    html += `
      <li>
        <div class="flex flex-col space-y-2">
          <div class="bg-white rounded-md shadow-sm p-4 border border-gray-200">
            <div class="flex justify-between">
              <h3 class="text-lg font-semibold text-blue-600">${result.job_title || 'N/A'}</h3>
            </div>
            
            ${descriptionPreview ? `
            <div class="my-2 bg-gray-50 p-2 rounded">
              <div id="preview-${result.job_id}">
                <p class="text-sm text-gray-700">${descriptionPreview.replace(/</g, '&lt;').replace(/>/g, '&gt;')}${descriptionText.length > previewLength ? '...' : ''}</p>
                ${descriptionText.length > previewLength ? 
                  `<button 
                    class="text-xs text-blue-500 hover:underline mt-1"
                    onclick="document.getElementById('preview-${result.job_id}').style.display='none'; document.getElementById('full-${result.job_id}').style.display='block';"
                  >
                    Read more
                  </button>` : 
                  ''
                }
              </div>
              
              <div id="full-${result.job_id}" style="display:none;">
                <p class="text-sm text-gray-700">${descriptionText.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
                <button 
                  class="text-xs text-blue-500 hover:underline mt-1"
                  onclick="document.getElementById('preview-${result.job_id}').style.display='block'; document.getElementById('full-${result.job_id}').style.display='none';"
                >
                  Read less
                </button>
              </div>
            </div>
            ` : ''}
            
            <p class="text-sm text-gray-500 mb-2">${company} • ${location} ${remote}</p>
            <div class="flex flex-wrap gap-2 mb-2">
              <span class="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">${salaryDisplay}</span>
              <span class="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-800">${experience}</span>
              ${workType !== 'N/A' ? `<span class="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-800">${workType}</span>` : ''}
            </div>
            <p class="text-xs text-gray-400 mt-2">Match Score: ${score}</p>
          </div>
        </div>
      </li>
    `;
  });
  
  html += '</ul>';
  return html;
}

// Generate EdX course recommendations
function generateEdXPlaceholder(query) {
  try {
    if (!query || typeof query !== 'string' || query.trim() === '') {
      return '';
    }
    
    const keywords = query.toLowerCase()
      .replace(/and/g, ' ')
      .split(' ')
      .filter(word => word.length > 2)
      .slice(0, 3)
      .join(' ');
    
    const isFinanceQuery = keywords.includes('stock') || 
                          keywords.includes('financ') || 
                          keywords.includes('invest') || 
                          keywords.includes('trading') || 
                          keywords.includes('money') || 
                          keywords.includes('accounting');
    
    if (isFinanceQuery) {
      return generateDirectCourseHTML(query, {
        title: 'Finance for Everyone: Smart Tools for Decision-Making',
        provider: 'University of Michigan',
        type: 'Course',
        description: 'Learn how to think clearly about important financial decisions and improve your financial literacy.',
        startDate: 'Self-paced'
      });
    }
    
    const isTechQuery = keywords.includes('software') || 
                       keywords.includes('develop') || 
                       keywords.includes('code') || 
                       keywords.includes('program') || 
                       keywords.includes('tech') || 
                       keywords.includes('computer');
    
    if (isTechQuery) {
      return generateDirectCourseHTML(query, {
        title: 'Computer Science Essentials for Software Development',
        provider: 'University of Pennsylvania',
        type: 'Professional Certificate Program',
        description: 'Learn the essential components of software development, including algorithms, data structures, and object-oriented design.',
        startDate: 'Self-paced'
      });
    }
    
    return generateDirectCourseHTML(query, {
      title: 'Data Science and Analytics Essentials',
      provider: 'IBM',
      type: 'Professional Certificate',
      description: 'Learn fundamental data science and analytics skills applicable to many career paths and industries.',
      startDate: 'Self-paced'
    });
  } catch (error) {
    console.error('Error generating EdX placeholder:', error);
    return '';
  }
}

function generateDirectCourseHTML(query, course) {
  return `
    <div class="h-full bg-white rounded-md shadow-md overflow-hidden">
      <div class="p-3 bg-indigo-50 border-b border-indigo-100">
        <h3 class="text-md font-semibold text-indigo-700">Recommended Courses: ${query}</h3>
        <p class="text-xs text-gray-600">Build skills for this career with professional certificates</p>
      </div>
      
      <div class="edx-course bg-white border-gray-200 overflow-hidden">
        <div class="p-3 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
          <div>
            <span class="text-xs font-medium px-2 py-1 rounded-full ${course.type.toLowerCase().includes('program') ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}">${course.type}</span>
            <span class="text-xs text-gray-500 ml-2">${course.provider}</span>
          </div>
        </div>
        <div class="p-3 min-h-[170px] flex flex-col justify-between">
          <div>
            <h3 class="font-medium text-gray-900 mb-1">${course.title}</h3>
            <p class="text-xs text-gray-600 mb-2">${course.description}</p>
          </div>
          <div class="mt-2 flex justify-between items-center">
            <span class="text-xs text-gray-500">Format: Self-paced</span>
            <a href="https://www.edx.org/search?q=${encodeURIComponent(course.title)}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center px-3 py-1 border border-indigo-300 text-xs leading-4 font-medium rounded-md text-indigo-700 bg-indigo-50 hover:bg-indigo-100">
              Find on EdX
              <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>
        </div>
      </div>
    </div>
  `;
}

// Generate YouTube video placeholder
function generateYouTubePlaceholder(query) {
  try {
    if (!query || typeof query !== 'string' || query.trim() === '') {
      return '';
    }
    
    const keywords = query.toLowerCase()
      .replace(/and/g, ' ')
      .split(' ')
      .filter(word => word.length > 2)
      .slice(0, 3)
      .join(' ');
    
    return `
      <div class="h-full bg-white rounded-md shadow-md overflow-hidden">
        <div class="p-3 bg-indigo-50 border-b border-indigo-100">
          <h3 class="text-md font-semibold text-indigo-700">Day in the Life: ${query}</h3>
          <p class="text-xs text-gray-600">Watch this video to see what it's like to work in this field</p>
        </div>
        <div id="youtube-video-container" class="p-2 flex-grow" 
             hx-get="/api/youtube-search?query=${encodeURIComponent(keywords)}" 
             hx-trigger="load"
             hx-indicator=".htmx-indicator">
          <div class="flex items-center justify-center p-4 min-h-[250px]">
            <div class="htmx-indicator">
              <svg class="animate-spin h-6 w-6 text-indigo-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <p class="mt-2 text-xs text-gray-500">Loading video...</p>
            </div>
          </div>
        </div>
      </div>
    `;
  } catch (error) {
    console.error('Error generating YouTube placeholder:', error);
    return '';
  }
}

// Main handler function
export default async function handler(req, res) {
  console.log("Search endpoint hit:", req.query);

  if (!predictionServiceClient) {
    console.error('Vertex AI client not initialized');
    return res.status(500).send('Server error: AI service unavailable');
  }

  const { query, remote, minSalary } = req.query;

  if (!query) {
    return res.status(400).send('Please provide a search query');
  }

  try {
    console.log(`Getting embedding for: "${query}"`);
    const embeddingVector = await getEmbedding(query);
    
    if (!embeddingVector || embeddingVector.length === 0) {
      return res.status(500).send(formatResults([]));
    }

    // Build filters
    const queryFilters = {};
    if (remote !== undefined) queryFilters.remote = remote;
    if (minSalary) queryFilters.minSalary = minSalary;
    
    console.log('Searching all jobs');
    const results = await performVectorSearch(embeddingVector, queryFilters, 20);
    
    // Filter by relevance score
    const finalResults = results.filter(r => r.score && r.score >= MIN_RELEVANCE_SCORE);
    
    // Sort by combined score (relevance + salary)
    finalResults.sort((a, b) => {
      const getSalary = (item) => {
        return item.salary_max || item.salary_median || item.salary_min || 
               (item.salary_in_usd ? parseFloat(item.salary_in_usd) : 0);
      };
      
      const salaryA = getSalary(a);
      const salaryB = getSalary(b);
      const maxSalary = Math.max(...finalResults.map(item => getSalary(item)));
      const normalizedSalaryA = maxSalary > 0 ? salaryA / maxSalary : 0;
      const normalizedSalaryB = maxSalary > 0 ? salaryB / maxSalary : 0;
      
      // Combined score: relevance (60%) + salary (40%)
      const scoreA = (a.score || 0) * 0.6 + normalizedSalaryA * 0.4;
      const scoreB = (b.score || 0) * 0.6 + normalizedSalaryB * 0.4;
      
      return scoreB - scoreA;
    });
    
    // Generate YouTube and EdX content
    let youtubeHtml = '';
    let edxHtml = '';
    
    if (finalResults.length > 0) {
      try {
        const topJobTitle = finalResults[0].job_title || '';
        const videoSearchTerm = topJobTitle ? topJobTitle : query;
        youtubeHtml = generateYouTubePlaceholder(videoSearchTerm);
        edxHtml = generateEdXPlaceholder(query);
      } catch (error) {
        console.error('Error generating content:', error);
      }
    }
    
    // Create two-column layout
    const twoColumnLayout = `
      <div class="flex flex-col md:flex-row gap-4 mb-6 max-w-6xl mx-auto">
        <div class="w-full md:w-1/2">
          ${youtubeHtml}
        </div>
        <div class="w-full md:w-1/2">
          ${edxHtml}
        </div>
      </div>
    `;
    
    const queryInput = `<input type="hidden" name="current-query" value="${query}">`;
    const htmlResponse = queryInput + twoColumnLayout + formatResults(finalResults);
    
    res.setHeader('Content-Type', 'text/html');
    res.status(200).send(htmlResponse);
  } 
  catch (error) {
    console.error('Search error:', error);
    res.status(500).send(`<div class="p-4 bg-red-50 border border-red-300 rounded-md">
      <h3 class="text-red-700 font-semibold">Error</h3>
      <p class="text-red-600">Search error: ${error.message}</p>
    </div>`);
  }
}