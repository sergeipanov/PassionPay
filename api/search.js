import 'dotenv/config'; // Loads environment variables from .env
import aiplatform, { helpers } from '@google-cloud/aiplatform'; // Import the whole module and helpers
import { MongoClient } from 'mongodb'; // Import MongoClient

// Destructure the v1 client from the imported module
const { PredictionServiceClient } = aiplatform.v1;
// We might need helpers later for formatting input/output
// const { helpers } = aiplatform; // Already imported above with { helpers }

// Configuration for Vertex AI
const PROJECT_ID = process.env.GCP_PROJECT_ID;
const LOCATION = process.env.GCP_LOCATION || 'us-central1';
const PUBLISHER = 'google'; // Often 'google', verify if different for your model
const MODEL_ID = process.env.GCP_EMBEDDING_MODEL || 'textembedding-gecko';

// MongoDB Configuration
const MONGODB_URI = process.env.MONGODB_URI;
const MONGO_DATABASE_NAME = 'passion_pay_db'; // As identified from screenshots
const MONGO_COLLECTION_NAME = 'job_salaries'; // As identified from screenshots
const MONGO_VECTOR_INDEX_NAME = 'job_title_vector_index'; // As identified from screenshots
const MONGO_EMBEDDING_FIELD_NAME = process.env.MONGO_EMBEDDING_FIELD_NAME || 'job_title_embedding';

const MIN_RELEVANCE_SCORE = 0.50; // Minimum relevance score to consider a match

// Country code to full name mapping
const countryCodeMap = {
    "US": "United States",
    "CA": "Canada",
    "GB": "United Kingdom",
    "DE": "Germany",
    "FR": "France",
    "AU": "Australia",
    "IN": "India",
    "JP": "Japan",
    "CN": "China",
    "BR": "Brazil",
    "NL": "Netherlands",
    "ES": "Spain",
    "IT": "Italy",
    "CH": "Switzerland",
    "SE": "Sweden",
    "NZ": "New Zealand",
    "IE": "Ireland",
    "SG": "Singapore",
    "HK": "Hong Kong",
    "KR": "South Korea",
    "AE": "United Arab Emirates",
    "ZA": "South Africa",
    "RU": "Russia",
    "MX": "Mexico",
    "AR": "Argentina",
    "PT": "Portugal", // Added Portugal
    // Add more as needed
};

const employmentTypeMap = {
    "FT": "Full-time",
    "PT": "Part-time",
    "CT": "Contract",
    "FL": "Freelance"
    // Add more as needed
};

const experienceLevelMap = {
    "EN": "Entry-level",
    "MI": "Mid-level",
    "SE": "Senior-level",
    "EX": "Executive"
    // Add more as needed
};

// Global instance of the MongoDB client (can be initialized once)
let mongoClient;
let db;

async function connectToMongoDB() {
  if (db) return db; // Return existing connection if available
  if (!MONGODB_URI) {
    console.error('CRITICAL: MONGODB_URI is not set. MongoDB Client NOT initialized.');
    throw new Error('MONGODB_URI not configured');
  }
  try {
    if (!mongoClient) {
      mongoClient = new MongoClient(MONGODB_URI);
      await mongoClient.connect();
      console.log('MongoDB Client connected successfully.');
    }
    db = mongoClient.db(MONGO_DATABASE_NAME);
    return db;
  } catch (error) {
    console.error('Error connecting to MongoDB:', error);
    // Potentially close client if connection failed during db assignment
    if (mongoClient) {
      await mongoClient.close();
      mongoClient = null; // Reset client
    }
    db = null; // Reset db
    throw error; // Re-throw error to be caught by caller
  }
}

// Global instance of the client (can be initialized once)
let predictionServiceClient;
try {
  if (PROJECT_ID) {
    const clientOptions = { apiEndpoint: `${LOCATION}-aiplatform.googleapis.com` };
    predictionServiceClient = new PredictionServiceClient(clientOptions);
    console.log('PredictionServiceClient initialized globally.');
  } else {
    console.error('CRITICAL: GCP_PROJECT_ID is not set. Vertex AI Client NOT initialized.');
  }
} catch (error) {
  console.error('Error during global Vertex AI Client initialization:', error);
  predictionServiceClient = null; // Ensure it's null if init failed
}

