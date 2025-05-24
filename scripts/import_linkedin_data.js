require('dotenv').config();
const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { VertexAI } = require('@google-cloud/vertexai');


// MongoDB Configuration
const MONGODB_URI = process.env.MONGODB_URI;
const MONGO_DATABASE_NAME = process.env.MONGO_DATABASE_NAME || 'passion_pay_db';
const MONGO_COLLECTION_NAME = 'linkedin_jobs'; // New collection for LinkedIn data
const BATCH_SIZE = 10; // Even smaller batch size to prevent memory issues
const DELAY_BETWEEN_BATCHES = 1000; // Longer delay between batches
const MAX_DOCUMENTS = 1000; // Process fewer documents per run to prevent memory issues
const EMBEDDING_SAMPLE_RATE = 20; // Generate embeddings for fewer documents (1 in 20)

// Set Node.js memory limits higher (if possible)
// This only works if the system has enough memory available
try {
    // Increase max old space size to 4GB if running with --max-old-space-size=4096
    console.log(`Current memory limits: ${process.memoryUsage().heapTotal / 1024 / 1024} MB`);
} catch (e) {
    console.log('Unable to log memory usage');
}

// Vertex AI Configuration for embeddings
const GCP_PROJECT = process.env.GCP_PROJECT_ID;
const GCP_LOCATION = process.env.GCP_LOCATION || 'us-central1';
const EMBEDDING_MODEL = process.env.GCP_EMBEDDING_MODEL || 'text-embedding-005';

// File paths
const DATA_DIR = path.join(__dirname, '..', 'data', 'raw');
const POSTINGS_FILE = path.join(DATA_DIR, 'postings.csv');
const COMPANIES_FILE = path.join(DATA_DIR, 'companies', 'companies.csv');
const JOB_SKILLS_FILE = path.join(DATA_DIR, 'jobs', 'job_skills.csv');
const SALARIES_FILE = path.join(DATA_DIR, 'jobs', 'salaries.csv');

// Initialize Vertex AI
let vertexAI;
let predictionServiceClient;
if (GCP_PROJECT) {
    // Import the PredictionServiceClient for text embeddings
    const { PredictionServiceClient } = require('@google-cloud/aiplatform').v1;
    const clientOptions = { apiEndpoint: `${GCP_LOCATION}-aiplatform.googleapis.com` };
    predictionServiceClient = new PredictionServiceClient(clientOptions);
    console.log('PredictionServiceClient initialized for embeddings.');
} else {
    console.warn('Warning: GCP_PROJECT_ID is not set in .env. Embeddings will be skipped.');
}

// Helper function to get text embedding using Vertex AI
async function getEmbedding(textToEmbed) {
    if (!predictionServiceClient) {
        console.warn('Skipping embedding generation as PredictionServiceClient is not initialized.');
        return null;
    }

    try {
        const endpoint = `projects/${GCP_PROJECT}/locations/${GCP_LOCATION}/publishers/google/models/${EMBEDDING_MODEL}`;
        
        // Prepare the request with task_type inside the instance
        const instances = [{
            content: textToEmbed,
            task_type: "RETRIEVAL_DOCUMENT"
        }].map(instance => {
            // Convert to Vertex AI format
            return {
                structValue: {
                    fields: Object.entries(instance).reduce((acc, [key, value]) => {
                        acc[key] = { stringValue: value };
                        return acc;
                    }, {})
                }
            };
        });

        // Parameters for the embedding
        const parameters = {
            structValue: {
                fields: {
                    autoTruncate: { boolValue: true }
                }
            }
        };

        const request = {
            endpoint,
            instances,
            parameters
        };

        // Call the Vertex AI API
        const [response] = await predictionServiceClient.predict(request);
        
        if (response && response.predictions && response.predictions.length > 0) {
            // Parse the embedding from the response
            const prediction = response.predictions[0];
            const embeddingValues = prediction.structValue.fields.embeddings.structValue.fields.values.listValue.values;
            const embedding = embeddingValues.map(v => v.numberValue);
            return embedding;
        } else {
            console.error('No predictions found in embedding response');
            return null;
        }
    } catch (error) {
        console.error('Error getting embedding:', error);
        return null;
    }
}

