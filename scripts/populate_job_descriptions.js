require('dotenv').config(); // Load .env from project root
const { MongoClient } = require('mongodb');
const { VertexAI } = require('@google-cloud/vertexai'); // Changed package

// MongoDB Configuration
const MONGODB_URI = process.env.MONGODB_URI;
const MONGO_DATABASE_NAME = process.env.MONGO_DATABASE_NAME || 'passion_pay_db';
const MONGO_COLLECTION_NAME = 'job_salaries'; // Or your specific collection name

// Vertex AI Configuration
const GCP_PROJECT = process.env.GCP_PROJECT_ID; // Make sure you have GCP_PROJECT_ID in .env
const GCP_LOCATION = process.env.GCP_LOCATION || 'us-central1'; // Reverted to us-central1
// No longer using Gemini API - using local job descriptions instead

// Predefined job descriptions map - will expand based on common job titles found
const JOB_DESCRIPTIONS = {
    // Tech/Engineering roles
    'Software Engineer': 'Designs, develops, and maintains software applications using programming languages and frameworks. Tests code and fixes bugs.',
    'Data Scientist': 'Analyzes complex data to extract insights. Creates models using statistical methods and machine learning to solve business problems.',
    'Product Manager': 'Leads product development from conception to launch. Defines strategy, gathers requirements, and works with cross-functional teams.',
    'UX Designer': 'Creates intuitive user experiences. Conducts research, develops wireframes, and designs interfaces focused on usability.',
    'DevOps Engineer': 'Automates and maintains development infrastructure. Implements CI/CD pipelines and manages cloud services and deployments.',
    'AI Engineer': 'Develops and implements artificial intelligence models and algorithms. Integrates AI systems with existing infrastructure.',
    'Full Stack Developer': 'Builds both frontend and backend components of web applications. Works with various programming languages and frameworks.',
    'QA Engineer': 'Tests software for bugs and usability issues. Creates test plans, automates testing processes, and ensures quality.',
    'Frontend Developer': 'Creates user interfaces and interactive elements for websites and applications using HTML, CSS, and JavaScript.',
    'Backend Developer': 'Develops server-side logic, databases, and application architecture. Ensures performance, security, and scalability.',
    
    // Business/Finance roles
    'Financial Analyst': 'Analyzes financial data and prepares reports. Forecasts trends and evaluates investment opportunities.',
    'Marketing Manager': 'Develops marketing strategies and campaigns. Analyzes market trends and manages brand positioning.',
    'Sales Representative': 'Sells products/services to customers. Builds relationships, demonstrates products, and negotiates contracts.',
    'Business Analyst': 'Analyzes business processes and systems. Identifies improvements and translates business needs into requirements.',
    'Project Manager': 'Plans and executes projects. Sets timelines, allocates resources, and ensures deliverables meet requirements.',
    'HR Manager': 'Oversees human resources functions. Manages recruitment, employee relations, benefits, and organizational development.',
    'Operations Manager': 'Oversees daily business operations. Develops processes, manages resources, and ensures efficiency.',
    'Accountant': 'Prepares financial records and ensures compliance. Handles tax preparation, audits, and financial reporting.',
    
    // Healthcare roles
    'Registered Nurse': 'Provides patient care and administers treatments. Monitors health conditions and communicates with healthcare team.',
    'Physician': 'Diagnoses and treats illnesses and injuries. Examines patients, prescribes medications, and develops treatment plans.',
    'Pharmacist': 'Dispenses medications and provides consultation. Ensures proper dosing and prevents adverse drug interactions.',
    
    // Generic fallback for unknown roles
    'default': 'Performs specialized tasks requiring expertise in the field. Collaborates with team members to achieve organizational goals.'
};

// Initialize Vertex AI
let vertexAI;
if (GCP_PROJECT) {
    vertexAI = new VertexAI({ project: GCP_PROJECT, location: GCP_LOCATION }); // Re-enabled this line
} else {
    console.warn('Warning: GCP_PROJECT_ID is not set in .env. Description generation will be skipped.');
}