async function getEmbedding(textToEmbed) {
  console.log(`getEmbedding called with text: "${textToEmbed}"`);
  if (!predictionServiceClient) {
    console.error('Vertex AI Client not available in getEmbedding.');
    throw new Error('Vertex AI Client not initialized');
  }

  const endpoint = `projects/${PROJECT_ID}/locations/${LOCATION}/publishers/${PUBLISHER}/models/${MODEL_ID}`;
  console.log(`Using endpoint: ${endpoint}`);

  // Construct the instance payload based on documentation for text-embedding-005
  // task_type should be inside the instance object.
  const instances = [
    helpers.toValue({
      content: textToEmbed,
      task_type: "RETRIEVAL_DOCUMENT", // Specify task type for better embeddings
      // title: "Optional document title" // 'title' is optional, only valid with RETRIEVAL_DOCUMENT
    }),
  ];

  // Construct the parameters payload
  // autoTruncate is a common parameter.
  const parameters = helpers.toValue({
    autoTruncate: true,
    // outputDimensionality: 256 // Optional: to specify embedding size
  });

  const request = {
    endpoint,
    instances,
    parameters,
  };

  try {
    console.log('getEmbedding: Calling Vertex AI predict API...');
    const [response] = await predictionServiceClient.predict(request);
    console.log('getEmbedding: Received response from Vertex AI.');

    // Log the raw response for debugging
    // console.log('Raw Vertex AI Response:', JSON.stringify(response, null, 2)); // This is the overall response object

    // The 'response' object from predict call (after destructuring `const [response] = ...`) IS the main payload.
    const resultPayload = response;

    if (resultPayload && resultPayload.predictions && resultPayload.predictions.length > 0) {
      // Each item in resultPayload.predictions is a Struct. Convert the first one.
      const firstPredictionStruct = resultPayload.predictions[0];
      const predictionJS = helpers.fromValue(firstPredictionStruct);
      // console.log('First prediction (converted to JS):', JSON.stringify(predictionJS, null, 2));

      if (predictionJS && predictionJS.embeddings && predictionJS.embeddings.values) {
        const embeddingVector = predictionJS.embeddings.values;
        // Ensure it's an array of numbers
        if (Array.isArray(embeddingVector) && embeddingVector.every(v => typeof v === 'number')) {
          console.log(`getEmbedding: Extracted embedding vector of length: ${embeddingVector.length}`);
          return embeddingVector;
        } else {
          console.error('getEmbedding: Extracted embeddings.values is not an array of numbers as expected.');
          console.error('Received values:', JSON.stringify(embeddingVector, null, 2));
          throw new Error('Failed to extract embedding: values not in expected number array format.');
        }
      } else {
        console.error('getEmbedding: Converted predictionJS or embeddings structure is not as expected.');
        console.error('Converted predictionJS object:', JSON.stringify(predictionJS, null, 2));
        throw new Error('Failed to extract embedding from converted Vertex AI response.');
      }
    } else {
      console.error('getEmbedding: Vertex AI response does not contain predictions or predictions array is empty.');
      console.error('Full result payload:', JSON.stringify(resultPayload, null, 2));
      throw new Error('No predictions found in Vertex AI response.');
    }
  } catch (e) {
    console.error(`getEmbedding: Error calling Vertex AI predict API or processing response: ${e.message}`);
    console.error('Error details:', e); // Log the full error object for more details
    throw new Error(`Vertex AI API call failed: ${e.message}`);
  }
}

