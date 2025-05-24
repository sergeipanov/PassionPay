require('dotenv').config();
const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

// MongoDB Configuration
const MONGODB_URI = process.env.MONGODB_URI;
const MONGO_DATABASE_NAME = process.env.MONGO_DATABASE_NAME || 'passion_pay_db';
const MONGO_COLLECTION_NAME = 'linkedin_jobs'; // New collection for LinkedIn data

// File paths
const DATA_DIR = path.join(__dirname, '..', 'data', 'raw');
const POSTINGS_FILE = path.join(DATA_DIR, 'postings.csv');

// Import settings
const MAX_JOBS = 500; // Only import a subset of jobs for now
const DELAY_MS = 100; // Delay between operations to avoid overwhelming MongoDB

// Add a delay function
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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

// Create text index for searching
async function createIndexes(db) {
    const collection = db.collection(MONGO_COLLECTION_NAME);
    
    try {
        // Simple text index on title and description
        await collection.createIndex({ 
            title: "text", 
            description: "text" 
        });
        
        // Index for job_id to prevent duplicates
        await collection.createIndex({ job_id: 1 }, { unique: true });
        
        // Index for sorting by salary
        await collection.createIndex({ normalized_salary: -1 });
        
        console.log('Indexes created successfully.');
    } catch (error) {
        console.error('Error creating indexes:', error);
    }
}

// Import a subset of LinkedIn jobs
async function importLinkedInJobs(db) {
    const collection = db.collection(MONGO_COLLECTION_NAME);
    let processedCount = 0;
    let importedCount = 0;
    let errorCount = 0;
    
    // Create a stream to read the CSV file
    const stream = fs.createReadStream(POSTINGS_FILE)
        .pipe(csv());
    
    // Process jobs one by one
    for await (const row of stream) {
        processedCount++;
        
        // Only process a subset of jobs
        if (processedCount > MAX_JOBS) {
            console.log(`Reached maximum job limit (${MAX_JOBS}). Stopping import.`);
            break;
        }
        
        // Create a document with essential fields only
        const jobDocument = {
            job_id: row.job_id,
            title: row.title,
            description: row.description ? row.description.substring(0, 1000) : '', // Limit description length
            company_name: row.company_name,
            location: row.location,
            formatted_experience_level: row.formatted_experience_level || '',
            formatted_work_type: row.formatted_work_type || '',
            remote_allowed: row.remote_allowed === 'true',
            min_salary: parseFloat(row.min_salary) || null,
            med_salary: parseFloat(row.med_salary) || null,
            max_salary: parseFloat(row.max_salary) || null,
            currency: row.currency || '',
            pay_period: row.pay_period || '',
            normalized_salary: parseFloat(row.normalized_salary) || null,
            import_date: new Date()
        };
        
        try {
            // Add delay to prevent overwhelming MongoDB
            await delay(DELAY_MS);
            
            // Insert document individually
            await collection.insertOne(jobDocument);
            importedCount++;
            
            // Log progress
            if (importedCount % 10 === 0) {
                console.log(`Imported ${importedCount} LinkedIn jobs (processed ${processedCount})...`);
            }
        } catch (error) {
            errorCount++;
            
            // Don't log every error, just count them
            if (errorCount % 10 === 0) {
                console.log(`Encountered ${errorCount} errors during import.`);
            }
        }
    }
    
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
        
        // Import LinkedIn jobs
        console.log(`Starting import of up to ${MAX_JOBS} LinkedIn jobs...`);
        const importedCount = await importLinkedInJobs(db);
        
        console.log(`Import completed. ${importedCount} LinkedIn jobs imported.`);
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
