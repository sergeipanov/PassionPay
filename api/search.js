/**
 * Progressive Search API - Adding Real Functionality Back
 * Step by step to avoid 403 errors
 */

import { MongoClient } from 'mongodb';

// Basic Configuration
const CONFIG = {
  MONGODB_URI: process.env.MONGODB_URI,
  DATABASE_NAME: 'passion_pay_db',
  
  COLLECTIONS: {
    LINKEDIN: { name: 'all_jobs' },
    TECH: { name: 'job_salaries' }
  },
  
  SEARCH: {
    maxResults: 15,
    timeout: 20000
  }
};

// Simple Query Processing
function processQuery(query) {
  const originalQuery = query;
  let processedQuery = query.toLowerCase().trim();
  
  // Remove filler phrases
  const fillerPhrases = [
    'i love', 'i like', 'i enjoy', 'i want to', 'working with', 'work with',
    'i am interested in', 'interested in'
  ];
  
  fillerPhrases.forEach(phrase => {
    processedQuery = processedQuery.replace(new RegExp(phrase, 'g'), '');
  });
  
  // Extract keywords
  const keywords = processedQuery.split(/\s+/).filter(word => word.length > 2);
  
  // Map to job titles
  const jobMapping = {
    'data': ['data scientist', 'data analyst'],
    'healthcare': ['nurse', 'healthcare administrator', 'medical'],
    'software': ['software engineer', 'developer'],
    'finance': ['financial analyst', 'accountant'],
    'people': ['manager', 'hr specialist', 'leadership'],
    'coding': ['software engineer', 'programmer'],
    'programming': ['developer', 'software engineer']
  };
  
  const suggestedTitles = [];
  keywords.forEach(keyword => {
    if (jobMapping[keyword]) {
      suggestedTitles.push(...jobMapping[keyword]);
    }
  });
  
  return {
    originalQuery,
    processedQuery: processedQuery.trim() || originalQuery,
    keywords,
    suggestedTitles
  };
}

// MongoDB Connection
async function connectToMongoDB() {
  try {
    const client = new MongoClient(CONFIG.MONGODB_URI, {
      serverSelectionTimeoutMS: 8000,
      socketTimeoutMS: 8000
    });
    
    await client.connect();
    const db = client.db(CONFIG.DATABASE_NAME);
    return { client, db };
  } catch (error) {
    console.error('MongoDB connection failed:', error);
    throw new Error('Database connection failed');
  }
}

// Simple Text Search (no embeddings for now)
async function searchJobs(queryData, filters = {}) {
  const { db, client } = await connectToMongoDB();
  
  try {
    const results = [];
    
    // Search both collections using text search
    for (const collectionConfig of [CONFIG.COLLECTIONS.LINKEDIN, CONFIG.COLLECTIONS.TECH]) {
      try {
        const collection = db.collection(collectionConfig.name);
        
        // Build search filter
        const searchFilter = {
          $text: { $search: queryData.processedQuery }
        };
        
        // Add additional filters
        if (filters.source && filters.source !== 'all') {
          searchFilter.source = filters.source;
        }
        
        if (filters.remote !== undefined) {
          searchFilter.remote = filters.remote === 'true';
        }
        
        if (filters.minSalary) {
          const minSal = parseInt(filters.minSalary, 10);
          searchFilter.$or = [
            { salary_min: { $gte: minSal } },
            { salary_max: { $gte: minSal } },
            { normalized_salary: { $gte: minSal } }
          ];
        }
        
        const textResults = await collection
          .find(searchFilter)
          .project({
            _id: 0,
            score: { $meta: 'textScore' },
            job_id: 1,
            job_title: 1,
            company_name: 1,
            location: 1,
            salary_min: 1,
            salary_median: 1,
            salary_max: 1,
            salary_in_usd: 1,
            normalized_salary: 1,
            experience_level: 1,
            formatted_experience_level: 1,
            work_type: 1,
            formatted_work_type: 1,
            remote: 1,
            remote_allowed: 1,
            source: 1,
            job_description: 1,
            description: 1
          })
          .sort({ score: { $meta: 'textScore' } })
          .limit(10)
          .toArray();
        
        console.log(`Text search found ${textResults.length} results from ${collectionConfig.name}`);
        results.push(...textResults);
        
      } catch (collectionError) {
        console.warn(`Search failed for ${collectionConfig.name}:`, collectionError.message);
      }
    }
    
    return results;
    
  } finally {
    await client.close();
  }
}

