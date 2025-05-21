import 'dotenv/config'; // Loads environment variables from .env
import aiplatform, { helpers } from '@google-cloud/aiplatform'; // Import the whole module and helpers

// Destructure the v1 client from the imported module
const { PredictionServiceClient } = aiplatform.v1;
// We might need helpers later for formatting input/output
// const { helpers } = aiplatform; // Already imported above with { helpers }

// Configuration for Vertex AI
const PROJECT_ID = process.env.GCP_PROJECT_ID;
const LOCATION = process.env.GCP_LOCATION || 'us-central1';
const PUBLISHER = 'google'; // Often 'google', verify if different for your model
const MODEL_ID = process.env.GCP_EMBEDDING_MODEL || 'textembedding-gecko';

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
    const embedding = await getEmbedding(query);
    console.log(`Handler: Received embedding vector of length: ${embedding.length}`);
    res.status(200).json({
      message: 'Successfully retrieved embedding from Vertex AI.',
      query: query,
      embedding_length: embedding.length, // Send length instead of full embedding for brevity in test
      // embedding: embedding // Optionally send the full embedding
    });
  } catch (error) {
    console.error('Handler: Error in getEmbedding call or processing:', error.message);
    // Check if error.message is the best thing to send, or a generic message
    res.status(500).send(`Error processing your request: ${error.message}`);
  }
}
