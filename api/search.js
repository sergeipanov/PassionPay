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

// Log GCP_PROJECT_ID before it's used for PredictionServiceClient

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
  console.log('Attempting to connect to MongoDB...');
  if (!MONGODB_URI) {
    console.error('MongoDB connection error: MONGODB_URI is not set in environment variables.');
    throw new Error('MONGODB_URI is not set.');
  }
  try {
    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    console.log(`Successfully connected to MongoDB Atlas, database: ${MONGO_DATABASE_NAME}`);
    const db = client.db(MONGO_DATABASE_NAME);
    return { client, db };
  } catch (error) {
    console.error('MongoDB connection error details:', {
      message: error.message,
      name: error.name,
      // stack: error.stack, // Stack can be too verbose for initial logs
      code: error.code, // For MongoServerError
      errorLabels: error.errorLabels // For more specific Mongo errors
    });
    if (error.name === 'MongoNetworkError') {
        console.error('Hint: This might be a network connectivity issue (e.g., firewall, incorrect MONGODB_URI hostname/port) or the database server is down.');
    } else if (error.name === 'MongoParseError') {
        console.error('Hint: This might be an issue with the MONGODB_URI format. Ensure it starts with mongodb:// or mongodb+srv:// and is correctly structured.');
    } else if (error.code === 8000 || (error.errorLabels && error.errorLabels.includes('AuthenticationFailed'))) { // AuthenticationFailed
        console.error('Hint: MongoDB authentication failed. Check username/password in MONGODB_URI or IP access list settings in Atlas.');
    }
    throw error; // Re-throw the original error to be caught by the handler
  }
}

