/**
 * PassionPay Job Details API - Version 1.3
 * Fetch and display full job descriptions on demand
 * Part of the job description display strategy
 * Note: This endpoint is now supplemented by client-side description toggling
 */

import 'dotenv/config';
import { MongoClient } from 'mongodb';

// MongoDB Configuration
const MONGODB_URI = process.env.MONGODB_URI;
const MONGO_DATABASE_NAME = 'passion_pay_db';
const LINKEDIN_JOBS_COLLECTION_NAME = 'all_jobs';
const TECH_JOBS_COLLECTION_NAME = 'job_salaries';

export default async function handler(req, res) {
  const { id } = req.query;
  
  if (!id) {
    return res.status(400).send('<p class="text-sm text-red-500">Job ID is required</p>');
  }
  
  try {
    console.log(`Fetching job details for job_id: ${id}`);
    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    const db = client.db(MONGO_DATABASE_NAME);
    
    // Try to find in LinkedIn jobs first
    let job = await db.collection(LINKEDIN_JOBS_COLLECTION_NAME).findOne(
      { job_id: id },
      { projection: { job_description: 1 } }
    );
    
    // If not found, try tech jobs
    if (!job) {
      job = await db.collection(TECH_JOBS_COLLECTION_NAME).findOne(
        { job_id: id },
        { projection: { job_description: 1 } }
      );
    }
    
    if (!job || !job.job_description) {
      return res.status(404).send('<p class="text-sm text-gray-500">No description available for this job.</p>');
    }
    
    // Format the description with proper line breaks and sanitization
    const formattedDescription = job.job_description
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');
    
    const html = `
      <div class="text-sm text-gray-700 border-t border-gray-200 pt-2 mt-2">
        ${formattedDescription}
        <div class="mt-2 flex justify-end">
          <button 
            class="text-xs text-gray-500 hover:underline" 
            onclick="this.closest('#job-${id}').innerHTML = ''">
            Close
          </button>
        </div>
      </div>
    `;
    
    res.setHeader('Content-Type', 'text/html');
    res.status(200).send(html);
    
    // Close the MongoDB connection
    await client.close();
    
  } catch (error) {
    console.error('Error fetching job details:', error);
    res.status(500).send('<p class="text-sm text-red-500">Error loading job description. Please try again later.</p>');
  }
}