async function getUniqueJobTitles() {
    if (!MONGODB_URI) {
        console.error('Error: MONGODB_URI is not defined in your .env file.');
        process.exit(1);
    }

    const client = new MongoClient(MONGODB_URI);

    try {
        await client.connect();
        console.log('Connected successfully to MongoDB to fetch unique job titles.');

        const db = client.db(MONGO_DATABASE_NAME);
        const collection = db.collection(MONGO_COLLECTION_NAME);

        const uniqueJobTitles = await collection.distinct('job_title');
        
        console.log(`Found ${uniqueJobTitles.length} unique job titles:`);
        // console.log(uniqueJobTitles); // Uncomment to see the list

        return uniqueJobTitles;

    } catch (err) {
        console.error('Error fetching unique job titles:', err);
    } finally {
        await client.close();
        console.log('MongoDB connection closed.');
    }
}

async function generateJobDescription(jobTitle) {
    console.log(`Generating description for: "${jobTitle}"...`);
    
    // Try exact match first
    if (JOB_DESCRIPTIONS[jobTitle]) {
        const description = JOB_DESCRIPTIONS[jobTitle];
        console.log(`   -> Description for "${jobTitle}": ${description}`);
        return description;
    }
    
    // If no exact match, look for partial matches in the keys
    for (const key of Object.keys(JOB_DESCRIPTIONS)) {
        if (key !== 'default' && 
            (jobTitle.toLowerCase().includes(key.toLowerCase()) || 
             key.toLowerCase().includes(jobTitle.toLowerCase()))) {
            const description = JOB_DESCRIPTIONS[key];
            console.log(`   -> Using similar description for "${jobTitle}": ${description}`);
            return description;
        }
    }
    
    // Generate a description based on the job title if no match
    const words = jobTitle.split(/\s+/);
    if (words.length > 1) {
        // Try to match individual words
        for (const word of words) {
            if (word.length > 3) { // Only consider meaningful words
                for (const key of Object.keys(JOB_DESCRIPTIONS)) {
                    if (key !== 'default' && key.toLowerCase().includes(word.toLowerCase())) {
                        const description = JOB_DESCRIPTIONS[key];
                        console.log(`   -> Using word-matched description for "${jobTitle}": ${description}`);
                        return description;
                    }
                }
            }
        }
    }
    
    // Last resort: use the default description or generate a simple one
    const description = JOB_DESCRIPTIONS['default'];
    console.log(`   -> Using default description for "${jobTitle}": ${description}`);
    return description;
}

async function updateJobDescriptionInMongoDB(title, description) {
    if (!MONGODB_URI) {
        console.error('Error: MONGODB_URI is not defined in your .env file.');
        return false;
    }

    const client = new MongoClient(MONGODB_URI);

    try {
        await client.connect();
        const db = client.db(MONGO_DATABASE_NAME);
        const collection = db.collection(MONGO_COLLECTION_NAME);

        // Update all documents with matching job_title
        const result = await collection.updateMany(
            { job_title: title },
            { $set: { job_description: description } }
        );

        console.log(`   -> Updated ${result.modifiedCount} document(s) for "${title}"`);
        return result.modifiedCount > 0;
    } catch (err) {
        console.error(`Error updating MongoDB for "${title}":`, err);
        return false;
    } finally {
        await client.close();
    }
}

async function main() {
    const jobTitles = await getUniqueJobTitles();
    if (jobTitles && jobTitles.length > 0) {
        console.log(`\n--- Starting Job Description Generation ---`);
        let descriptionsGenerated = 0;
        let descriptionsUpdated = 0;
        
        // Process all job titles
        // For initial testing, limit to a smaller number if desired
        // const titlesToProcess = jobTitles.slice(0, 20); // Process first 20 titles
        const titlesToProcess = jobTitles; // Process all titles
        
        console.log(`Processing ${titlesToProcess.length} job titles...`);
        
        for (const title of titlesToProcess) { 
            const description = await generateJobDescription(title);
            if (description) {
                descriptionsGenerated++;
                
                // Update MongoDB with the title and description
                const updated = await updateJobDescriptionInMongoDB(title, description);
                if (updated) {
                    descriptionsUpdated++;
                }
                
                // Log progress every 10 items
                if (descriptionsGenerated % 10 === 0) {
                    console.log(`Progress: ${descriptionsGenerated}/${titlesToProcess.length} descriptions generated.`);
                }
            }
        }
        
        console.log(`\n--- Finished Job Description Generation ---`);
        console.log(`${descriptionsGenerated} descriptions were generated (out of ${titlesToProcess.length} attempted).`);
        console.log(`${descriptionsUpdated} descriptions were successfully updated in MongoDB.`);
    } else {
        console.log('No unique job titles found or an error occurred.');
    }
}

main();