// Generate embeddings from Vertex AI
async function getEmbedding(textToEmbed) {
  console.log(`getEmbedding: Called with text: "${textToEmbed}"`);
  if (!textToEmbed || String(textToEmbed).trim() === '') { // Ensure textToEmbed is treated as string for trim
    console.error('getEmbedding: No valid text provided to embed.');
    return null;
  }
  if (!predictionServiceClient) {
    console.error('getEmbedding: CRITICAL - PredictionServiceClient is not initialized.');
    throw new Error('PredictionServiceClient not initialized. Cannot generate embedding.');
  }
  if (!PROJECT_ID || !LOCATION || !PUBLISHER || !MODEL_ID) {
    console.error(`getEmbedding: CRITICAL - Missing GCP configuration. PROJECT_ID: ${PROJECT_ID}, LOCATION: ${LOCATION}, PUBLISHER: ${PUBLISHER}, MODEL_ID: ${MODEL_ID}`);
    throw new Error('Missing GCP configuration for embeddings. Cannot generate embedding.');
  }

  try {
    const endpoint = `projects/${PROJECT_ID}/locations/${LOCATION}/publishers/${PUBLISHER}/models/${MODEL_ID}`;
    console.log(`getEmbedding: Using Vertex AI endpoint: ${endpoint}`);
    
    const instances = [
      helpers.toValue({
        content: String(textToEmbed), // Ensure content is string
        task_type: "RETRIEVAL_QUERY" // This should be for querying, RETRIEVAL_DOCUMENT is for indexing docs
      }),
    ];
    
    const parameters = helpers.toValue({
      autoTruncate: true // This is a good default
    });
    
    const request = { endpoint, instances, parameters };

    console.log('getEmbedding: Sending embedding request to Vertex AI. Request:', JSON.stringify(request, null, 2));
    const [vertexResponse] = await predictionServiceClient.predict(request); // Renamed to avoid conflict
    console.log('getEmbedding: Raw response from Vertex AI:', JSON.stringify(vertexResponse, null, 2));
    
    if (vertexResponse && vertexResponse.predictions && vertexResponse.predictions.length > 0) {
      const prediction = helpers.fromValue(vertexResponse.predictions[0]);
      console.log('getEmbedding: Parsed prediction object from Vertex AI:', JSON.stringify(prediction, null, 2));
      
      // Simplified embedding extraction based on common structure for text-embedding models
      if (prediction && prediction.embeddings && prediction.embeddings.values && Array.isArray(prediction.embeddings.values)) {
        console.log(`getEmbedding: Extracted embedding array directly from prediction.embeddings.values with ${prediction.embeddings.values.length} elements.`);
        return prediction.embeddings.values.map(v => Number(v));
      } else {
        // Fallback to the original findEmbedding logic if direct path fails, with more logging
        console.warn('getEmbedding: Could not find embedding in prediction.embeddings.values. Falling back to recursive search.');
        const findEmbeddingRecursive = (obj, path = 'prediction') => {
          if (!obj || typeof obj !== 'object') return null;
          // console.log(`getEmbedding.findEmbeddingRecursive: Searching in path: ${path}`); // Can be too verbose
          for (const key in obj) {
            const currentPath = `${path}.${key}`;
            if (Array.isArray(obj[key]) && obj[key].length >= 100) { // Generic length check, 768 is common
              console.log(`getEmbedding.findEmbeddingRecursive: Found potential embedding array in field '${currentPath}' with ${obj[key].length} elements.`);
              return obj[key];
            } else if (typeof obj[key] === 'object') {
              const result = findEmbeddingRecursive(obj[key], currentPath);
              if (result) return result;
            }
          }
          return null;
        };
        
        const embeddingArray = findEmbeddingRecursive(prediction);
        if (embeddingArray) {
          console.log('getEmbedding: Successfully extracted embedding array using recursive search.');
          return embeddingArray.map(v => Number(v));
        } else {
          console.error('getEmbedding: No valid embeddings array found in prediction response even after recursive search. Prediction object:', JSON.stringify(prediction, null, 2));
        }
      }
    } else {
      console.error('getEmbedding: No predictions found in Vertex AI response or response structure is unexpected. Full response:', JSON.stringify(vertexResponse, null, 2));
    }

    return null; // Explicitly return null if no embedding found
  } catch (error) {
    console.error('getEmbedding: Error during Vertex AI API call:', {
        message: error.message,
        name: error.name,
        // stack: error.stack, // Stack can be too verbose
        code: error.code, // gRPC status code
        details: error.details // Specific error details from API
    });
    // More specific error handling for Vertex AI
    if (error.code === 7) { // PERMISSION_DENIED
        console.error('Hint: Vertex AI Permission Denied. Check IAM roles for the Cloud Run service account (e.g., "Vertex AI User").');
    } else if (error.code === 3 || error.code === 5) { // INVALID_ARGUMENT or NOT_FOUND (e.g. model name)
        console.error('Hint: Vertex AI Invalid Argument or Not Found. Check model name, project ID, location, or request payload format.');
    }
    throw error; // Re-throw to be caught by handler
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

// Generate university program recommendations
function generateUniversityPrograms(query, topJobs) {
  const programs = [];
  
  // Analyze job titles and descriptions to determine relevant fields
  const jobTitles = topJobs.map(job => job.job_title?.toLowerCase() || '').join(' ');
  const jobDescriptions = topJobs.map(job => job.job_description?.toLowerCase() || '').join(' ');
  const combinedText = jobTitles + ' ' + jobDescriptions;
  
  // Healthcare field detection
  if (combinedText.includes('health') || combinedText.includes('medical') || combinedText.includes('nurse') || combinedText.includes('care')) {
    programs.push({
      title: 'Bachelor of Science in Healthcare Administration',
      school: 'Arizona State University Online',
      type: 'Bachelor\'s Degree',
      duration: '4 years',
      format: 'Online',
      description: 'Prepare for leadership roles in healthcare organizations, hospitals, and clinics.',
      searchQuery: 'healthcare administration degree online'
    });
    
    programs.push({
      title: 'Master of Public Health (MPH)',
      school: 'Johns Hopkins Bloomberg School',
      type: 'Master\'s Degree',
      duration: '2 years',
      format: 'Online/Hybrid',
      description: 'Advanced degree focusing on population health, epidemiology, and health policy.',
      searchQuery: 'master public health MPH online'
    });
  }
  
  // Technology field detection
  if (combinedText.includes('software') || combinedText.includes('data') || combinedText.includes('engineer') || combinedText.includes('tech')) {
    programs.push({
      title: 'Bachelor of Science in Computer Science',
      school: 'University of Maryland Global Campus',
      type: 'Bachelor\'s Degree',
      duration: '4 years',
      format: 'Online',
      description: 'Comprehensive program covering programming, algorithms, and software development.',
      searchQuery: 'computer science degree online accredited'
    });
    
    programs.push({
      title: 'Master of Science in Data Science',
      school: 'University of California, Berkeley',
      type: 'Master\'s Degree',
      duration: '20 months',
      format: 'Online',
      description: 'Advanced analytics, machine learning, and big data technologies.',
      searchQuery: 'data science masters degree online UC Berkeley'
    });
  }
  
  // Business field detection
  if (combinedText.includes('business') || combinedText.includes('manager') || combinedText.includes('finance') || combinedText.includes('marketing')) {
    programs.push({
      title: 'Master of Business Administration (MBA)',
      school: 'Penn State World Campus',
      type: 'Master\'s Degree',
      duration: '2 years',
      format: 'Online',
      description: 'Comprehensive business education with specializations in finance, marketing, and strategy.',
      searchQuery: 'MBA online penn state accredited'
    });
    
    programs.push({
      title: 'Bachelor of Science in Business Administration',
      school: 'Southern New Hampshire University',
      type: 'Bachelor\'s Degree',
      duration: '4 years',
      format: 'Online',
      description: 'Foundational business skills with concentrations in various business areas.',
      searchQuery: 'business administration degree online SNHU'
    });
  }
  
  // Education field detection
  if (combinedText.includes('teach') || combinedText.includes('education') || combinedText.includes('school') || combinedText.includes('student')) {
    programs.push({
      title: 'Master of Education (M.Ed.)',
      school: 'Arizona State University',
      type: 'Master\'s Degree',
      duration: '15 months',
      format: 'Online',
      description: 'Advanced teaching methods, curriculum design, and educational leadership.',
      searchQuery: 'master of education degree online ASU'
    });
  }
  
  // Return top 2 most relevant programs
  return programs.slice(0, 2);
}

// Generate certifications
function generateCertifications(query, topJobs) {
  const certifications = [];
  
  const jobTitles = topJobs.map(job => job.job_title?.toLowerCase() || '').join(' ');
  const jobDescriptions = topJobs.map(job => job.job_description?.toLowerCase() || '').join(' ');
  const combinedText = jobTitles + ' ' + jobDescriptions;
  
  // Healthcare Certifications
  if (combinedText.includes('health') || combinedText.includes('medical') || combinedText.includes('care')) {
    certifications.push({
      title: 'Certified Healthcare Administrative Professional (cHAP)',
      organization: 'National Association of Healthcare Access Management',
      type: 'Professional Certification',
      duration: '3-6 months prep',
      cost: '$300-500',
      description: 'Industry-recognized certification for healthcare administration professionals.',
      searchQuery: 'cHAP certification healthcare administration'
    });
  }
  
  // Technology Certifications
  if (combinedText.includes('software') || combinedText.includes('data') || combinedText.includes('cloud') || combinedText.includes('tech')) {
    certifications.push({
      title: 'AWS Certified Solutions Architect',
      organization: 'Amazon Web Services',
      type: 'Cloud Certification',
      duration: '3-6 months prep',
      cost: '$150 exam fee',
      description: 'Industry-standard certification for cloud architecture and AWS services.',
      searchQuery: 'AWS solutions architect certification'
    });
    
    certifications.push({
      title: 'Google Data Analytics Professional Certificate',
      organization: 'Google Career Certificates',
      type: 'Professional Certificate',
      duration: '3-6 months',
      cost: '$39/month (Coursera)',
      description: 'Entry-level data analytics skills and tools certification.',
      searchQuery: 'Google data analytics certificate Coursera'
    });
  }
  
  // Business Certifications
  if (combinedText.includes('business') || combinedText.includes('finance') || combinedText.includes('project') || combinedText.includes('manager')) {
    certifications.push({
      title: 'Project Management Professional (PMP)',
      organization: 'Project Management Institute',
      type: 'Professional Certification',
      duration: '3-6 months prep',
      cost: '$555 exam fee',
      description: 'Gold standard certification for project management professionals.',
      searchQuery: 'PMP certification project management'
    });
  }
  
  // Marketing Certifications
  if (combinedText.includes('marketing') || combinedText.includes('sales') || combinedText.includes('digital')) {
    certifications.push({
      title: 'Google Ads Certification',
      organization: 'Google Skillshop',
      type: 'Digital Marketing Certification',
      duration: '1-2 months',
      cost: 'Free',
      description: 'Official Google certification for advertising and digital marketing.',
      searchQuery: 'Google Ads certification free'
    });
  }
  
  return certifications.slice(0, 2); // Return top 2 most relevant
}

// Generate compact education HTML
function generateEducationHTML(query, topJobs) {
  const programs = generateUniversityPrograms(query, topJobs);
  
  if (programs.length === 0) {
    programs.push({
      title: 'Bachelor of Science in Business Administration',
      school: 'Southern New Hampshire University',
      type: 'Bachelor\'s Degree',
      duration: '4 years',
      format: 'Online',
      description: 'Flexible degree program with various concentration options.',
      searchQuery: 'business administration degree online'
    });
  }
  
  let html = `
    <div class="bg-white rounded-md shadow-md overflow-hidden">
      <div class="p-2 bg-purple-50 border-b border-purple-100">
        <h3 class="text-sm font-semibold text-purple-700">Education Pathways</h3>
        <p class="text-xs text-gray-600">Degree programs for this field</p>
      </div>
      <div class="p-2 space-y-2 max-h-[200px] overflow-y-auto">
  `;
  
  programs.forEach(program => {
    html += `
      <div class="border border-gray-200 rounded p-2 hover:border-purple-200 transition-colors">
        <div class="flex justify-between items-start mb-1">
          <span class="text-xs font-medium px-1 py-0.5 rounded-full ${
            program.type.includes('Bachelor') ? 'bg-blue-100 text-blue-800' : 
            program.type.includes('Master') ? 'bg-green-100 text-green-800' :
            'bg-orange-100 text-orange-800'
          }">${program.type}</span>
          <span class="text-xs text-gray-500">${program.format}</span>
        </div>
        
        <h4 class="font-medium text-gray-900 text-xs mb-1">${program.title}</h4>
        <p class="text-xs text-gray-600 mb-1">${program.school}</p>
        <p class="text-xs text-gray-600 mb-1 line-clamp-2">${program.description}</p>
        
        <div class="flex justify-between items-center">
          <span class="text-xs text-gray-500">${program.duration}</span>
          <a href="https://www.google.com/search?q=${encodeURIComponent(program.searchQuery)}" 
             target="_blank" 
             rel="noopener noreferrer" 
             class="inline-flex items-center px-2 py-1 border border-purple-300 text-xs leading-3 font-medium rounded-md text-purple-700 bg-purple-50 hover:bg-purple-100">
            Find Program
            <svg xmlns="http://www.w3.org/2000/svg" class="h-2 w-2 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        </div>
      </div>
    `;
  });
  
  html += `
      </div>
      <div class="p-1 bg-gray-50 border-t text-center">
        <a href="https://www.google.com/search?q=${encodeURIComponent(query + ' degree programs online')}" 
           target="_blank" 
           class="text-xs text-purple-600 hover:underline">
          Explore more programs →
        </a>
      </div>
    </div>
  `;
  
  return html;
}

// Generate compact certification HTML
function generateCertificationHTML(query, topJobs) {
  const certifications = generateCertifications(query, topJobs);
  
  if (certifications.length === 0) {
    certifications.push({
      title: 'Google Career Certificate Program',
      organization: 'Google Career Certificates',
      type: 'Professional Certificate',
      duration: '3-6 months',
      cost: '$39/month',
      description: 'Job-ready skills in high-growth fields.',
      searchQuery: 'Google career certificates'
    });
  }
  
  let html = `
    <div class="bg-white rounded-md shadow-md overflow-hidden">
      <div class="p-2 bg-emerald-50 border-b border-emerald-100">
        <h3 class="text-sm font-semibold text-emerald-700">Professional Certifications</h3>
        <p class="text-xs text-gray-600">Industry credentials to boost your profile</p>
      </div>
      <div class="p-2 space-y-2 max-h-[200px] overflow-y-auto">
  `;
  
  certifications.forEach(cert => {
    const isFree = cert.cost.toLowerCase().includes('free');
    const costColor = isFree ? 'text-green-600' : 'text-gray-600';
    
    html += `
      <div class="border border-gray-200 rounded p-2 hover:border-emerald-200 transition-colors">
        <div class="flex justify-between items-start mb-1">
          <span class="text-xs font-medium px-1 py-0.5 rounded-full ${
            cert.type.includes('Professional') ? 'bg-blue-100 text-blue-800' :
            cert.type.includes('Cloud') ? 'bg-purple-100 text-purple-800' :
            'bg-green-100 text-green-800'
          }">${cert.type}</span>
          <span class="text-xs ${costColor} font-medium">${cert.cost}</span>
        </div>
        
        <h4 class="font-medium text-gray-900 text-xs mb-1">${cert.title}</h4>
        <p class="text-xs text-gray-600 mb-1">${cert.organization}</p>
        <p class="text-xs text-gray-600 mb-1 line-clamp-2">${cert.description}</p>
        
        <div class="flex justify-between items-center">
          <span class="text-xs text-gray-500">${cert.duration}</span>
          <a href="https://www.google.com/search?q=${encodeURIComponent(cert.searchQuery)}" 
             target="_blank" 
             rel="noopener noreferrer" 
             class="inline-flex items-center px-2 py-1 border border-emerald-300 text-xs leading-3 font-medium rounded-md text-emerald-700 bg-emerald-50 hover:bg-emerald-100">
            Learn More
            <svg xmlns="http://www.w3.org/2000/svg" class="h-2 w-2 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        </div>
      </div>
    `;
  });
  
  html += `
      </div>
    </div>
  `;
  
  return html;
}

// Main education content generator
function generateEducationContent(query, topJobs) {
  try {
    if (!query || typeof query !== 'string' || query.trim() === '') {
      return '';
    }
    
    const universityHTML = generateEducationHTML(query, topJobs);
    const certificationHTML = generateCertificationHTML(query, topJobs);
    
    return `
      <div class="space-y-3">
        ${universityHTML}
        ${certificationHTML}
      </div>
    `;
  } catch (error) {
    console.error('Error generating education content:', error);
    return '';
  }
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

  console.log('--- PassionPay API /api/search ---');
  const { query, remote, minSalary } = req.query;
  console.log(`Received search query: "${query}", remote: ${remote}, minSalary: ${minSalary}`);
  console.log('Environment Variables Check:');
  console.log(`GCP_PROJECT_ID: ${process.env.GCP_PROJECT_ID}`);
  console.log(`GCP_LOCATION: ${process.env.GCP_LOCATION}`);
  console.log(`GCP_EMBEDDING_MODEL: ${process.env.GCP_EMBEDDING_MODEL}`);
  console.log(`MONGODB_URI (first 10 chars): ${process.env.MONGODB_URI ? process.env.MONGODB_URI.substring(0, 10) + '...' : 'Not set'}`);
  console.log(`MONGO_DATABASE_NAME: ${MONGO_DATABASE_NAME}`);
  console.log(`COLLECTION_NAME: ${COLLECTION_NAME}`);
  console.log(`VECTOR_INDEX_NAME: ${VECTOR_INDEX_NAME}`);
  console.log(`EMBEDDING_FIELD_NAME: ${EMBEDDING_FIELD_NAME}`);
  console.log(`GOOGLE_CREDENTIALS set: ${!!process.env.GOOGLE_CREDENTIALS}`);
  console.log(`GOOGLE_APPLICATION_CREDENTIALS_JSON set: ${!!process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON}`);

  if (!PROJECT_ID) {
    console.error('CRITICAL: GCP_PROJECT_ID is not defined. Aborting search.');
    return res.status(500).json({ error: 'Server configuration error: GCP_PROJECT_ID missing.' });
  }
  if (!MONGODB_URI) {
    console.error('CRITICAL: MONGODB_URI is not defined. Aborting search.');
    return res.status(500).json({ error: 'Server configuration error: MONGODB_URI missing.' });
  }
  if (!predictionServiceClient) {
    console.error('CRITICAL: PredictionServiceClient is not initialized. Aborting search.');
    return res.status(500).json({ error: 'Server configuration error: PredictionServiceClient failed to initialize.' });
  }
  console.log('Initial checks passed. Proceeding with search logic.');


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
    
    // Generate YouTube and Education content
    let youtubeHtml = '';
    let educationHtml = '';
    
    if (finalResults.length > 0) {
      try {
        const topJobTitle = finalResults[0].job_title || '';
        const videoSearchTerm = topJobTitle ? topJobTitle : query;
        youtubeHtml = generateYouTubePlaceholder(videoSearchTerm);
        educationHtml = generateEducationContent(query, finalResults);
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
          ${educationHtml}
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