async function performVectorSearch(embeddingVector, filters = {}, numCandidates = 150, limit = 20) {
  if (!embeddingVector || !Array.isArray(embeddingVector)) {
    console.error('performVectorSearch: Invalid embeddingVector provided.');
    throw new Error('Invalid embeddingVector for search.');
  }

  try {
    const mongoDb = await connectToMongoDB();
    const collection = mongoDb.collection(MONGO_COLLECTION_NAME);

    // Build the pipeline for both tech and LinkedIn jobs
    const pipeline = [
      {
        $vectorSearch: {
          index: MONGO_VECTOR_INDEX_NAME,
          path: MONGO_EMBEDDING_FIELD_NAME,
          queryVector: embeddingVector,
          numCandidates: numCandidates, // Increased to get more diverse results
          limit: numCandidates, // Get a larger initial set for filtering
        },
      }
    ];
    
    // Add filters if provided
    const matchStage = {};
    const filterConditions = [];
    
    // Filter by job source if specified
    if (filters.source) {
      filterConditions.push({ source: filters.source });
    }
    
    // Filter by remote status if specified
    if (filters.remote !== undefined) {
      filterConditions.push({ remote: filters.remote === 'true' || filters.remote === true });
    }
    
    // Filter by minimum salary if specified
    if (filters.minSalary) {
      const minSalary = parseInt(filters.minSalary, 10);
      if (!isNaN(minSalary)) {
        // Check normalized_salary or salary_in_usd depending on what's available
        filterConditions.push({
          $or: [
            { normalized_salary: { $gte: minSalary } },
            { salary_in_usd: { $gte: minSalary.toString() } } // Some may be stored as strings
          ]
        });
      }
    }
    
    // Add combined filters to the pipeline if any exist
    if (filterConditions.length > 0) {
      if (filterConditions.length === 1) {
        Object.assign(matchStage, filterConditions[0]);
      } else {
        matchStage.$and = filterConditions;
      }
      pipeline.push({ $match: matchStage });
    }
    
    // Project stage to include fields from both job sources
    pipeline.push({
      $project: {
        _id: 0,
        job_id: 1,
        job_title: 1,
        company_name: 1,
        location: 1,
        // Handle salary fields from both sources
        salary_in_usd: 1,
        normalized_salary: 1,
        salary_min: 1,
        salary_median: 1,
        salary_max: 1,
        salary_currency: 1,
        salary_period: 1,
        // Other job details
        experience_level: 1,
        company_location: 1,
        work_type: 1,
        remote: 1,
        source: 1,
        score: { $meta: 'vectorSearchScore' }
      }
    });
    
    // Add a limit stage
    pipeline.push({ $limit: limit });

    console.log(`performVectorSearch: Executing search on '${MONGO_COLLECTION_NAME}' with index '${MONGO_VECTOR_INDEX_NAME}'.`);
    const searchResults = await collection.aggregate(pipeline).toArray();
    console.log(`performVectorSearch: Found ${searchResults.length} results.`);
    return searchResults;

  } catch (error) {
    console.error('performVectorSearch: Error during MongoDB vector search:', error);
    throw new Error(`MongoDB vector search failed: ${error.message}`);
  }
}

