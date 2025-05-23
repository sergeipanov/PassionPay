/**
 * PassionPay Search API - Version 1.4
 * Enhanced with EdX course recommendations and YouTube video integration
 * Features:
 * - Dual search strategy (LinkedIn jobs via description embeddings, Tech jobs via title embeddings)
 * - Combined results with relevance filtering
 * - Source filtering (LinkedIn, Tech, All)
 * - Dynamic job description generation and display
 * - Client-side Read more/less toggle for descriptions
 */

import 'dotenv/config';
import aiplatform, { helpers } from '@google-cloud/aiplatform';
import { MongoClient } from 'mongodb';
import fs from 'fs';

// If running on Vercel, use the environment variable directly
if (process.env.GOOGLE_CREDENTIALS) {
  try {
    // For Vercel, we need to parse the credentials JSON string
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    
    // Instead of writing to a file, directly set the credentials
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON = JSON.stringify(credentials);
    
    // Set project ID from credentials if not explicitly set
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

// Collection names and indexes
const TECH_JOBS_COLLECTION_NAME = 'job_salaries';
const LINKEDIN_JOBS_COLLECTION_NAME = 'all_jobs';

// Indexes and embedding fields
const TECH_JOBS_VECTOR_INDEX_NAME = 'job_title_vector_index'; 
const TECH_JOBS_EMBEDDING_FIELD_NAME = 'job_title_embedding';
const LINKEDIN_JOBS_VECTOR_INDEX_NAME = 'job_description_vector_index';
const LINKEDIN_JOBS_EMBEDDING_FIELD_NAME = 'job_description_embedding';

const MIN_RELEVANCE_SCORE = 0.70;

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

// Global instance of Vertex AI client
let predictionServiceClient;
try {
  if (PROJECT_ID) {
    // Client options for authentication
    const clientOptions = {
      apiEndpoint: `${LOCATION}-aiplatform.googleapis.com`
    };
    
    // Add credentials if available in environment
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

// Generate embeddings from Vertex AI
async function getEmbedding(textToEmbed) {
  if (!textToEmbed || textToEmbed.trim() === '') {
    console.error('getEmbedding: No text provided to embed.');
    return null;
  }

  try {
    const endpoint = `projects/${PROJECT_ID}/locations/${LOCATION}/publishers/${PUBLISHER}/models/${MODEL_ID}`;
    
    // Prepare the request - this format was previously proven to work
    const instances = [
      helpers.toValue({
        content: textToEmbed,
        task_type: "RETRIEVAL_DOCUMENT"
      }),
    ];
    
    const parameters = helpers.toValue({
      autoTruncate: true
    });
    
    const request = {
      endpoint,
      instances,
      parameters
    };

    console.log('Sending embedding request to Vertex AI...');
    const [response] = await predictionServiceClient.predict(request);
    console.log('Got response from Vertex AI');
    
    // Extract embeddings from response
    if (response && response.predictions && response.predictions.length > 0) {
      // Debug the exact response structure
      console.log('Response structure:', JSON.stringify(response.predictions[0]).substring(0, 100) + '...');
      
      const prediction = helpers.fromValue(response.predictions[0]);
      console.log('Prediction type:', typeof prediction);
      
      // For text-embedding-005 model, the structure should be { embeddings: [...] }
      if (prediction && typeof prediction === 'object') {
        // Debug available properties
        console.log('Prediction keys:', Object.keys(prediction));
        
        if (prediction.embeddings && Array.isArray(prediction.embeddings)) {
          console.log(`Found embeddings array with ${prediction.embeddings.length} dimensions`);
          const numericEmbeddings = prediction.embeddings.map(v => Number(v));
          return numericEmbeddings;
        } else if (prediction.embedding && Array.isArray(prediction.embedding)) {
          // Alternative field name some models use
          console.log(`Found embedding array with ${prediction.embedding.length} dimensions`);
          const numericEmbeddings = prediction.embedding.map(v => Number(v));
          return numericEmbeddings;
        } else if (prediction.values && Array.isArray(prediction.values)) {
          // Another possible field name
          console.log(`Found values array with ${prediction.values.length} dimensions`);
          const numericEmbeddings = prediction.values.map(v => Number(v));
          return numericEmbeddings;
        }
      }
      
      // If we can't find a standard path, try to find any array with 768 elements (typical embedding size)
      console.log('Trying to locate embedding array in response...');
      const findEmbedding = (obj) => {
        if (!obj || typeof obj !== 'object') return null;
        for (const key in obj) {
          if (Array.isArray(obj[key]) && obj[key].length > 100) {
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
        const numericEmbeddings = embeddingArray.map(v => Number(v));
        return numericEmbeddings;
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
async function performVectorSearch(
  embeddingVector,
  collectionName,
  indexName,
  embeddingFieldName,
  filters = {},
  numCandidates = 150,
  limit = 20
) {
  try {
    if (!embeddingVector || !Array.isArray(embeddingVector)) {
      console.error('Invalid embedding vector:', embeddingVector);
      throw new Error('Invalid embedding vector format');
    }
    
    // Ensure all elements are numbers
    const numericVector = embeddingVector.map(v => Number(v));
    console.log(`Vector search using ${numericVector.length} dimensions on ${collectionName}.${indexName}`);
    
    const { db } = await connectToMongoDB();
    const collection = db.collection(collectionName);

    // Build pipeline
    const pipeline = [
      {
        $vectorSearch: {
          index: indexName,
          path: embeddingFieldName,
          queryVector: numericVector,
          numCandidates: numCandidates,
          limit: limit,
        },
      }
    ];

    // Add filters if provided
    if (Object.keys(filters).length > 0) {
      const filterStage = { $match: {} };
      
      if (filters.source) {
        filterStage.$match.source = filters.source;
      }
      
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
    
    // For debugging, don't limit fields - get everything to see what's available
    pipeline.push({
      $project: {
        _id: 0,
        // Include the score
        score: { $meta: 'vectorSearchScore' },
        // Include all other fields
        job_id: 1,
        job_title: 1,
        company_name: 1,
        location: 1,
        salary_in_usd: 1,
        normalized_salary: 1,
        salary_min: 1,
        salary_median: 1,
        salary_max: 1,
        salary_currency: 1,
        salary_period: 1,
        experience_level: 1,
        company_location: 1,
        work_type: 1,
        remote: 1,
        source: 1,
        // Get the full description if available
        job_description: 1,
        description: 1,
        jobDescription: 1,
        // Also compute a preview (for direct use)
        job_description_preview: { $substr: [{ $ifNull: ["$job_description", ""] }, 0, 200] },
        description_preview: { $substr: [{ $ifNull: ["$description", ""] }, 0, 200] },
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
    
    // No source tag needed
    const sourceTag = '';

    // Debug: Log the full job object to see all available fields
    console.log(`Job ${result.job_id}: ${result.job_title} - Available fields:`, Object.keys(result));
    console.log(`Description preview: ${result.job_description_preview || 'N/A'}`);
    
    // Try to find any field that might contain a description
    const possibleDescriptionFields = ['job_description', 'description', 'job_desc', 'desc', 'responsibilities', 'details'];
    let descriptionField = null;
    for (const field of possibleDescriptionFields) {
      if (result[field] && typeof result[field] === 'string' && result[field].length > 10) {
        console.log(`Found potential description in field: ${field}`);
        descriptionField = field;
        break;
      }
    }
    
    // Since we discovered job descriptions aren't stored in the database,
    // let's generate a basic description based on the job title
    let descriptionText = '';
    
    // Check if any description field exists in the database
    if (result.job_description && typeof result.job_description === 'string') {
      descriptionText = result.job_description;
    } else if (result.description && typeof result.description === 'string') {
      descriptionText = result.description;
    } else if (result.jobDescription && typeof result.jobDescription === 'string') {
      descriptionText = result.jobDescription;
    } else if (descriptionField) {
      descriptionText = result[descriptionField];
    } else {
      // If no description exists, generate one based on the job title and company
      const jobTitle = result.job_title || '';
      const company = result.company_name || 'The company';
      const location = result.location || 'this location';
      
      // Generate a basic job description
      descriptionText = `${company} is looking for a ${jobTitle} to join our team in ${location}. `;
      
      // Add more context based on job title keywords
      if (jobTitle.toLowerCase().includes('data')) {
        descriptionText += 'In this role, you will analyze and interpret complex data sets, develop statistical models, ' +
          'and provide insights to drive business decisions. Strong analytical skills and experience with ' +
          'data visualization tools are required.';
      } else if (jobTitle.toLowerCase().includes('scientist')) {
        descriptionText += 'You will apply scientific methods and algorithms to solve complex problems, ' +
          'conduct experiments, and develop innovative solutions. A strong background in research ' +
          'and scientific principles is essential.';
      } else if (jobTitle.toLowerCase().includes('engineer')) {
        descriptionText += 'You will design, develop, and maintain systems and applications, ' +
          'collaborate with cross-functional teams, and implement technical solutions to meet business needs. ' +
          'Strong technical skills and problem-solving abilities are required.';
      } else if (jobTitle.toLowerCase().includes('manager')) {
        descriptionText += 'You will lead and mentor a team, develop strategies, manage projects, ' +
          'and drive business growth. Strong leadership skills and experience in team management are essential.';
      } else {
        descriptionText += 'In this role, you will contribute to our team with your expertise, ' +
          'collaborate with colleagues, and help us achieve our business objectives. We value creativity, ' +
          'problem-solving abilities, and a strong work ethic.';
      }
    }
    
    // Store the full description for client-side expansion
    const fullDescription = descriptionText;
    
    // Create a preview (first 150 chars to leave room for "...")
    const previewLength = 150;
    const descriptionPreview = fullDescription.length > 0 ? fullDescription.substring(0, previewLength) : '';
    
    // Prepare HTML for description display with toggle functionality
    const descriptionHtml = descriptionPreview ? 
      `<div class="mt-2 bg-gray-50 p-2 rounded">
        <!-- Preview version (shown by default) -->
        <div id="preview-${result.job_id}">
          <p class="text-sm text-gray-700">${descriptionPreview.replace(/</g, '&lt;').replace(/>/g, '&gt;')}${fullDescription.length > previewLength ? '...' : ''}</p>
          ${fullDescription.length > previewLength ? 
            `<button 
              class="text-xs text-blue-500 hover:underline mt-1"
              onclick="document.getElementById('preview-${result.job_id}').style.display='none'; document.getElementById('full-${result.job_id}').style.display='block';"
            >
              Read more
            </button>` : 
            ''
          }
        </div>
        
        <!-- Full version (hidden by default) -->
        <div id="full-${result.job_id}" style="display:none;">
          <p class="text-sm text-gray-700">${fullDescription.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
          <button 
            class="text-xs text-blue-500 hover:underline mt-1"
            onclick="document.getElementById('preview-${result.job_id}').style.display='block'; document.getElementById('full-${result.job_id}').style.display='none';"
          >
            Read less
          </button>
        </div>
      </div>` : '';

    html += `
      <li>
        <div class="flex flex-col space-y-2">
          <div class="bg-white rounded-md shadow-sm p-4 border border-gray-200">
            <div class="flex justify-between">
              <h3 class="text-lg font-semibold text-blue-600">${result.job_title || 'N/A'}</h3>
              ${sourceTag}
            </div>
            
            <!-- Job description appears directly after the title -->
            ${descriptionPreview ? `
            <div class="my-2 bg-gray-50 p-2 rounded">
              <p class="text-sm text-gray-700">${descriptionPreview.replace(/</g, '&lt;').replace(/>/g, '&gt;')}${descriptionPreview.length === 200 ? '...' : ''}</p>
              <button 
                class="text-xs text-blue-500 hover:underline mt-1" 
                hx-get="/api/job-details?id=${result.job_id}" 
                hx-target="#job-${result.job_id}"
                hx-trigger="click"
                hx-indicator=".htmx-indicator">
                Read more
              </button>
              <div id="job-${result.job_id}" class="mt-2"></div>
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

  // No filter controls - just return the results list

  return html;
}

// Function to generate EdX courses HTML directly
function generateEdXPlaceholder(query) {
  try {
    // Basic check to ensure we have a valid query
    if (!query || typeof query !== 'string' || query.trim() === '') {
      return '';
    }
    
    // Extract relevant keywords for course search
    const keywords = query.toLowerCase()
      .replace(/and/g, ' ')
      .split(' ')
      .filter(word => word.length > 2) // Only words longer than 2 chars
      .slice(0, 3) // Take top 3 keywords
      .join(' ');
    
    // Check if query is finance-related
    const isFinanceQuery = keywords.includes('stock') || 
                          keywords.includes('financ') || 
                          keywords.includes('invest') || 
                          keywords.includes('trading') || 
                          keywords.includes('money') || 
                          keywords.includes('accounting') || 
                          (keywords.includes('number') && (keywords.includes('work') || keywords.includes('love')));
    
    // If finance query, return a finance course directly
    if (isFinanceQuery) {
      return generateDirectCourseHTML(query, {
        title: 'Finance for Everyone: Smart Tools for Decision-Making',
        provider: 'University of Michigan',
        type: 'Course',
        description: 'Learn how to think clearly about important financial decisions and improve your financial literacy.',
        startDate: 'Self-paced'
      });
    }
    
    // For technology queries
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
    
    // For general searches, return a data analytics course (generally useful in many fields)
    return generateDirectCourseHTML(query, {
      title: 'Data Science and Analytics Essentials',
      provider: 'IBM',
      type: 'Professional Certificate',
      description: 'Learn fundamental data science and analytics skills applicable to many career paths and industries.',
      startDate: 'Self-paced'
    });
  } catch (error) {
    console.error('Error generating EdX placeholder:', error);
    return ''; // Return empty string if error
  }
}

/**
 * Generate direct HTML for a course without making API calls
 * @param {string} query - User's search query
 * @param {Object} course - Course object with title, provider, etc.
 * @returns {string} - HTML for course display
 */
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

// Function to generate YouTube video HTML directly in the search results
// Instead of making a separate API call, we'll add a placeholder for client-side loading
function generateYouTubePlaceholder(query) {
  try {
    // Basic check to ensure we have a valid query
    if (!query || typeof query !== 'string' || query.trim() === '') {
      return '';
    }
    
    // Extract relevant keywords for video search
    const keywords = query.toLowerCase()
      .replace(/and/g, ' ')
      .split(' ')
      .filter(word => word.length > 2) // Only words longer than 2 chars
      .slice(0, 3) // Take top 3 keywords
      .join(' ');
    
    // Create a placeholder that will load the YouTube video via JavaScript fetch
    // Adjusted for consistent height in the two-column layout
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
    return ''; // Return empty string if error
  }
}

// Main handler function
export default async function handler(req, res) {
  console.log("Search endpoint hit:", req.query);

  if (!predictionServiceClient) {
    console.error('Vertex AI client not initialized');
    return res.status(500).send('Server error: AI service unavailable');
  }

  const { query, source, remote, minSalary } = req.query;

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
    if (source) queryFilters.source = source;
    if (remote !== undefined) queryFilters.remote = remote;
    if (minSalary) queryFilters.minSalary = minSalary;
    
    let finalResults = [];
    const searchLimit = 20;
    const candidatesPerSource = 150;

    // Prepare individual search filters
    const individualSearchFilters = { ...queryFilters };
    if (queryFilters.source === 'all' || !queryFilters.source) {
      delete individualSearchFilters.source;
    }

    // Perform search based on source filter
    if (queryFilters.source === 'linkedin') {
      console.log('Searching LinkedIn jobs only');
      const results = await performVectorSearch(
        embeddingVector,
        LINKEDIN_JOBS_COLLECTION_NAME,
        LINKEDIN_JOBS_VECTOR_INDEX_NAME,
        LINKEDIN_JOBS_EMBEDDING_FIELD_NAME,
        individualSearchFilters,
        candidatesPerSource,
        searchLimit
      );
      finalResults = results.filter(r => r.score && r.score >= MIN_RELEVANCE_SCORE);
    } 
    else if (queryFilters.source === 'tech') {
      console.log('Searching Tech jobs only');
      const results = await performVectorSearch(
        embeddingVector,
        TECH_JOBS_COLLECTION_NAME,
        TECH_JOBS_VECTOR_INDEX_NAME,
        TECH_JOBS_EMBEDDING_FIELD_NAME,
        individualSearchFilters,
        candidatesPerSource,
        searchLimit
      );
      finalResults = results.filter(r => r.score && r.score >= MIN_RELEVANCE_SCORE);
    } 
    else {
      console.log('Searching all job sources');
      // Search LinkedIn jobs
      const linkedinResults = await performVectorSearch(
        embeddingVector,
        LINKEDIN_JOBS_COLLECTION_NAME,
        LINKEDIN_JOBS_VECTOR_INDEX_NAME,
        LINKEDIN_JOBS_EMBEDDING_FIELD_NAME,
        individualSearchFilters,
        candidatesPerSource,
        candidatesPerSource
      );
      
      // Search Tech jobs
      const techResults = await performVectorSearch(
        embeddingVector,
        TECH_JOBS_COLLECTION_NAME,
        TECH_JOBS_VECTOR_INDEX_NAME,
        TECH_JOBS_EMBEDDING_FIELD_NAME,
        individualSearchFilters,
        candidatesPerSource,
        candidatesPerSource
      );
      
      // Combine results
      let combined = [...linkedinResults, ...techResults];
      
      // Check for industry-specific keywords in the query to boost relevant results
      const healthcareTerms = ['healthcare', 'health', 'medical', 'patient', 'hospital', 'doctor', 'nurse', 'therapy', 'clinical'];
      const techTerms = ['programming', 'software', 'developer', 'data', 'tech', 'code', 'coding'];
      const financeTerms = ['finance', 'financial', 'banking', 'investment', 'accounting'];
      const educationTerms = ['education', 'teaching', 'school', 'teacher', 'student', 'learn'];
      
      const queryLower = query.toLowerCase();
      
      // Apply industry-specific boosting
      combined = combined.map(job => {
        let boostScore = 0;
        const jobTitle = (job.job_title || '').toLowerCase();
        const jobDescription = (job.job_description || '').toLowerCase();
        
        // Check if query contains healthcare terms
        if (healthcareTerms.some(term => queryLower.includes(term))) {
          // Boost jobs with healthcare-related titles or descriptions
          if (healthcareTerms.some(term => jobTitle.includes(term) || jobDescription.includes(term))) {
            boostScore += 0.15; // Significant boost for healthcare matches
            console.log(`Boosting healthcare job: ${job.job_title}`);
          }
        }
        
        // Check other industries similarly
        if (techTerms.some(term => queryLower.includes(term))) {
          if (techTerms.some(term => jobTitle.includes(term) || jobDescription.includes(term))) {
            boostScore += 0.15;
          }
        }
        
        if (financeTerms.some(term => queryLower.includes(term))) {
          if (financeTerms.some(term => jobTitle.includes(term) || jobDescription.includes(term))) {
            boostScore += 0.15;
          }
        }
        
        if (educationTerms.some(term => queryLower.includes(term))) {
          if (educationTerms.some(term => jobTitle.includes(term) || jobDescription.includes(term))) {
            boostScore += 0.15;
          }
        }
        
        // Return job with boosted score
        return {
          ...job,
          score: (job.score || 0) + boostScore
        };
      });
      
      // Sort by boosted relevance score
      combined.sort((a, b) => (b.score || 0) - (a.score || 0));
      
      // Filter by relevance score
      const relevantResults = combined.filter(r => r.score && r.score >= MIN_RELEVANCE_SCORE);
      finalResults = relevantResults.slice(0, searchLimit);
    }
    
    // Ensure we have industry diversity in the results - identify job categories
    const jobCategories = {};
    finalResults.forEach(job => {
      const title = job.job_title?.toLowerCase() || '';
      let category = 'other';
      
      // Identify the job category based on title or description
      if (/health|medical|patient|nurse|doctor|clinical|care|therapy|hospital/.test(title)) {
        category = 'healthcare';
      } else if (/tech|software|developer|engineer|data|scientist|programming/.test(title)) {
        category = 'tech';
      } else if (/finance|financial|accounting|investment|banking/.test(title)) {
        category = 'finance';
      } else if (/teach|education|school|professor|instructor/.test(title)) {
        category = 'education';
      } else if (/marketing|sales|business|manager|director/.test(title)) {
        category = 'business';
      }
      
      job.category = category;
      jobCategories[category] = (jobCategories[category] || 0) + 1;
    });
    
    console.log('Job categories found:', jobCategories);
    
    // Check if query contains industry-specific terms
    const queryLower = query.toLowerCase();
    const specificIndustry = queryLower.includes('healthcare') || queryLower.includes('health') || 
                            queryLower.includes('tech') || queryLower.includes('finance') || 
                            queryLower.includes('education');
    
    // Balanced sort algorithm that considers both salary and relevance
    finalResults.sort((a, b) => {
      const getSalary = (item) => {
        return item.salary_max || item.salary_median || item.salary_min || 
               (item.salary_in_usd ? parseFloat(item.salary_in_usd) : 0);
      };
      
      // Calculate normalized salary score (0-1)
      const salaryA = getSalary(a);
      const salaryB = getSalary(b);
      const maxSalary = Math.max(...finalResults.map(item => getSalary(item)));
      const normalizedSalaryA = salaryA / maxSalary;
      const normalizedSalaryB = salaryB / maxSalary;
      
      // If the query specifically mentions an industry, prioritize category matches
      if (specificIndustry) {
        // Check if either job matches the industry mentioned in the query
        const queryMatchesA = queryLower.includes(a.category);
        const queryMatchesB = queryLower.includes(b.category);
        
        if (queryMatchesA && !queryMatchesB) return -1;
        if (!queryMatchesA && queryMatchesB) return 1;
      }
      
      // Calculate combined score: relevance (60%) + salary (40%)
      const scoreA = (a.score || 0) * 0.6 + normalizedSalaryA * 0.4;
      const scoreB = (b.score || 0) * 0.6 + normalizedSalaryB * 0.4;
      
      return scoreB - scoreA;
    });
    
    // Add a hidden input to store the current query for filter buttons
    const queryInput = `<input type="hidden" name="current-query" value="${query}">`;
    
    // Try to fetch a relevant YouTube video if we have at least 1 result
    let youtubeHtml = '';
    if (finalResults.length > 0) {
      try {
        // Extract job title from the top result for more relevant YouTube videos
        const topJobTitle = finalResults[0].job_title || '';
        
        // Use the job title if available, otherwise use the original query
        const videoSearchTerm = topJobTitle ? topJobTitle : query;
        console.log(`Using "${videoSearchTerm}" for YouTube search based on top job result`);
        
        youtubeHtml = generateYouTubePlaceholder(videoSearchTerm);
      } catch (youtubeError) {
        console.error('Error adding YouTube video placeholder:', youtubeError);
        // Continue without YouTube video
      }
    }
    
    // Add EdX courses recommendations
    let edxHtml = '';
    if (finalResults.length > 0) {
      try {
        edxHtml = generateEdXPlaceholder(query);
      } catch (edxError) {
        console.error('Error adding EdX courses placeholder:', edxError);
        // Continue without EdX recommendations
      }
    }
    
    // Format results as HTML and include the query input
    // New order: Query input -> Two-column layout (YouTube + EdX) -> Job results
    
    // Create a two-column container for YouTube and EdX content
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
    
    let htmlResponse = queryInput + twoColumnLayout + formatResults(finalResults);
    
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
