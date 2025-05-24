require('dotenv').config();
const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const aiplatform = require('@google-cloud/aiplatform'); // Import for Vertex AI embeddings

// Destructure the necessary components for embeddings
const { PredictionServiceClient } = aiplatform.v1;
const { helpers } = aiplatform;

// MongoDB Configuration
const MONGODB_URI = process.env.MONGODB_URI;
const MONGO_DATABASE_NAME = process.env.MONGO_DATABASE_NAME || 'passion_pay_db';
const MONGO_COLLECTION_NAME = 'job_salaries'; // Use the same collection as your existing search implementation

// File paths
const DATA_DIR = path.join(__dirname, '..', 'data', 'raw');
const POSTINGS_FILE = path.join(DATA_DIR, 'postings.csv');

// Import settings for full dataset
const MAX_JOBS = Number.MAX_SAFE_INTEGER; // No limit - import all jobs with salary data
const DELAY_MS = 100; // Delay between batches to prevent overwhelming MongoDB
const BATCH_SIZE = 20; // Small batch size for reliability
const SAVE_PROGRESS_INTERVAL = 500; // Save progress every 500 imported jobs
const EMBEDDING_SAMPLE_RATE = 10; // Generate embeddings for 1 in every 10 jobs to prevent rate limiting

// Vertex AI Configuration for embeddings (from your successful integration)
const PROJECT_ID = process.env.GCP_PROJECT_ID;
const LOCATION = process.env.GCP_LOCATION || 'us-central1';
const EMBEDDING_MODEL = process.env.GCP_EMBEDDING_MODEL || 'text-embedding-005';

// Add a delay function
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Progress tracking functions
async function saveProgress(lastProcessedId, processedCount, importedCount) {
    const progressFile = path.join(__dirname, 'linkedin_import_progress.json');
    const progress = {
        lastProcessedId,
        processedCount,
        importedCount,
        timestamp: new Date().toISOString()
    };
    
    await fs.promises.writeFile(progressFile, JSON.stringify(progress, null, 2));
    console.log(`Progress saved: Processed ${processedCount}, imported ${importedCount}, last ID: ${lastProcessedId}`);
}

async function loadProgress() {
    const progressFile = path.join(__dirname, 'linkedin_import_progress.json');
    
    try {
        if (fs.existsSync(progressFile)) {
            const data = await fs.promises.readFile(progressFile, 'utf8');
            const progress = JSON.parse(data);
            console.log(`Resuming from previous import: Processed ${progress.processedCount}, imported ${progress.importedCount}`);
            return progress;
        }
    } catch (error) {
        console.log('No valid progress file found, starting from the beginning');
    }
    
    return { lastProcessedId: null, processedCount: 0, importedCount: 0 };
}

// Initialize Vertex AI client for embeddings
let predictionServiceClient;
try {
    if (PROJECT_ID) {
        const clientOptions = { apiEndpoint: `${LOCATION}-aiplatform.googleapis.com` };
        predictionServiceClient = new PredictionServiceClient(clientOptions);
        console.log('PredictionServiceClient initialized for embeddings.');
    } else {
        console.warn('Warning: GCP_PROJECT_ID is not set in .env. Embeddings will be skipped.');
    }
} catch (error) {
    console.error('Error initializing PredictionServiceClient:', error);
}

// Function to generate embeddings using Vertex AI (based on your successful implementation)
async function getEmbedding(textToEmbed) {
    if (!predictionServiceClient) {
        console.warn('Skipping embedding generation as PredictionServiceClient is not initialized.');
        return null;
    }

    try {
        const endpoint = `projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${EMBEDDING_MODEL}`;
        
        // Construct the instance payload based on your successful implementation
        const instances = [
            helpers.toValue({
                content: textToEmbed,
                task_type: "RETRIEVAL_DOCUMENT" // From your successful implementation
            })
        ];

        // Construct the parameters payload
        const parameters = helpers.toValue({
            autoTruncate: true // From your successful implementation
        });

        const request = {
            endpoint,
            instances,
            parameters,
        };

        // Call the Vertex AI API
        const [response] = await predictionServiceClient.predict(request);
        
        if (response && response.predictions && response.predictions.length > 0) {
            // Parse the embedding from the response as you successfully did before
            const firstPredictionStruct = response.predictions[0];
            const predictionJS = helpers.fromValue(firstPredictionStruct);
            
            if (predictionJS && predictionJS.embeddings && predictionJS.embeddings.values) {
                return predictionJS.embeddings.values;
            }
        }
        console.warn('No embeddings found in response');
        return null;
    } catch (error) {
        console.error('Error generating embedding:', error);
        return null;
    }
}

// Connect to MongoDB
async function connectToMongoDB() {
    if (!MONGODB_URI) {
        throw new Error('MONGODB_URI is not defined in your .env file.');
    }

    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    console.log('Connected successfully to MongoDB.');
    return client;
}

// Create indexes for searching
async function createIndexes(db) {
    const collection = db.collection(MONGO_COLLECTION_NAME);
    
    try {
        // Text index on job title for searching
        await collection.createIndex({ 
            job_title: "text"
        });
        
        // Index for job_id to prevent duplicates
        await collection.createIndex({ job_id: 1 }, { unique: true });
        
        // Index for sorting by salary
        await collection.createIndex({ normalized_salary: -1 });
        
        // Index for filtering by location
        await collection.createIndex({ location: 1 });
        
        console.log('Indexes created successfully.');
    } catch (error) {
        console.error('Error creating indexes:', error);
    }
}