// Function to connect to MongoDB
async function connectToMongoDB() {
    if (!MONGODB_URI) {
        throw new Error('MONGODB_URI is not defined in your .env file.');
    }

    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    console.log('Connected successfully to MongoDB.');
    return client;
}

// Function to create indexes on the collection
async function createIndexes(db) {
    const collection = db.collection(MONGO_COLLECTION_NAME);
    
    // Create text indexes for regular search
    await collection.createIndex({ 
        title: "text", 
        description: "text",
        skills: "text"
    });
    
    // Create other useful indexes
    await collection.createIndex({ job_id: 1 }, { unique: true });
    await collection.createIndex({ company_name: 1 });
    await collection.createIndex({ location: 1 });
    await collection.createIndex({ formatted_experience_level: 1 });
    
    // Create index on salary for sorting
    await collection.createIndex({ normalized_salary: -1 });
    
    // Attempt to create vector index if supported
    try {
        await collection.createIndex({ job_title_embedding: "vector" }, { 
            name: "linkedin_job_title_vector_index",
            vectorSearchOptions: { type: "hnsw", dimensions: 768 }
        });
        console.log('Vector index created successfully.');
    } catch (error) {
        console.log('Vector index creation failed. This is expected if your MongoDB instance doesn\'t support vector search.');
        console.log('You can still use regular text search. To use vector search, upgrade to MongoDB Atlas with Vector Search enabled.');
    }
    
    console.log('Standard indexes created successfully.');
}

// Function to get job skills for a specific job ID (more memory efficient)
async function getJobSkills(jobId) {
    return new Promise((resolve, reject) => {
        const skills = [];
        let found = false;
        
        fs.createReadStream(JOB_SKILLS_FILE)
            .pipe(csv())
            .on('data', (row) => {
                if (row.job_id === jobId) {
                    found = true;
                    skills.push(row.skill_abr);
                }
            })
            .on('end', () => {
                resolve(skills);
            })
            .on('error', (error) => {
                reject(error);
            });
    });
}

// Function to process a limited sample of job skills for initial load
// This avoids loading the entire dataset into memory
async function loadJobSkillsSample() {
    console.log('Loading a sample of job skills data...');
    const jobSkillsMap = new Map();
    let processedCount = 0;
    const MAX_SKILLS_SAMPLE = 5000; // Only preload a limited number of job skills
    
    return new Promise((resolve, reject) => {
        fs.createReadStream(JOB_SKILLS_FILE)
            .pipe(csv())
            .on('data', (row) => {
                if (processedCount < MAX_SKILLS_SAMPLE) {
                    const jobId = row.job_id;
                    const skill = row.skill_abr;
                    
                    if (!jobSkillsMap.has(jobId)) {
                        jobSkillsMap.set(jobId, []);
                    }
                    
                    jobSkillsMap.get(jobId).push(skill);
                    processedCount++;
                }
            })
            .on('end', () => {
                console.log(`Loaded skills sample for ${jobSkillsMap.size} jobs.`);
                resolve(jobSkillsMap);
            })
            .on('error', (error) => {
                reject(error);
            });
    });
}

// Function to process companies data
async function loadCompanies() {
    const companiesMap = new Map();
    
    return new Promise((resolve, reject) => {
        fs.createReadStream(COMPANIES_FILE)
            .pipe(csv())
            .on('data', (row) => {
                const companyId = row.company_id;
                companiesMap.set(companyId, {
                    company_id: companyId,
                    name: row.name,
                    description: row.description,
                    company_size: row.company_size,
                    state: row.state,
                    country: row.country,
                    city: row.city,
                    zip_code: row.zip_code,
                    address: row.address,
                    url: row.url
                });
            })
            .on('end', () => {
                console.log(`Loaded data for ${companiesMap.size} companies.`);
                resolve(companiesMap);
            })
            .on('error', (error) => {
                reject(error);
            });
    });
}

