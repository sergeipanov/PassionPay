/**
 * PassionPay Search API - Version 1.3
 * Enhanced with job description display and Read more/less functionality
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
    predictionServiceClient = new PredictionServiceClient({
      apiEndpoint: `${LOCATION}-aiplatform.googleapis.com`
    });
    console.log('PredictionServiceClient initialized globally.');
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
    
    // Tag indicating source
    const sourceTag = result.source === 'linkedin' ? 
      '<span class="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">LinkedIn</span>' : 
      '<span class="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">Tech</span>';

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

  // Add filter controls
  html = `
  <div class="mb-4 bg-white p-4 rounded-md shadow-sm border border-gray-200">
    <h3 class="text-sm font-medium text-gray-700 mb-2">Filter Results:</h3>
    <div class="flex flex-wrap gap-2">
      <button class="px-3 py-1 text-xs rounded border border-gray-300 hover:bg-gray-100" hx-get="/api/search?query=" hx-include="[name='current-query']" hx-target="#search-results" hx-indicator=".htmx-indicator">All Jobs</button>
      <button class="px-3 py-1 text-xs rounded border border-gray-300 hover:bg-gray-100" hx-get="/api/search?query=" hx-include="[name='current-query']" hx-vals='{"source":"linkedin"}' hx-target="#search-results" hx-indicator=".htmx-indicator">LinkedIn Jobs</button>
      <button class="px-3 py-1 text-xs rounded border border-gray-300 hover:bg-gray-100" hx-get="/api/search?query=" hx-include="[name='current-query']" hx-vals='{"remote":"true"}' hx-target="#search-results" hx-indicator=".htmx-indicator">Remote Only</button>
      <button class="px-3 py-1 text-xs rounded border border-gray-300 hover:bg-gray-100" hx-get="/api/search?query=" hx-include="[name='current-query']" hx-vals='{"minSalary":"100000"}' hx-target="#search-results" hx-indicator=".htmx-indicator">$100k+</button>
    </div>
  </div>
  ${html}`;

  return html;
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
      
      // Combine and sort by relevance
      let combined = [...linkedinResults, ...techResults];
      combined.sort((a, b) => (b.score || 0) - (a.score || 0));
      
      // Filter by relevance score
      const relevantResults = combined.filter(r => r.score && r.score >= MIN_RELEVANCE_SCORE);
      finalResults = relevantResults.slice(0, searchLimit);
    }
    
    // Sort by salary (descending)
    finalResults.sort((a, b) => {
      const getSalary = (item) => {
        return item.salary_max || item.salary_median || item.salary_min || 
               (item.salary_in_usd ? parseFloat(item.salary_in_usd) : 0);
      };
      return getSalary(b) - getSalary(a);
    });
    
    // Add hidden input for current query
    const queryInput = `<input type="hidden" name="current-query" value="${query}">`;
    
    // Return HTML response
    const html = queryInput + formatResults(finalResults);
    res.setHeader('Content-Type', 'text/html');
    res.status(200).send(html);
  } 
  catch (error) {
    console.error('Search error:', error);
    res.status(500).send(`<div class="p-4 bg-red-50 border border-red-300 rounded-md">
      <h3 class="text-red-700 font-semibold">Error</h3>
      <p class="text-red-600">Search error: ${error.message}</p>
    </div>`);
  }
}
