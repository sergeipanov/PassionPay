/**
 * PassionPay EdX Search API - Version 1.0
 * Fetches relevant courses and certificates from EdX based on user passions
 * Integrates with search results to show learning paths
 */

import 'dotenv/config';
import axios from 'axios';
import NodeCache from 'node-cache';
import { INDUSTRY_CATEGORIES, INDUSTRY_COURSES, DEFAULT_COURSES as GLOBAL_DEFAULT_COURSES } from '../data/industry-courses.js';

// Create a cache with TTL of 30 minutes
const edxCache = new NodeCache({ stdTTL: 1800 });

/**
 * Find the best matching industry category for a given search query
 * @param {string} query - The user's search query
 * @returns {string|null} - The matched industry category or null if no match
 */
function findBestIndustryMatch(query) {
  const lowercaseQuery = query.toLowerCase();
  
  // Special case for finance-related queries with 'stocks' and 'numbers'
  if ((lowercaseQuery.includes('stock') || lowercaseQuery.includes('stocks') || 
       lowercaseQuery.includes('fstock') || lowercaseQuery.includes('fstocks')) && 
      (lowercaseQuery.includes('number') || lowercaseQuery.includes('numbers'))) {
    console.log('Finance-related query detected with stocks and numbers');
    return 'finance';
  }
  
  // Special case for various finance terms
  const financeTerms = ['finance', 'investment', 'banking', 'trading', 'money', 'financial', 
                       'accounting', 'stock', 'stocks', 'fstock', 'fstocks'];
  for (const term of financeTerms) {
    if (lowercaseQuery.includes(term)) {
      console.log(`Finance-related term detected: ${term}`);
      return 'finance';
    }
  }
  
  let bestCategory = null;
  let maxMatches = 0;
  
  // Go through each industry category and count keyword matches
  for (const [category, keywords] of Object.entries(INDUSTRY_CATEGORIES)) {
    // Count how many keywords from this category appear in the query
    const matches = keywords.filter(keyword => 
      lowercaseQuery.includes(keyword.toLowerCase())
    ).length;
    
    // If we found more matches than our current best, update it
    if (matches > maxMatches) {
      maxMatches = matches;
      bestCategory = category;
    }
  }
  
  console.log(`Best industry match: ${bestCategory || 'none found'} with ${maxMatches} matches`);
  return bestCategory;
}

/**
 * Generates a friendly HTML message when course search times out
 * @param {string} query - The original search query
 * @returns {string} - HTML content for timeout message
 */
/**
 * Generates course HTML for a successful search
 * @param {string} query - The original search query
 * @param {Array} courses - Array of course objects
 * @returns {string} - Formatted HTML
 */