// Enhanced Job Description
function generateJobDescription(job, queryData) {
  // Use existing description if good quality
  if (job.job_description && job.job_description.length > 50 && 
      !job.job_description.includes('join our team')) {
    return job.job_description;
  }
  
  if (job.description && job.description.length > 50 && 
      !job.description.includes('join our team')) {
    return job.description;
  }
  
  // Generate based on job title and query context
  const title = job.job_title || '';
  const company = job.company_name || 'this company';
  const titleLower = title.toLowerCase();
  
  let description = `${company} is seeking a ${title} to join our team. `;
  
  // Context-aware descriptions
  if ((titleLower.includes('data') || queryData.keywords.includes('data')) && 
      (titleLower.includes('healthcare') || queryData.keywords.includes('healthcare'))) {
    description += 'You will analyze healthcare data, work with patient information systems, and provide data-driven insights to improve healthcare outcomes. Experience with healthcare analytics and data privacy regulations preferred.';
  } else if (titleLower.includes('data') || queryData.keywords.includes('data')) {
    description += 'You will analyze complex datasets, build predictive models, and provide data-driven insights to support business decisions. Strong analytical skills and experience with data tools required.';
  } else if (titleLower.includes('healthcare') || queryData.keywords.includes('healthcare')) {
    description += 'You will work in healthcare settings, supporting patient care and healthcare operations. Knowledge of healthcare systems and patient care protocols preferred.';
  } else if (titleLower.includes('software') || titleLower.includes('engineer') || queryData.keywords.includes('coding')) {
    description += 'You will develop software applications, write clean code, and collaborate with technical teams. Programming experience and software development skills required.';
  } else if (titleLower.includes('manager') || queryData.keywords.includes('people') || queryData.keywords.includes('leadership')) {
    description += 'You will lead teams, manage projects, and drive organizational success. Leadership experience and strong communication skills essential.';
  } else {
    description += 'This role offers the opportunity to contribute your expertise, work with talented colleagues, and make a meaningful impact.';
  }
  
  return description;
}

// Process and Rank Results
function processResults(results, queryData) {
  // Remove duplicates
  const uniqueResults = [];
  const seenIds = new Set();
  
  results.forEach(job => {
    if (!seenIds.has(job.job_id)) {
      seenIds.add(job.job_id);
      
      // Enhanced scoring
      let enhancedScore = job.score || 0;
      const title = (job.job_title || '').toLowerCase();
      
      // Boost for exact query matches
      if (title.includes(queryData.originalQuery.toLowerCase())) {
        enhancedScore += 0.4;
      }
      
      // Boost for keyword matches
      queryData.keywords.forEach(keyword => {
        if (title.includes(keyword)) {
          enhancedScore += 0.2;
        }
      });
      
      // Boost for suggested job title matches
      queryData.suggestedTitles.forEach(suggestedTitle => {
        if (title.includes(suggestedTitle.toLowerCase())) {
          enhancedScore += 0.3;
        }
      });
      
      uniqueResults.push({
        ...job,
        enhancedScore,
        job_title: job.job_title || 'Unknown Position',
        company_name: job.company_name || 'Unknown Company',
        location: job.location || 'Location not specified',
        remote: job.remote || job.remote_allowed || false,
        experience_level: job.experience_level || job.formatted_experience_level || '',
        work_type: job.work_type || job.formatted_work_type || '',
        enhanced_description: generateJobDescription(job, queryData)
      });
    }
  });
  
  return uniqueResults
    .sort((a, b) => b.enhancedScore - a.enhancedScore)
    .slice(0, CONFIG.SEARCH.maxResults);
}