// Import jobs with minimal fields
async function importJobs(db) {
    const collection = db.collection(MONGO_COLLECTION_NAME);
    let batch = [];
    let lastJobId = null;
    
    // Load progress if any
    const progress = await loadProgress();
    let processedCount = progress.processedCount;
    let importedCount = progress.importedCount;
    let errorCount = 0;
    let skipMode = !!progress.lastProcessedId;
    
    console.log(`Starting import from ${skipMode ? 'previous position' : 'beginning'}`);
    
    // Create a stream to read the CSV file
    const stream = fs.createReadStream(POSTINGS_FILE)
        .pipe(csv());
    
    // Process jobs in small batches
    for await (const row of stream) {
        // Keep track of the last job ID processed
        lastJobId = row.job_id;
        
        // Skip until we reach the last processed ID if resuming
        if (skipMode) {
            if (row.job_id === progress.lastProcessedId) {
                skipMode = false;
                console.log(`Found resume point at job ID ${row.job_id}, starting import...`);
            }
            continue; // Skip this row if still in skip mode
        }
        
        processedCount++;
        
        // Skip jobs without salary data
        if (!row.normalized_salary && !row.min_salary && !row.max_salary && !row.med_salary) {
            continue;
        }
        
        // Only process up to the maximum number of jobs
        if (importedCount >= MAX_JOBS) {
            console.log(`Reached maximum job limit (${MAX_JOBS}). Stopping import.`);
            break;
        }
        
        // Create a document with fields matching your existing schema
        const jobDocument = {
            job_id: row.job_id,
            job_title: row.title, // This matches your existing field for vector search
            company_name: row.company_name,
            location: row.location,
            salary_min: parseFloat(row.min_salary) || null,
            salary_median: parseFloat(row.med_salary) || null,
            salary_max: parseFloat(row.max_salary) || null,
            salary_currency: row.currency || '',
            salary_period: row.pay_period || '',
            normalized_salary: parseFloat(row.normalized_salary) || null,
            work_type: row.formatted_work_type || '',
            remote: row.remote_allowed === 'true',
            experience_level: row.formatted_experience_level || '',
            source: 'linkedin',
            import_date: new Date()
        };
        
        // Generate embedding for job title if applicable (same approach you used in search.js)
        if (processedCount % EMBEDDING_SAMPLE_RATE === 0 && predictionServiceClient) {
            try {
                // Get embedding for job title using your successful implementation pattern
                const embedding = await getEmbedding(row.title);
                if (embedding) {
                    // Use the same field name as in your successful vector search implementation
                    jobDocument.job_title_embedding = embedding;
                }
            } catch (embeddingError) {
                console.error(`Error generating embedding for job ${row.job_id}:`, embeddingError.message);
            }
        }
        
        // Add to batch
        batch.push(jobDocument);
        
        // Process batch if it reaches the batch size
        if (batch.length >= BATCH_SIZE) {
            try {
                // Add delay to prevent overwhelming MongoDB
                await delay(DELAY_MS);
                
                // Insert batch
                await collection.insertMany(batch, { ordered: false });
                importedCount += batch.length;
                
                // Log progress
                console.log(`Imported ${importedCount} jobs (processed ${processedCount})...`);
                
                // Save progress periodically
                if (importedCount % SAVE_PROGRESS_INTERVAL === 0) {
                    await saveProgress(lastJobId, processedCount, importedCount);
                }
                
                // Clear batch
                batch = [];
            } catch (error) {
                // Some documents might be duplicates
                if (error.writeErrors) {
                    const successfulInserts = batch.length - error.writeErrors.length;
                    importedCount += successfulInserts;
                    errorCount += error.writeErrors.length;
                    console.log(`Inserted ${successfulInserts} documents, skipped ${error.writeErrors.length} duplicates.`);
                } else {
                    console.error('Error inserting batch:', error);
                    errorCount += batch.length;
                }
                
                // Clear batch even on error
                batch = [];
            }
        }
    }
    
    // Process any remaining documents in the batch
    if (batch.length > 0) {
        try {
            await collection.insertMany(batch, { ordered: false });
            importedCount += batch.length;
        } catch (error) {
            if (error.writeErrors) {
                const successfulInserts = batch.length - error.writeErrors.length;
                importedCount += successfulInserts;
                errorCount += error.writeErrors.length;
            } else {
                errorCount += batch.length;
            }
        }
    }
    
    // Final progress save
    await saveProgress(lastJobId, processedCount, importedCount);
    
    console.log(`Import completed. Processed ${processedCount} jobs, imported ${importedCount}, errors: ${errorCount}.`);
    return importedCount;
}

// Main execution function
async function main() {
    let client;
    
    try {
        // Connect to MongoDB
        client = await connectToMongoDB();
        const db = client.db(MONGO_DATABASE_NAME);
        
        // Create collection if it doesn't exist
        const collections = await db.listCollections({ name: MONGO_COLLECTION_NAME }).toArray();
        if (collections.length === 0) {
            console.log(`Creating collection ${MONGO_COLLECTION_NAME}...`);
            await db.createCollection(MONGO_COLLECTION_NAME);
        }
        
        // Create indexes
        console.log('Creating indexes...');
        await createIndexes(db);
        
        // Import jobs
        console.log(`Starting import of up to ${MAX_JOBS} jobs with minimal fields...`);
        const importedCount = await importJobs(db);
        
        console.log(`Import completed. ${importedCount} jobs imported.`);
    } catch (error) {
        console.error('Error during import:', error);
    } finally {
        if (client) {
            await client.close();
            console.log('MongoDB connection closed.');
        }
    }
}

// Run the import process
main();
