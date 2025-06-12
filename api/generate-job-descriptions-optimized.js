import fs from 'fs';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function generateJobDescriptionsOptimized() {
  try {
    console.log('STEP 2: GENERATING JOB DESCRIPTIONS (OPTIMIZED)');
    
    if (!fs.existsSync('jobs_needing_descriptions.json')) {
      console.log('jobs_needing_descriptions.json not found!');
      return;
    }
    
    const allJobs = JSON.parse(fs.readFileSync('jobs_needing_descriptions.json', 'utf8'));
    console.log(`Total jobs found: ${allJobs.length}`);
    
    // Process first 1000 jobs for testing
    const jobs = allJobs.slice(0, 1000);
    console.log(`Processing first ${jobs.length} jobs`);
    
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const jobsWithDescriptions = [];
    let successCount = 0;
    let errorCount = 0;
    
    const batchSize = 10;
    const delay = 1000;
    
    for (let i = 0; i < jobs.length; i += batchSize) {
      const batch = jobs.slice(i, i + batchSize);
      const batchNum = Math.floor(i/batchSize) + 1;
      const totalBatches = Math.ceil(jobs.length/batchSize);
      
      console.log(`Processing batch ${batchNum}/${totalBatches} (${batch.length} jobs)`);
      
      const batchPromises = batch.map(async (job) => {
        try {
          const prompt = `Write a 100-word professional job description for:
Title: ${job.job_title}
Company: ${job.company_name || 'Company'}
Location: ${job.location || 'Remote'}

Include: responsibilities, requirements, qualifications.`;

          const result = await model.generateContent(prompt);
          const description = result.response.text();
          
          return {
            ...job,
            job_description: description.trim()
          };
          
        } catch (error) {
          console.log(`Error for ${job.job_title}: ${error.message.substring(0, 50)}...`);
          return {
            ...job,
            job_description: `${job.company_name || 'Our company'} is seeking a ${job.job_title} for our ${job.location || 'team'}. This role involves key responsibilities in ${job.job_title.toLowerCase()} functions. Requirements include relevant experience and skills. We offer competitive compensation and growth opportunities.`
          };
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      
      // Count results
      batchResults.forEach(job => {
        if (job.job_description.length > 50) {
          successCount++;
        } else {
          errorCount++;
        }
      });
      
      jobsWithDescriptions.push(...batchResults);
      
      // Show progress
      const remainingBatches = totalBatches - batchNum;
      const etaMinutes = Math.round((remainingBatches * (batchSize + delay/1000)) / 60);
      console.log(`Progress: ${successCount}/${jobs.length} complete | ETA: ${etaMinutes} min`);
      
      // Delay between batches
      if (i + batchSize < jobs.length) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
      // Save progress every 50 batches
      if (batchNum % 50 === 0) {
        fs.writeFileSync('jobs_with_descriptions_partial.json', JSON.stringify(jobsWithDescriptions, null, 2));
        console.log(`Progress saved (${jobsWithDescriptions.length} jobs)`);
      }
    }
    
    // Save final results
    fs.writeFileSync('jobs_with_descriptions.json', JSON.stringify(jobsWithDescriptions, null, 2));
    
    console.log('DESCRIPTION GENERATION COMPLETE');
    console.log(`Successfully processed: ${successCount} jobs`);
    console.log(`Fallbacks used: ${errorCount} jobs`);
    console.log('Saved to: jobs_with_descriptions.json');
    
    if (allJobs.length > jobs.length) {
      console.log(`NOTE: This was a test run (${jobs.length}/${allJobs.length} jobs)`);
      console.log('To process all jobs, modify the slice(0, 1000) line');
    }
    
    console.log('Ready for Step 3 (Generate Embeddings)');
    
    return jobsWithDescriptions;
    
  } catch (error) {
    console.error('Generation error:', error.message);
  }
}

generateJobDescriptionsOptimized();