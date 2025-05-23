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

async function performVectorSearch(embeddingVector, numCandidates = 150, limit = 10) {
  if (!embeddingVector || !Array.isArray(embeddingVector)) {
    console.error('performVectorSearch: Invalid embeddingVector provided.');
    throw new Error('Invalid embeddingVector for search.');
  }

  try {
    const mongoDb = await connectToMongoDB();
    const collection = mongoDb.collection(MONGO_COLLECTION_NAME);

    const pipeline = [
      {
        $vectorSearch: {
          index: MONGO_VECTOR_INDEX_NAME,
          path: MONGO_EMBEDDING_FIELD_NAME,
          queryVector: embeddingVector,
          numCandidates: numCandidates, // Number of candidates to consider
          limit: limit, // Number of results to return
        },
      },
      {
        $project: { // Define which fields to return
          _id: 0, // Exclude the _id field
          job_title: 1,
          salary_in_usd: 1,
          experience_level: 1,
          company_location: 1,
          score: { $meta: 'vectorSearchScore' } // Include the search score
        }
      }
    ];

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
        // Updated message for when no relevant jobs are found after filtering
        return '<p class="text-gray-500">We couldn\'t find strong job matches for your query in our current dataset. Try refining your search, or explore other passions!</p>';
    }

    let html = '<ul class="space-y-4">';
    let allSalariesBelowThreshold = true;
    const salaryThreshold = 80000; // Example threshold, can be adjusted

    results.forEach(result => {
        const salaryInUsd = result.salary_in_usd ? parseFloat(result.salary_in_usd) : 0;
        if (salaryInUsd >= salaryThreshold) {
            allSalariesBelowThreshold = false;
        }

        const salaryDisplay = result.salary_in_usd ? `$${Number(result.salary_in_usd).toLocaleString()}` : 'N/A';
        const experience = experienceLevelMap[result.experience_level] || result.experience_level || 'N/A'; // Use mapping
        const location = countryCodeMap[result.company_location] || result.company_location || 'N/A'; // Use mapping
        const score = result.score ? result.score.toFixed(4) : 'N/A'; // Display score for debugging, can be removed

        html += `
            <li>
                <div class="flex flex-col space-y-2">
                    <div class="bg-white rounded-md shadow-sm p-4">
                        <h3 class="text-lg font-semibold text-blue-600">${result.job_title || 'N/A'}</h3>
                        <p class="text-sm text-gray-700">Salary (USD): <span class="font-medium">${salaryDisplay}</span></p>
                        <p class="text-sm text-gray-700">Experience: <span class="font-medium">${experience}</span></p>
                        <p class="text-sm text-gray-700">Location: <span class="font-medium">${location}</span></p>
                        <p class="text-sm text-gray-500">Match Score: <span class="font-medium">${score}</span></p>
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

    return html;
}

export default async function handler(req, res) {
  console.log("/api/search endpoint was hit!");
  // console.log('Request query:', req.query); // For debugging query params later

  // Environment variable logs are now primarily useful on server startup
  // We can reduce noise by not logging them on every request if client is initialized.
  if (!predictionServiceClient) {
     console.log('--- Environment Variables (Client Not Initialized) ---');
     console.log('GCP_PROJECT_ID:', PROJECT_ID ? 'Loaded ('+PROJECT_ID+')' : 'Not Loaded or Empty -> CRITICAL');
     // ... other env vars if needed for this specific failure case
     // console.log('GCP_LOCATION:', process.env.GCP_LOCATION ? 'Loaded ('+LOCATION+')' : 'Not in .env, Using default: ' + LOCATION);
     // console.log('GCP_EMBEDDING_MODEL:', process.env.GCP_EMBEDDING_MODEL ? 'Loaded ('+MODEL_ID+')' : 'Not in .env, Using default: ' + MODEL_ID);
     // console.log('MONGODB_URI:', process.env.MONGODB_URI ? 'Loaded' : 'Not Loaded or Empty');
     console.log('----------------------------------------------------');
     console.error('Handler: PredictionServiceClient is not available.');
     res.status(500).send('Server error: Vertex AI client not initialized.');
     return;
  }

  const { query } = req.query; // Assuming query comes as a URL parameter e.g., /api/search?query=hello

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

    let searchResults = await performVectorSearch(embeddingVector);
    
    // Filter results by minimum relevance score
    const filteredResults = searchResults.filter(result => result.score && result.score >= MIN_RELEVANCE_SCORE);

    console.log(`Handler: Found ${searchResults.length} initial results, ${filteredResults.length} after filtering by score >= ${MIN_RELEVANCE_SCORE}`);

    // Sort the filtered results by salary_in_usd (descending)
    // Ensure salary_in_usd is treated as a number for correct sorting
    const sortedResults = filteredResults.sort((a, b) => {
        const salaryA = a.salary_in_usd ? parseFloat(a.salary_in_usd) : 0;
        const salaryB = b.salary_in_usd ? parseFloat(b.salary_in_usd) : 0;
        return salaryB - salaryA; // For descending order
    });

    const htmlResponse = formatResultsToHTML(sortedResults);
    res.setHeader('Content-Type', 'text/html');
    res.status(200).send(htmlResponse);

  } catch (error) {
    console.error(`Handler: Error processing request: ${error.message}`);
    // Send an HTML error message as well if HTMX expects HTML
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