function formatResultsToHTML(results) {
    if (!results || results.length === 0) {
        return '<p class="text-gray-500">We couldn\'t find strong job matches for your query in our current dataset. Try refining your search, or explore other passions!</p>';
    }

    let html = '<ul class="space-y-4">';
    let allSalariesBelowThreshold = true;
    const salaryThreshold = 80000; // Threshold for high-paying jobs

    results.forEach(result => {
        // Determine salary value from various possible fields
        let salary = null;
        if (result.salary_in_usd) {
            salary = parseFloat(result.salary_in_usd);
        } else if (result.normalized_salary) {
            salary = parseFloat(result.normalized_salary);
        } else if (result.salary_median) {
            salary = parseFloat(result.salary_median);
        } else if (result.salary_max) {
            salary = parseFloat(result.salary_max);
        }

        if (salary && salary >= salaryThreshold) {
            allSalariesBelowThreshold = false;
        }

        // Format salary display
        let salaryDisplay = 'N/A';
        if (salary) {
            salaryDisplay = `$${Math.round(salary).toLocaleString()}`;
            
            // Add salary range if available (for LinkedIn jobs)
            if (result.salary_min && result.salary_max) {
                const minSalary = parseFloat(result.salary_min);
                const maxSalary = parseFloat(result.salary_max);
                if (!isNaN(minSalary) && !isNaN(maxSalary)) {
                    salaryDisplay = `$${Math.round(minSalary).toLocaleString()} - $${Math.round(maxSalary).toLocaleString()}`;
                }
            }
            
            // Add currency and period if available
            if (result.salary_currency && result.salary_currency !== 'USD' && result.salary_currency !== 'usd') {
                salaryDisplay += ` ${result.salary_currency.toUpperCase()}`;
            }
            if (result.salary_period) {
                let period = result.salary_period.toLowerCase();
                if (period === 'yearly' || period === 'year') {
                    period = '/year';
                } else if (period === 'monthly' || period === 'month') {
                    period = '/month';
                } else if (period === 'hourly' || period === 'hour') {
                    period = '/hour';
                }
                salaryDisplay += ` ${period}`;
            }
        }

        // Get location from multiple possible fields
        const locationRaw = result.location || result.company_location || 'N/A';
        const location = countryCodeMap[locationRaw] || locationRaw;
        
        // Get experience level
        const experience = experienceLevelMap[result.experience_level] || result.experience_level || 'N/A';
        
        // Get company name
        const company = result.company_name || 'N/A';
        
        // Get work type and remote status
        const workType = result.work_type || 'N/A';
        const isRemote = result.remote === true || result.remote === 'true';
        const remoteText = isRemote ? '• Remote' : '';
        
        // Get score for debugging (can be hidden in production)
        const score = result.score ? result.score.toFixed(4) : 'N/A';
        
        // Tag indicating source of job
        const sourceTag = result.source === 'linkedin' ? 
            '<span class="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">LinkedIn</span>' : 
            '<span class="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">Tech</span>';

        html += `
            <li>
                <div class="flex flex-col space-y-2">
                    <div class="bg-white rounded-md shadow-sm p-4 border border-gray-200">
                        <div class="flex justify-between">
                            <h3 class="text-lg font-semibold text-blue-600">${result.job_title || 'N/A'}</h3>
                            ${sourceTag}
                        </div>
                        <p class="text-sm text-gray-500 mb-2">${company} • ${location} ${remoteText}</p>
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

    // Add additional prompt if all found jobs are below the salary threshold
    if (allSalariesBelowThreshold) {
        html += '<p class="text-gray-600 mt-4">Many roles in this field have salaries in the range shown. Would you like to explore other passions that may offer higher average salaries?</p>';
    }

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

export default async function handler(req, res) {
  console.log("/api/search endpoint was hit!");
  console.log('Request query:', req.query); // For debugging query params

  if (!predictionServiceClient) {
     console.log('--- Environment Variables (Client Not Initialized) ---');
     console.log('GCP_PROJECT_ID:', PROJECT_ID ? 'Loaded ('+PROJECT_ID+')' : 'Not Loaded or Empty -> CRITICAL');
     console.log('----------------------------------------------------');
     console.error('Handler: PredictionServiceClient is not available.');
     res.status(500).send('Server error: Vertex AI client not initialized.');
     return;
  }

  // Extract the query and all possible filter parameters
  const { query, source, remote, minSalary } = req.query;

  if (!query) {
    console.log('Handler: No query parameter provided.');
    return res.status(400).send('Please provide a query parameter (e.g., /api/search?query=yoursearch).');
  }

  try {
    console.log(`Handler: Calling getEmbedding for query: "${query}"`);
    const embeddingVector = await getEmbedding(query);
    console.log(`Handler: Received embedding vector of length: ${embeddingVector ? embeddingVector.length : 0}`);

    if (!embeddingVector || embeddingVector.length === 0) {
      return res.status(500).send(formatResultsToHTML([])); // Or a specific error message HTML
    }

    // Build filters object from query parameters
    const filters = {};
    if (source) filters.source = source;
    if (remote !== undefined) filters.remote = remote;
    if (minSalary) filters.minSalary = minSalary;

    console.log('Applying filters:', filters);
    
    // Search with filters
    let searchResults = await performVectorSearch(embeddingVector, filters);
    
    // Filter results by minimum relevance score
    const filteredResults = searchResults.filter(result => result.score && result.score >= MIN_RELEVANCE_SCORE);

    console.log(`Handler: Found ${searchResults.length} initial results, ${filteredResults.length} after filtering by score >= ${MIN_RELEVANCE_SCORE}`);

    // Sort the filtered results by salary (descending)
    // Handle different salary fields from both tech and LinkedIn jobs
    const sortedResults = filteredResults.sort((a, b) => {
        // Get salary values from various fields
        let salaryA = 0;
        if (a.salary_in_usd) {
            salaryA = parseFloat(a.salary_in_usd);
        } else if (a.normalized_salary) {
            salaryA = parseFloat(a.normalized_salary);
        } else if (a.salary_median) {
            salaryA = parseFloat(a.salary_median);
        } else if (a.salary_max) {
            salaryA = parseFloat(a.salary_max);
        }
        
        let salaryB = 0;
        if (b.salary_in_usd) {
            salaryB = parseFloat(b.salary_in_usd);
        } else if (b.normalized_salary) {
            salaryB = parseFloat(b.normalized_salary);
        } else if (b.salary_median) {
            salaryB = parseFloat(b.salary_median);
        } else if (b.salary_max) {
            salaryB = parseFloat(b.salary_max);
        }
        
        return salaryB - salaryA; // For descending order
    });

    // Add a hidden input to store the current query for filter buttons
    const queryInput = `<input type="hidden" name="current-query" value="${query}">`;
    
    // Format results as HTML and include the query input
    const htmlResponse = queryInput + formatResultsToHTML(sortedResults);
    res.setHeader('Content-Type', 'text/html');
    res.status(200).send(htmlResponse);

  } catch (error) {
    console.error(`Handler: Error processing request: ${error.message}`);
    // Send an HTML error message
    const errorHtml = `
      <div class="p-4 border border-red-300 rounded-md shadow-sm bg-red-50">
        <h3 class="text-lg font-semibold text-red-700">Error</h3>
        <p class="text-sm text-red-600">Sorry, an error occurred while processing your search: ${error.message}</p>
      </div>
    `;
    res.setHeader('Content-Type', 'text/html');
    res.status(500).send(errorHtml);
  }
}