// Function to add delay between operations
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Function to check if a job ID already exists in the database
async function checkJobExists(collection, jobId) {
    const existingJob = await collection.findOne({ job_id: jobId }, { projection: { _id: 1 } });
    return !!existingJob;
}

// Function to save progress state
async function saveProgressState(lastProcessedId, processedCount) {
    const stateFile = path.join(__dirname, 'import_progress.json');
    const state = { lastProcessedId, processedCount, timestamp: new Date().toISOString() };
    await fs.promises.writeFile(stateFile, JSON.stringify(state, null, 2));
    console.log(`Progress saved: Processed ${processedCount} jobs, last ID: ${lastProcessedId}`);
}

// Function to load progress state
async function loadProgressState() {
    const stateFile = path.join(__dirname, 'import_progress.json');
    try {
        if (fs.existsSync(stateFile)) {
            const state = JSON.parse(await fs.promises.readFile(stateFile, 'utf8'));
            console.log(`Resuming from previous run: Processed ${state.processedCount} jobs, last ID: ${state.lastProcessedId}`);
            return state;
        }
    } catch (error) {
        console.log('No valid progress state found, starting from beginning');
    }
    return { lastProcessedId: null, processedCount: 0 };
}

// Main function to import job postings
async function importJobPostings(db, jobSkillsMap, companiesMap) {
    const collection = db.collection(MONGO_COLLECTION_NAME);
    let batch = [];
    let insertedCount = 0;
    let skippedCount = 0;
    let embeddingsGenerated = 0;
    let reachedLimit = false;
    
    // Load previous progress if any
    const { lastProcessedId, processedCount: startingCount } = await loadProgressState();
    let processedCount = startingCount;
    let resumeMode = !!lastProcessedId;
    
    // Function to process a batch of documents
    const processBatch = async () => {
        if (batch.length === 0) return;
        
        try {
            // Add delay before processing the batch to prevent overwhelming MongoDB
            await delay(DELAY_BETWEEN_BATCHES);
            
            const result = await collection.insertMany(batch, { ordered: false });
            insertedCount += result.insertedCount;
            console.log(`Inserted ${result.insertedCount} documents (Total: ${insertedCount})`);
        } catch (error) {
            // Some documents might be duplicates, count successful inserts
            if (error.writeErrors) {
                const successfulInserts = batch.length - error.writeErrors.length;
                insertedCount += successfulInserts;
                console.log(`Inserted ${successfulInserts} documents (Total: ${insertedCount}), with ${error.writeErrors.length} errors`);
            } else {
                console.error('Error inserting batch:', error);
            }
        }
        
        // Save progress after each batch
        if (batch.length > 0) {
            await saveProgressState(batch[batch.length - 1].job_id, processedCount);
        }
        
        // Clear the batch
        batch = [];
    };
    
    return new Promise((resolve, reject) => {
        fs.createReadStream(POSTINGS_FILE)
            .pipe(csv())
            .on('data', async (row) => {
                // Skip rows until we reach the last processed ID in resume mode
                if (resumeMode && lastProcessedId !== row.job_id) {
                    return;
                } else if (resumeMode && lastProcessedId === row.job_id) {
                    // Found the last processed ID, exit resume mode
                    resumeMode = false;
                    return; // Skip this record as it was already processed
                }
                
                processedCount++;
                
                // Stop if we've reached the maximum document limit for this run
                if (processedCount > startingCount + MAX_DOCUMENTS && !reachedLimit) {
                    reachedLimit = true;
                    console.log(`Reached maximum document limit (${MAX_DOCUMENTS}). Will finish current batch and stop.`);
                }
                
                if (reachedLimit) {
                    return; // Skip processing more records
                }
                
                // Check if job already exists to avoid duplicates
                const exists = await checkJobExists(collection, row.job_id);
                if (exists) {
                    skippedCount++;
                    if (skippedCount % 100 === 0) {
                        console.log(`Skipped ${skippedCount} existing jobs`);
                    }
                    return;
                }
                
                // Create a document from the row with just essential fields to save memory
                const jobDocument = {
                    job_id: row.job_id,
                    title: row.title,
                    description: row.description ? row.description.substring(0, 2000) : '', // Limit description length
                    company_name: row.company_name,
                    location: row.location,
                    formatted_experience_level: row.formatted_experience_level,
                    formatted_work_type: row.formatted_work_type,
                    remote_allowed: row.remote_allowed === 'true',
                    min_salary: parseFloat(row.min_salary) || null,
                    med_salary: parseFloat(row.med_salary) || null,
                    max_salary: parseFloat(row.max_salary) || null,
                    currency: row.currency,
                    pay_period: row.pay_period,
                    normalized_salary: parseFloat(row.normalized_salary) || null,
                    import_date: new Date()
                };
                
                // Get skills from the pre-loaded map or load on demand if not found
                const skills = jobSkillsMap.get(row.job_id);
                if (skills) {
                    jobDocument.skills = skills;
                } else if (processedCount % 10 === 0) { // Only look up skills for some jobs to save resources
                    try {
                        // This will be more expensive but more memory efficient
                        const fetchedSkills = await getJobSkills(row.job_id);
                        if (fetchedSkills.length > 0) {
                            jobDocument.skills = fetchedSkills;
                        }
                    } catch (e) {
                        // If skill lookup fails, just continue without skills
                        jobDocument.skills = [];
                    }
                } else {
                    jobDocument.skills = [];
                }
                
                // Add company data if available, but keep it minimal
                if (companiesMap.has(row.company_id)) {
                    const company = companiesMap.get(row.company_id);
                    jobDocument.company_details = {
                        company_id: company.company_id,
                        name: company.name,
                        company_size: company.company_size,
                        country: company.country,
                        city: company.city
                    };
                }
                
                // Generate embedding for only a subset of jobs (1 in every X)
                if (processedCount % EMBEDDING_SAMPLE_RATE === 0) {
                    try {
                        // Create text for embedding from title and skills
                        const textForEmbedding = `${row.title} ${jobSkillsMap.get(row.job_id) ? jobSkillsMap.get(row.job_id).join(' ') : ''}`;
                        const embedding = await getEmbedding(textForEmbedding);
                        
                        if (embedding) {
                            jobDocument.job_title_embedding = embedding;
                            embeddingsGenerated++;
                            
                            if (embeddingsGenerated % 10 === 0) {
                                console.log(`Generated ${embeddingsGenerated} embeddings so far`);
                            }
                        }
                    } catch (embeddingError) {
                        console.error(`Error generating embedding for job ${row.job_id}:`, embeddingError);
                    }
                }
                
                // Add to batch
                batch.push(jobDocument);
                
                // Process batch if it reaches the batch size
                if (batch.length >= BATCH_SIZE) {
                    await processBatch();
                }
                
                // Log progress
                if (processedCount % 100 === 0) {
                    console.log(`Processed ${processedCount} job postings (Inserted: ${insertedCount}, Skipped: ${skippedCount})...`);
                }
            })
            .on('end', async () => {
                // Process any remaining documents
                await processBatch();
                console.log(`Import run completed. Processed ${processedCount} job postings. Inserted ${insertedCount} documents, skipped ${skippedCount} existing.`);
                console.log(`Generated embeddings for ${embeddingsGenerated} documents.`);
                resolve(insertedCount);
            })
            .on('error', (error) => {
                reject(error);
            });
    });
}

// Main execution function
async function main() {
    let client;
    
    try {
        // Load a sample of job skills data to reduce memory usage
        // For the rest, we'll load them on-demand
        console.log('Loading sample job skills data...');
        const jobSkillsMap = await loadJobSkillsSample();
        
        console.log('Loading companies data...');
        const companiesMap = await loadCompanies();
        
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
        
        // Run garbage collection before starting the import to free memory
        if (global.gc) {
            console.log('Running garbage collection before import...');
            global.gc();
        }
        
        // Import job postings
        console.log('Importing job postings...');
        const insertedCount = await importJobPostings(db, jobSkillsMap, companiesMap);
        
        console.log(`Import completed. ${insertedCount} documents inserted.`);
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