function generateCourseHTML(query, courses) {
  // Format the query for display
  const displayQuery = query.charAt(0).toUpperCase() + query.slice(1);
  
  // Use only the first (best) course
  const course = courses[0];
  
  return `
    <div class="mt-4 bg-white shadow overflow-hidden rounded-lg">
      <div class="p-6 border-b border-gray-200">
        <h3 class="text-xl font-bold text-indigo-600 mb-2">Recommended Courses: ${displayQuery}</h3>
        <p class="text-sm text-gray-500 mb-4">Build skills for this career with professional certificates</p>
        
        <div class="mt-4 border rounded-lg overflow-hidden">
          <div class="px-4 py-3 bg-gray-50 border-b">
            <span class="font-medium text-sm text-indigo-600">${course.type}</span>
            <span class="text-gray-500 text-sm ml-2">${course.provider}</span>
          </div>
          <div class="p-4">
            <h4 class="text-lg font-medium text-gray-900">${course.title}</h4>
            <p class="mt-1 text-sm text-gray-600">${course.description}</p>
          </div>
          <div class="mt-2 flex justify-between items-center p-4 bg-gray-50">
            <span class="text-xs text-gray-500">Format: ${typeof course.startDate === 'string' ? (course.startDate === 'Self-paced' ? 'Self-paced' : 'Scheduled') : 'Self-paced'}</span>
            <a href="https://www.edx.org/search?q=${encodeURIComponent(course.title)}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center px-3 py-1 border border-indigo-300 text-xs leading-4 font-medium rounded-md text-indigo-700 bg-indigo-50 hover:bg-indigo-100">
              Find on EdX
              <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Generates a friendly HTML message when course search times out
 * @param {string} query - The original search query
 * @returns {string} - HTML content for timeout message
 */
function generateTimeoutMessage(query) {
  return `
    <div class="mt-4 bg-white shadow overflow-hidden rounded-lg">
      <div class="p-6 border-b border-gray-200">
        <h3 class="text-xl font-bold text-indigo-600 mb-2">Recommended Courses: ${query}</h3>
        <p class="text-sm text-gray-500 mb-4">Build skills for this career with professional certificates</p>
        
        <div class="bg-gray-50 p-6 rounded-lg border border-gray-200 text-center">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 mx-auto text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h4 class="text-lg font-medium text-gray-900 mb-2">Courses Not Available</h4>
          <p class="text-gray-600 mb-4">We couldn't find specific courses for "${query}" at this time.</p>
          <div class="flex flex-col space-y-2 justify-center items-center">
            <a href="https://www.edx.org/search?q=${encodeURIComponent(query)}" target="_blank" rel="noopener noreferrer" 
               class="inline-flex items-center px-4 py-2 border border-indigo-300 text-sm font-medium rounded-md text-indigo-700 bg-indigo-50 hover:bg-indigo-100">
              Search on EdX
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
            <a href="https://www.coursera.org/search?query=${encodeURIComponent(query)}" target="_blank" rel="noopener noreferrer" 
               class="inline-flex items-center px-4 py-2 border border-blue-300 text-sm font-medium rounded-md text-blue-700 bg-blue-50 hover:bg-blue-100">
              Try Coursera
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Legacy curated database - Keeping for reference but using the industry-courses.js data instead
 * @deprecated Use INDUSTRY_COURSES from industry-courses.js instead
 */
const LEGACY_CURATED_COURSES = {
  'automotive engineering': [
    {
      title: 'Automotive Engineering Fundamentals',
      provider: 'Purdue University',
      type: 'Professional Certificate Program',
      link: 'https://www.edx.org/professional-certificate/purduex-automotive-engineering',
      description: 'Master the fundamentals of automotive systems, design principles, and engineering practices for modern vehicles.',
      startDate: 'Self-paced'
    },
    {
      title: 'Electric Vehicle Technology',
      provider: 'Delft University of Technology',
      type: 'Course',
      link: 'https://www.edx.org/course/electric-vehicle-technology',
      description: 'Learn the core technologies behind electric vehicles, from battery systems to drivetrain components and charging infrastructure.',
      startDate: 'Self-paced'
    },
    {
      title: 'Automotive Mechanics and Service Technology',
      provider: 'Arizona State University',
      type: 'Course',
      link: 'https://www.edx.org/course/automotive-mechanics',
      description: 'Develop practical skills in diagnosing, repairing and maintaining vehicles with emphasis on modern automotive systems.',
      startDate: 'Self-paced'
    }
  ],
  'engineering': [
    {
      title: 'Mechanical Engineering Principles',
      provider: 'MIT',
      type: 'Professional Certificate Program',
      link: 'https://www.edx.org/professional-certificate/mitx-mechanical-engineering',
      description: 'Build a strong foundation in core mechanical engineering concepts including statics, dynamics, thermodynamics and materials science.',
      startDate: 'Self-paced'
    },
    {
      title: 'Engineering Mechanics',
      provider: 'Georgia Tech',
      type: 'Course',
      link: 'https://www.edx.org/course/engineering-mechanics',
      description: 'Master the fundamental principles of statics and dynamics essential for all engineering disciplines.',
      startDate: 'Self-paced'
    },
    {
      title: 'Materials Science and Engineering',
      provider: 'MIT',
      type: 'Course',
      link: 'https://www.edx.org/course/materials-science-and-engineering',
      description: 'Explore the structure, properties, processing, and performance of engineering materials including metals, polymers, ceramics, and composites.',
      startDate: 'Self-paced'
    }
  ],
  'healthcare management': [
    {
      title: 'Healthcare Administration',
      provider: 'Harvard University',
      type: 'Professional Certificate Program',
      link: 'https://www.edx.org/certificates/professional-certificate/harvardx-healthcare-administration',
      description: 'Develop essential management and leadership skills needed to drive innovation and success in healthcare organizations.',
      startDate: 'Self-paced'
    },
    {
      title: 'Healthcare Management and Leadership',
      provider: 'Doane University',
      type: 'Course',
      link: 'https://www.edx.org/course/healthcare-management-and-leadership',
      description: 'Master strategic planning, budgeting, and leadership skills for effective healthcare administration.',
      startDate: 'Self-paced'
    },
    {
      title: 'Healthcare Quality Improvement',
      provider: 'Harvard Medical School',
      type: 'Course',
      link: 'https://www.edx.org/course/healthcare-quality-improvement',
      description: 'Learn to implement quality improvement initiatives in healthcare settings to enhance patient outcomes and operational efficiency.',
      startDate: 'Self-paced'
    }
  ],
  'hospitality management': [
    {
      title: 'Restaurant Management',
      provider: 'Cornell University',
      type: 'Professional Certificate Program',
      link: 'https://www.edx.org/certificates/professional-certificate/cornellx-restaurant-management',
      description: 'Learn essential skills for managing successful restaurant operations, from menu design to customer service excellence.',
      startDate: 'Self-paced'
    },
    {
      title: 'Food & Beverage Management',
      provider: 'IMD Business School',
      type: 'Course',
      link: 'https://www.edx.org/course/food-and-beverage-management',
      description: 'Master the fundamentals of food and beverage operations, cost control, and customer experience management.',
      startDate: 'Self-paced'
    },
    {
      title: 'Hospitality Management: Building Revenue',
      provider: 'Cornell University',
      type: 'Course',
      link: 'https://www.edx.org/course/hospitality-management-building-revenue',
      description: 'Develop strategies to optimize revenue in hospitality businesses through pricing, distribution, and customer management.',
      startDate: 'Self-paced'
    }
  ],
  'computer science': [
    {
      title: 'Introduction to Computer Science and Programming Using Python',
      provider: 'Massachusetts Institute of Technology',
      type: 'Course',
      link: 'https://www.edx.org/course/introduction-to-computer-science-and-programming-7',
      description: 'An introduction to computer science as a tool to solve real-world analytical problems using Python 3.5.',
      startDate: 'Self-paced'
    },
    {
      title: 'CS50: Introduction to Computer Science',
      provider: 'Harvard University',
      type: 'Course',
      link: 'https://www.edx.org/course/introduction-computer-science-harvardx-cs50x',
      description: 'An introduction to the intellectual enterprises of computer science and the art of programming.',
      startDate: 'Self-paced'
    },
    {
      title: 'Computer Science Essentials for Software Development',
      provider: 'University of Pennsylvania',
      type: 'Professional Certificate Program',
      link: 'https://www.edx.org/professional-certificate/computer-science-essentials-software',
      description: 'Learn the tools and techniques to design, code, and debug programs using modern software development practices.',
      startDate: 'Self-paced'
    }
  ],
  'software development': [
    {
      title: 'Professional Certificate in Software Development',
      provider: 'IBM',
      type: 'Professional Certificate Program',
      link: 'https://www.edx.org/professional-certificate/ibm-software-development',
      description: 'Master Cloud Native, Full Stack Application Development with this Software Development Professional Certificate.',
      startDate: 'Self-paced'
    },
    {
      title: 'Software Development Fundamentals',
      provider: 'Microsoft',
      type: 'Course',
      link: 'https://www.edx.org/course/software-development-fundamentals',
      description: 'Learn the fundamentals of software development, understand the software development life cycle, and write simple programs using Python.',
      startDate: 'Self-paced'
    },
    {
      title: 'Software Engineering Essentials',
      provider: 'The Linux Foundation',
      type: 'Course',
      link: 'https://www.edx.org/course/software-engineering-essentials',
      description: 'Learn essential software engineering skills and tools to build better software more efficiently.',
      startDate: 'Self-paced'
    }
  ],
  'web development': [
    {
      title: 'Front-End Web Developer',
      provider: 'W3C',
      type: 'Professional Certificate Program',
      link: 'https://www.edx.org/professional-certificate/w3cx-front-end-web-developer',
      description: 'Learn all about front-end web development skills: HTML5, CSS and JavaScript.',
      startDate: 'Self-paced'
    },
    {
      title: 'Programming for the Web with JavaScript',
      provider: 'University of Pennsylvania',
      type: 'Course',
      link: 'https://www.edx.org/course/programming-for-the-web-with-javascript',
      description: 'Learn the fundamentals of JavaScript and how to apply that knowledge to build dynamic web pages.',
      startDate: 'Self-paced'
    },
    {
      title: 'Full Stack Web Development',
      provider: 'IBM',
      type: 'Professional Certificate Program',
      link: 'https://www.edx.org/professional-certificate/ibm-full-stack-cloud-developer',
      description: 'Build applications using a cloud native full stack approach with JavaScript, Node.js, React, Docker, and Kubernetes.',
      startDate: 'Self-paced'
    }
  ],
  'data science': [
    {
      title: 'Data Science',
      provider: 'Harvard University',
      type: 'Professional Certificate Program',
      link: 'https://www.edx.org/professional-certificate/harvardx-data-science',
      description: 'Learn key data science essentials, including R, machine learning, and data visualization using real-world case studies.',
      startDate: 'Self-paced'
    },
    {
      title: 'Introduction to Data Science',
      provider: 'IBM',
      type: 'Course',
      link: 'https://www.edx.org/course/introduction-to-data-science',
      description: 'Learn the fundamentals of data science and machine learning with a focus on practical applications.',
      startDate: 'Self-paced'
    },
    {
      title: 'Data Science Fundamentals',
      provider: 'Microsoft',
      type: 'Professional Certificate Program',
      link: 'https://www.edx.org/professional-certificate/microsoft-data-science-fundamentals',
      description: 'Learn the fundamentals of data science using tools like Python, SQL, and Power BI.',
      startDate: 'Self-paced'
    }
  ],
  'machine learning': [
    {
      title: 'Machine Learning',
      provider: 'Columbia University',
      type: 'Course',
      link: 'https://www.edx.org/course/machine-learning',
      description: 'Learn the fundamentals of machine learning to develop predictive models using Python.',
      startDate: 'Self-paced'
    },
    {
      title: 'Machine Learning with Python: from Linear Models to Deep Learning',
      provider: 'Massachusetts Institute of Technology',
      type: 'Course',
      link: 'https://www.edx.org/course/machine-learning-with-python-from-linear-models-to',
      description: 'An in-depth introduction to the field of machine learning using Python.',
      startDate: 'Self-paced'
    },
    {
      title: 'Principles of Machine Learning',
      provider: 'Microsoft',
      type: 'Course',
      link: 'https://www.edx.org/course/principles-of-machine-learning',
      description: 'Learn fundamental machine learning concepts with a practical, hands-on approach.',
      startDate: 'Self-paced'
    }
  ],
  'artificial intelligence': [
    {
      title: 'Artificial Intelligence (AI)',
      provider: 'Columbia University',
      type: 'Professional Certificate Program',
      link: 'https://www.edx.org/professional-certificate/artificial-intelligence',
      description: 'Master the foundations of artificial intelligence to solve complex problems.',
      startDate: 'Self-paced'
    },
    {
      title: 'Introduction to Artificial Intelligence (AI)',
      provider: 'IBM',
      type: 'Course',
      link: 'https://www.edx.org/course/introduction-to-artificial-intelligence-ai',
      description: "Learn the foundational concepts of AI, its applications, and how it's transforming our world.",
      startDate: 'Self-paced'
    },
    {
      title: 'AI for Everyone: Master the Basics',
      provider: 'edX',
      type: 'Course',
      link: 'https://www.edx.org/course/artificial-intelligence-for-everyone',
      description: 'A non-technical introduction to AI and its potential to transform businesses and society.',
      startDate: 'Self-paced'
    }
  ],
  'cybersecurity': [
    {
      title: 'Cybersecurity Fundamentals',
      provider: 'RITx',
      type: 'Professional Certificate Program',
      link: 'https://www.edx.org/professional-certificate/ritx-cybersecurity-fundamentals',
      description: 'Learn essential cybersecurity skills to protect digital assets and infrastructure.',
      startDate: 'Self-paced'
    },
    {
      title: 'Introduction to Cybersecurity',
      provider: 'University of Washington',
      type: 'Course',
      link: 'https://www.edx.org/course/introduction-to-cybersecurity',
      description: 'Learn the basic principles of cybersecurity and risk management.',
      startDate: 'Self-paced'
    },
    {
      title: 'Cybersecurity Essentials',
      provider: 'NYUx',
      type: 'Course',
      link: 'https://www.edx.org/course/cybersecurity-essentials',
      description: 'Explore foundational cybersecurity concepts and gain skills to protect digital systems.',
      startDate: 'Self-paced'
    }
  ],
  'business analytics': [
    {
      title: 'Business Analytics',
      provider: 'Harvard University',
      type: 'Professional Certificate Program',
      link: 'https://www.edx.org/professional-certificate/harvardx-business-analytics',
      description: 'Learn how to use data analytics to make data-driven business decisions.',
      startDate: 'Self-paced'
    },
    {
      title: 'Introduction to Business Analytics',
      provider: 'IBM',
      type: 'Course',
      link: 'https://www.edx.org/course/business-analytics-fundamentals',
      description: 'Learn the basics of business analytics and how to apply data analysis to real-world business contexts.',
      startDate: 'Self-paced'
    },
    {
      title: 'Data Analysis for Decision Making',
      provider: 'UBCx',
      type: 'Course',
      link: 'https://www.edx.org/course/data-analysis-for-decision-making',
      description: 'Learn to analyze data to inform business decisions using Excel and basic statistics.',
      startDate: 'Self-paced'
    }
  ]
};

// Use the DEFAULT_COURSES from our industry module
const DEFAULT_COURSES = GLOBAL_DEFAULT_COURSES;

/**
 * Function to search for EdX courses based on a query
 * @param {string} query - The search query
 * @returns {Promise<Array>} - Array of EdX courses
 */
async function searchEdXCourses(query) {
  try {
    // Normalize the query
    const normalizedQuery = query.toLowerCase().trim();
    
    // Generate cache key
    const cacheKey = `edx-${normalizedQuery}`;
    
    // Check if we have cached results
    const cachedResults = edxCache.get(cacheKey);
    if (cachedResults) {
      return cachedResults;
    }
    
    // Find the best matching industry category for this query
    const industryCategory = findBestIndustryMatch(normalizedQuery);
    
    let courses = [];
    
    // Special case for finance-related queries to ensure instant response
    if (query.toLowerCase().includes('stock') || 
        query.toLowerCase().includes('fstock') || 
        (query.toLowerCase().includes('number') && query.toLowerCase().includes('work'))) {
      console.log('Finance query detected - using finance courses');
      return [
        {
          title: 'Finance for Everyone: Smart Tools for Decision-Making',
          provider: 'University of Michigan',
          type: 'Course',
          link: 'https://www.edx.org/course/finance-for-everyone-smart-tools-for-decision-making',
          description: 'Learn how to think clearly about financial decisions and improve your financial literacy.',
          startDate: 'Self-paced'
        }
      ];
    }
    
    // If we found a matching industry, use those courses
    if (industryCategory && INDUSTRY_COURSES[industryCategory]) {
      console.log(`Found industry match: ${industryCategory} for query: ${query}`);
      courses = INDUSTRY_COURSES[industryCategory];
    } else {
      // No specific industry match found, try EdX API
      try {
        console.log(`No industry match found for: ${query}, trying EdX API`);
        const response = await axios.get(`https://www.edx.org/api/catalog/search`, {
          params: {
            q: normalizedQuery,
            limit: 3,
            contents: 'course',
            content_type: 'course'
          }
        });
        
        if (response.data && response.data.items && response.data.items.length > 0) {
          courses = response.data.items.map(item => ({
            title: item.title,
            provider: item.provider,
            type: item.content_type === 'course' ? 'Course' : 'Program',
            link: item.url,
            description: item.description || 'No description available',
            startDate: item.start_date || 'Self-paced'
          }));
        } else {
          console.log(`No results from EdX API for: ${query}, using default courses`);
          courses = DEFAULT_COURSES;
        }
      } catch (apiError) {
        console.error('Error fetching from EdX API:', apiError);
        // If API fails, use default courses
        courses = DEFAULT_COURSES;
      }
    }
    
    // If no courses found, use default courses
    if (!courses || courses.length === 0) {
      courses = DEFAULT_COURSES;
    }
    
    // Cache the results
    edxCache.set(cacheKey, courses);
    
    return courses;
  } catch (error) {
    console.error('Error finding EdX courses:', error);
    return DEFAULT_COURSES; // Return default courses on error
  }
}

// Handler for EdX search
export default async function handler(req, res) {
  try {
    const { query } = req.query;
    
    if (!query) {
      return res.status(400).send('Please provide a search query');
    }
    
    console.log(`Finding courses for: "${query}"`);
    
    // Special case for finance/stocks-related queries to ensure instant response
    const lowercaseQuery = query.toLowerCase();
    if (lowercaseQuery.includes('stock') || 
        lowercaseQuery.includes('fstock') || 
        (lowercaseQuery.includes('number') && lowercaseQuery.includes('work')) ||
        (lowercaseQuery.includes('finance'))) {
      console.log('Finance query detected - using predefined finance course');
      const financeCourse = {
        title: 'Finance for Everyone: Smart Tools for Decision-Making',
        provider: 'University of Michigan',
        type: 'Course',
        link: 'https://www.edx.org/course/finance-for-everyone-smart-tools-for-decision-making',
        description: 'Learn how to think clearly about important financial decisions and improve your financial literacy.',
        startDate: 'Self-paced'
      };
      
      // Return a single finance course
      return res.send(generateCourseHTML(query, [financeCourse]));
    }
    
    // For other queries, search directly without timeout
    const courses = await searchEdXCourses(query);
    console.log(`Search completed, found ${courses ? courses.length : 0} courses`);
    
    // We already checked above, but this ensures we have courses
    if (!courses || courses.length === 0) {
      courses = DEFAULT_COURSES;
    }
    
    // Only return the first (best) course recommendation
    const course = courses[0];
    
    const html = `
      <div class="edx-course bg-white border border-gray-200 rounded-md overflow-hidden mb-4 ring-2 ring-indigo-400 max-w-2xl mx-auto">
        <div class="p-3 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
          <div>
            <span class="text-xs font-medium px-2 py-1 rounded-full ${course.type.toLowerCase().includes('program') ? 'bg-green-100 text-green-800' : course.type.toLowerCase().includes('professional') ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'}">${course.type}</span>
            <span class="text-xs text-gray-500 ml-2">${course.provider}</span>
          </div>
        </div>
        <div class="p-3">
          <h3 class="font-medium text-gray-900 mb-1">${course.title}</h3>
          ${course.description ? `<p class="text-xs text-gray-600 mb-2">${course.description.substring(0, 120)}${course.description.length > 120 ? '...' : ''}</p>` : ''}
          <div class="mt-2 flex justify-between items-center">
            <span class="text-xs text-gray-500">Format: ${typeof course.startDate === 'string' ? (course.startDate === 'Self-paced' ? 'Self-paced' : 'Scheduled') : 'Self-paced'}</span>
            <a href="https://www.edx.org/search?q=${encodeURIComponent(course.title)}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center px-3 py-1 border border-indigo-300 text-xs leading-4 font-medium rounded-md text-indigo-700 bg-indigo-50 hover:bg-indigo-100">
              Find on EdX
              <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>
        </div>
      </div>
    `;
    
    res.setHeader('Content-Type', 'text/html');
    res.status(200).send(html);
  } catch (error) {
    console.error('EdX search error:', error);
    res.status(500).send(`Error searching EdX: ${error.message}`);
  }
}