// Format Results as HTML
function formatResults(results, queryData) {
  if (!results || results.length === 0) {
    return `
      <div class="text-center py-8">
        <div class="text-gray-400 text-lg mb-2">🔍</div>
        <h3 class="text-lg font-medium text-gray-900 mb-2">No jobs found</h3>
        <p class="text-gray-500">Try different keywords or broader search terms</p>
        ${queryData.suggestedTitles.length > 0 ? `
          <div class="mt-4">
            <p class="text-sm text-gray-600 mb-2">Try searching for:</p>
            <div class="flex flex-wrap gap-2 justify-center">
              ${queryData.suggestedTitles.slice(0, 3).map(title => 
                `<span class="px-3 py-1 bg-blue-100 text-blue-800 text-sm rounded-full">${title}</span>`
              ).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }

  const queryInput = `<input type="hidden" name="current-query" value="${queryData.originalQuery}">`;
  let html = queryInput + '<div class="space-y-4">';
  
  results.forEach(job => {
    // Format salary
    let salaryDisplay = 'Salary not disclosed';
    if (job.salary_min && job.salary_max) {
      salaryDisplay = `$${Math.round(job.salary_min/1000)}k - $${Math.round(job.salary_max/1000)}k`;
    } else if (job.salary_min) {
      salaryDisplay = `$${Math.round(job.salary_min/1000)}k+`;
    } else if (job.salary_median) {
      salaryDisplay = `$${Math.round(job.salary_median/1000)}k (median)`;
    } else if (job.salary_in_usd) {
      const sal = typeof job.salary_in_usd === 'string' ? 
        parseFloat(job.salary_in_usd.replace(/[^\d.-]/g, '')) : job.salary_in_usd;
      if (sal > 0) salaryDisplay = `$${Math.round(sal/1000)}k`;
    } else if (job.normalized_salary) {
      salaryDisplay = `$${Math.round(job.normalized_salary/1000)}k`;
    }

    const description = job.enhanced_description || 'No description available';
    const preview = description.substring(0, 200);
    const hasMore = description.length > 200;
    
    const remoteText = job.remote ? '<span class="text-green-600 text-sm ml-2">• Remote</span>' : '';
    const experienceLevel = job.experience_level || 'Not specified';
    const workType = job.work_type || 'Full-time';
    
    html += `
      <div class="bg-white border border-gray-200 rounded-lg shadow-sm p-6 hover:shadow-md transition-shadow">
        <div class="flex justify-between items-start mb-3">
          <h3 class="text-lg font-semibold text-blue-600 hover:text-blue-800">${job.job_title}</h3>
        </div>
        
        <div class="text-sm text-gray-600 mb-3">
          <span class="font-medium">${job.company_name}</span>
          <span class="mx-2">•</span>
          <span>${job.location}</span>
          ${remoteText}
        </div>
        
        <div class="bg-gray-50 p-3 rounded mb-4">
          <div id="preview-${job.job_id}">
            <p class="text-sm text-gray-700">${preview}${hasMore ? '...' : ''}</p>
            ${hasMore ? `
              <button 
                class="text-blue-500 hover:text-blue-700 text-sm mt-2 font-medium"
                onclick="document.getElementById('preview-${job.job_id}').style.display='none'; document.getElementById('full-${job.job_id}').style.display='block';"
              >
                Read more
              </button>
            ` : ''}
          </div>
          
          ${hasMore ? `
            <div id="full-${job.job_id}" style="display:none;">
              <p class="text-sm text-gray-700">${description}</p>
              <button 
                class="text-blue-500 hover:text-blue-700 text-sm mt-2 font-medium"
                onclick="document.getElementById('preview-${job.job_id}').style.display='block'; document.getElementById('full-${job.job_id}').style.display='none';"
              >
                Read less
              </button>
            </div>
          ` : ''}
        </div>
        
        <div class="flex flex-wrap gap-2 mb-3">
          <span class="px-3 py-1 text-sm font-medium rounded-full bg-green-100 text-green-800">${salaryDisplay}</span>
          <span class="px-3 py-1 text-sm rounded-full bg-blue-100 text-blue-800">${experienceLevel}</span>
          <span class="px-3 py-1 text-sm rounded-full bg-purple-100 text-purple-800">${workType}</span>
        </div>
        
        <div class="flex justify-between items-center text-xs text-gray-400">
          <span>Relevance: ${(job.enhancedScore || 0).toFixed(3)}</span>
          <span>Job ID: ${job.job_id}</span>
        </div>
      </div>
    `;
  });
  
  html += '</div>';
  return html;
}

// EdX Course Recommendations (Improved)
function generateEdXPlaceholder(queryData) {
  const originalQuery = queryData.originalQuery.toLowerCase();
  
  console.log(`Matching EdX courses for: "${originalQuery}"`);
  
  const courses = {
    'healthcare-data': {
      title: 'Health Data Science and Analytics',
      provider: 'Johns Hopkins University',
      type: 'Professional Certificate'
    },
    'healthcare-people': {
      title: 'Healthcare Leadership and Management', 
      provider: 'University of Pennsylvania',
      type: 'Course'
    },
    healthcare: {
      title: 'Healthcare Administration',
      provider: 'Harvard University',
      type: 'Professional Certificate'
    },
    data: {
      title: 'Data Science Professional Certificate',
      provider: 'IBM',
      type: 'Professional Certificate'
    },
    software: {
      title: 'Computer Science Essentials',
      provider: 'University of Pennsylvania',
      type: 'Certificate'
    },
    finance: {
      title: 'Finance for Everyone',
      provider: 'University of Michigan',
      type: 'Course'
    },
    business: {
      title: 'Business Leadership and Management',
      provider: 'Harvard Business School',
      type: 'Certificate'
    }
  };
  
  let selectedCourse = courses.business; // default
  
  // Smart combination matching
  if ((originalQuery.includes('healthcare') || originalQuery.includes('health')) && 
      (originalQuery.includes('data') || originalQuery.includes('analytics'))) {
    selectedCourse = courses['healthcare-data'];
    console.log('Selected: Healthcare + Data combination');
  } else if ((originalQuery.includes('healthcare') || originalQuery.includes('health')) && 
             (originalQuery.includes('people') || originalQuery.includes('management') || originalQuery.includes('leadership'))) {
    selectedCourse = courses['healthcare-people'];
    console.log('Selected: Healthcare + People combination');
  } else if (originalQuery.includes('healthcare') || originalQuery.includes('health')) {
    selectedCourse = courses.healthcare;
    console.log('Selected: Healthcare');
  } else if (originalQuery.includes('data')) {
    selectedCourse = courses.data;
    console.log('Selected: Data Science');
  } else if (originalQuery.includes('software') || originalQuery.includes('coding')) {
    selectedCourse = courses.software;
    console.log('Selected: Software');
  } else if (originalQuery.includes('finance')) {
    selectedCourse = courses.finance;
    console.log('Selected: Finance');
  }
  
  return `
    <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
      <h3 class="text-lg font-semibold text-indigo-600 mb-2">Recommended Learning</h3>
      <div class="border rounded p-3">
        <div class="text-xs text-gray-500 mb-1">${selectedCourse.type} • ${selectedCourse.provider}</div>
        <h4 class="font-medium text-gray-900 mb-2">${selectedCourse.title}</h4>
        <a href="https://www.edx.org/search?q=${encodeURIComponent(selectedCourse.title)}" 
           target="_blank" 
           class="inline-flex items-center text-sm text-indigo-600 hover:text-indigo-800">
          View Course →
        </a>
      </div>
    </div>
  `;
}

// YouTube Placeholder
function generateYouTubePlaceholder(queryData) {
  const searchTerm = queryData.suggestedTitles[0] || queryData.processedQuery;
  
  return `
    <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
      <h3 class="text-lg font-semibold text-indigo-600 mb-2">Career Insights</h3>
      <div id="youtube-container" 
           hx-get="/api/youtube-search?query=${encodeURIComponent(searchTerm)}" 
           hx-trigger="load"
           hx-indicator=".loading">
        <div class="loading flex items-center justify-center p-8">
          <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600"></div>
          <span class="ml-2 text-sm text-gray-600">Loading video...</span>
        </div>
      </div>
    </div>
  `;
}

// Main Handler
export default async function handler(req, res) {
  const startTime = Date.now();
  
  // Set timeout
  const timeoutId = setTimeout(() => {
    if (!res.headersSent) {
      res.status(408).send('<div class="text-red-500">Search timeout. Please try again.</div>');
    }
  }, CONFIG.SEARCH.timeout);

  try {
    const { query, source, remote, minSalary } = req.query;

    if (!query || query.trim() === '') {
      clearTimeout(timeoutId);
      return res.status(400).send('<div class="text-red-500">Please provide a search query</div>');
    }

    console.log('Search request:', { query, source, remote, minSalary });

    // Process query
    const queryData = processQuery(query);
    console.log('Processed query:', queryData);

    // Prepare filters
    const filters = {};
    if (source && source !== 'all') filters.source = source;
    if (remote !== undefined) filters.remote = remote;
    if (minSalary) filters.minSalary = minSalary;

    // Search jobs
    const results = await searchJobs(queryData, filters);
    console.log(`Found ${results.length} raw results`);

    // Process results
    const processedResults = processResults(results, queryData);
    console.log(`Processed to ${processedResults.length} final results`);

    // Generate content
    const edxContent = generateEdXPlaceholder(queryData);
    const youtubeContent = generateYouTubePlaceholder(queryData);
    
    const twoColumnLayout = `
      <div class="grid md:grid-cols-2 gap-4 mb-6">
        <div>${youtubeContent}</div>
        <div>${edxContent}</div>
      </div>
    `;

    const jobResults = formatResults(processedResults, queryData);
    const fullResponse = twoColumnLayout + jobResults;

    console.log(`Search completed in ${Date.now() - startTime}ms`);

    clearTimeout(timeoutId);
    res.setHeader('Content-Type', 'text/html');
    res.status(200).send(fullResponse);

  } catch (error) {
    clearTimeout(timeoutId);
    console.error('Search error:', error);
    
    if (!res.headersSent) {
      const errorResponse = `
        <div class="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 class="text-red-800 font-semibold">Search Error</h3>
          <p class="text-red-700">We encountered an issue while searching. Please try again.</p>
          <details class="mt-2">
            <summary class="text-red-600 cursor-pointer">Technical details</summary>
            <p class="text-red-600 text-sm mt-1">${error.message}</p>
          </details>
        </div>
      `;
      res.status(500).send(errorResponse);
    }
  }
}