/**
 * PassionPay Education Search API
 * Dynamically finds relevant university programs and certifications based on user query.
 */
import 'dotenv/config';

const curatedEducationalContent = [
  // --- Technology & Computer Science ---
  {
    id: 'mscs_gatech',
    type: 'Degree',
    title: 'Online Master of Science in Computer Science',
    institution: 'Georgia Institute of Technology',
    description: 'Highly-rated online MSCS program with specializations like Machine Learning, AI, Software Engineering.',
    url: 'https://omscs.gatech.edu/',
    keywords: ['computer science', 'software engineering', 'online masters', 'cs', 'mscs', 'tech degree', 'programming advanced', 'algorithms', 'machine learning', 'ai', 'artificial intelligence']
  },
  {
    id: 'google_data_analytics_cert',
    type: 'Certificate',
    title: 'Google Data Analytics Professional Certificate',
    institution: 'Google (Coursera)',
    description: 'Gain in-demand data analytics skills with hands-on projects. No prior experience required.',
    url: 'https://www.coursera.org/professional-certificates/google-data-analytics',
    keywords: ['data analytics', 'google certificate', 'coursera', 'sql', 'python', 'data visualization', 'statistics', 'business intelligence', 'entry level', 'data analysis']
  },
  {
    id: 'aws_solutions_architect_assoc',
    type: 'Certificate',
    title: 'AWS Certified Solutions Architect - Associate',
    institution: 'Amazon Web Services',
    description: 'Validate your ability to design and deploy well-architected solutions on AWS.',
    url: 'https://aws.amazon.com/certification/certified-solutions-architect-associate/',
    keywords: ['aws', 'cloud computing', 'solutions architect', 'amazon web services', 'iaas', 'paas', 'cloud infrastructure', 'devops']
  },
  {
    id: 'google_cybersecurity_cert',
    type: 'Certificate',
    title: 'Google Cybersecurity Professional Certificate',
    institution: 'Google (Coursera)',
    description: 'Learn job-ready skills for an entry-level role in cybersecurity. Understand risks, threats, and vulnerabilities.',
    url: 'https://www.coursera.org/professional-certificates/google-cybersecurity',
    keywords: ['cybersecurity', 'information security', 'it security', 'network security', 'google certificate', 'entry level', 'security analyst']
  },
  {
    id: 'tensorflow_developer_cert',
    type: 'Certificate',
    title: 'TensorFlow Developer Professional Certificate',
    institution: 'DeepLearning.AI (Coursera)',
    description: 'Build and train neural networks using TensorFlow. Ideal for aspiring ML engineers.',
    url: 'https://www.coursera.org/professional-certificates/tensorflow-in-practice',
    keywords: ['tensorflow', 'machine learning', 'deep learning', 'ai', 'neural networks', 'python', 'data science', 'artificial intelligence']
  },
  // --- Business & Finance ---
  {
    id: 'pmp_cert',
    type: 'Certificate',
    title: 'Project Management Professional (PMP)',
    institution: 'Project Management Institute (PMI)',
    description: 'Globally recognized certification for project managers across industries.',
    url: 'https://www.pmi.org/certifications/project-management-pmp',
    keywords: ['project management', 'pmp', 'certification', 'manager', 'leadership', 'agile', 'scrum', 'business', 'operations']
  },
  {
    id: 'online_mba_illinois',
    type: 'Degree',
    title: 'Online MBA (iMBA)',
    institution: 'University of Illinois Urbana-Champaign',
    description: 'Affordable and highly-ranked online MBA program focusing on practical business skills.',
    url: 'https://onlinemba.illinois.edu/',
    keywords: ['mba', 'master of business administration', 'business degree', 'online mba', 'leadership', 'management', 'finance', 'marketing', 'strategy']
  },
  {
    id: 'cfa_program',
    type: 'Certificate',
    title: 'Chartered Financial Analyst (CFA) Program',
    institution: 'CFA Institute',
    description: 'Globally respected credential for investment management professionals.',
    url: 'https://www.cfainstitute.org/en/programs/cfa',
    keywords: ['cfa', 'chartered financial analyst', 'finance', 'investment', 'portfolio management', 'financial analysis', 'asset management']
  },
  {
    id: 'google_digital_marketing_cert',
    type: 'Certificate',
    title: 'Google Digital Marketing & E-commerce Professional Certificate',
    institution: 'Google (Coursera)',
    description: 'Learn the fundamentals of digital marketing, SEO, SEM, social media, and e-commerce.',
    url: 'https://www.coursera.org/professional-certificates/google-digital-marketing-ecommerce',
    keywords: ['digital marketing', 'seo', 'sem', 'social media marketing', 'ecommerce', 'online advertising', 'google certificate', 'marketing strategy']
  },
  {
    id: 'shrm_cp_cert',
    type: 'Certificate',
    title: 'SHRM Certified Professional (SHRM-CP)',
    institution: 'Society for Human Resource Management (SHRM)',
    description: 'Competency-based certification for HR professionals.',
    url: 'https://www.shrm.org/credentials/certification/shrm-cp',
    keywords: ['human resources', 'hr', 'shrm', 'personnel management', 'talent acquisition', 'employee relations', 'hr certification']
  },
  // --- Healthcare ---
  {
    id: 'online_bsn_wgu',
    type: 'Degree',
    title: 'Online Bachelor of Science in Nursing (BSN)',
    institution: 'Western Governors University (WGU)',
    description: 'Accelerated online BSN program for aspiring nurses or RNs seeking a bachelor\'s degree.',
    url: 'https://www.wgu.edu/online-nursing-health-degrees/rn-to-bsn-nursing-bachelors-program.html',
    keywords: ['nursing', 'bsn', 'bachelor of science in nursing', 'healthcare degree', 'registered nurse', 'online nursing', 'medical']
  },
  {
    id: 'online_mha_gwu',
    type: 'Degree',
    title: 'Online Master of Healthcare Administration (MHA)',
    institution: 'George Washington University',
    description: 'Prepare for leadership roles in hospitals, clinics, and healthcare systems.',
    url: 'https://healthcaremba.gwu.edu/mha/',
    keywords: ['healthcare administration', 'mha', 'hospital management', 'health services', 'medical leadership', 'public health management']
  },
  {
    id: 'cpc_medical_coding_cert',
    type: 'Certificate',
    title: 'Certified Professional Coder (CPC)',
    institution: 'AAPC (American Academy of Professional Coders)',
    description: 'Gold standard certification for medical coders in physician offices, hospitals, and payer organizations.',
    url: 'https://www.aapc.com/certification/cpc/',
    keywords: ['medical coding', 'cpc', 'healthcare informatics', 'billing', 'medical records', 'health information management']
  },
  // --- Creative Arts & Design ---
  {
    id: 'google_ux_design_cert',
    type: 'Certificate',
    title: 'Google UX Design Professional Certificate',
    institution: 'Google (Coursera)',
    description: 'Learn the foundations of UX design, including empathizing with users, building wireframes and prototypes.',
    url: 'https://www.coursera.org/professional-certificates/google-ux-design',
    keywords: ['ux design', 'ui design', 'user experience', 'user interface', 'figma', 'adobe xd', 'prototyping', 'wireframing', 'product design', 'google certificate']
  },
  {
    id: 'calarts_graphic_design_spec',
    type: 'Certificate',
    title: 'Graphic Design Specialization',
    institution: 'California Institute of the Arts (CalArts) (Coursera)',
    description: 'Foundational skills in graphic design, including typography, image making, and branding.',
    url: 'https://www.coursera.org/specializations/graphic-design',
    keywords: ['graphic design', 'visual communication', 'typography', 'branding', 'adobe creative suite', 'art', 'design principles']
  },
  // --- Education ---
  {
    id: 'online_med_asu',
    type: 'Degree',
    title: 'Online Master of Education (M.Ed.)',
    institution: 'Arizona State University',
    description: 'Various specializations available, such as Curriculum and Instruction, Educational Leadership.',
    url: 'https://asuonline.asu.edu/online-degree-programs/education/',
    keywords: ['master of education', 'med', 'teaching degree', 'education leadership', 'curriculum development', 'online education degree']
  },
  {
    id: 'tesol_cert_asu',
    type: 'Certificate',
    title: 'TESOL Professional Certificate',
    institution: 'Arizona State University (Coursera)',
    description: 'Teach English as a Second or Foreign Language. Globally recognized credential.',
    url: 'https://www.coursera.org/professional-certificates/asu-tesol',
    keywords: ['tesol', 'tefl', 'teach english', 'esl', 'efl', 'language teaching', 'english teacher']
  },
  // --- Skilled Trades & Vocational (example) ---
  {
    id: 'comptia_a_plus_cert',
    type: 'Certificate',
    title: 'CompTIA A+ Certification',
    institution: 'CompTIA',
    description: 'Industry standard for establishing a career in IT. Covers hardware, software, and troubleshooting.',
    url: 'https://www.comptia.org/certifications/a',
    keywords: ['it support', 'comptia a+', 'computer repair', 'technical support', 'hardware', 'software', 'help desk', 'it technician']
  },
  // --- Sustainability ---
  {
    id: 'leed_green_associate',
    type: 'Certificate',
    title: 'LEED Green Associate',
    institution: 'U.S. Green Building Council (USGBC)',
    description: 'Demonstrates a foundational knowledge of green building principles and practices.',
    url: 'https://www.usgbc.org/credentials/leed-green-associate',
    keywords: ['leed', 'green building', 'sustainability', 'environmental design', 'construction', 'architecture', 'sustainable development']
  },
  // --- Fitness & Wellness ---
  {
    id: 'nasm_cpt_cert',
    type: 'Certificate',
    title: 'Certified Personal Trainer (CPT)',
    institution: 'National Academy of Sports Medicine (NASM)',
    description: 'Widely recognized certification for personal trainers to design and implement exercise programs.',
    url: 'https://www.nasm.org/certifications/certified-personal-trainer',
    keywords: ['personal trainer', 'fitness certification', 'cpt', 'exercise science', 'health coach', 'wellness', 'sports medicine']
  }
];

async function findEducationalContent(query) {
  console.log(`[education-search] Received query: ${query}`);
  const queryWords = query.toLowerCase().split(/\s+/).filter(word => word.length > 2); // Split by space, filter short words

  const scoredResults = curatedEducationalContent.map(item => {
    let score = 0;
    item.keywords.forEach(keyword => {
      // Check if any part of the keyword (if multi-word) is in the query, or if the full query word matches a keyword
      const keywordParts = keyword.toLowerCase().split(/\s+/);
      if (queryWords.some(qw => keyword.toLowerCase().includes(qw) || keywordParts.some(kp => qw.includes(kp)))) {
        score++;
      }
    });
    // Boost score for direct title match (partial or full)
    if (item.title.toLowerCase().includes(query.toLowerCase())) {
      score += 5; // Significant boost for title match
    }
    return { ...item, score };
  }).sort((a, b) => b.score - a.score); // Sort by score descending

  const topResults = scoredResults.filter(item => item.score > 0).slice(0, 3); // Get top 3 with score > 0

  if (topResults.length > 0) {
    console.log(`[education-search] Top results for "${query}":`, topResults.map(r => ({title: r.title, score: r.score})));
    return topResults;
  }

  // Fallback if no good matches from curated list
  console.log(`[education-search] No strong matches found for "${query}", returning generic search links.`);
  return [
    {
      id: 'fallback_degree_search',
      type: 'Info',
      title: 'Explore University Degrees',
      institution: 'Various',
      description: `Search for university degree programs related to "${query}" on the web.`,
      url: `https://www.google.com/search?q=${encodeURIComponent(query + ' university degree programs')}`,
      keywords: []
    },
    {
      id: 'fallback_cert_search',
      type: 'Info',
      title: 'Find Professional Certifications',
      institution: 'Various',
      description: `Look for professional certifications for "${query}" on sites like Coursera, edX, or LinkedIn Learning.`,
      url: `https://www.google.com/search?q=${encodeURIComponent(query + ' professional certifications')}`,
      keywords: []
    }
  ];
}

export async function handler(req, res) {
  const { query } = req.query;

  if (!query) {
    // For HTMX, it's often better to return an empty successful response or a specific error message HTML
    // rather than a JSON error, depending on how you want to handle it on the frontend.
    // For now, let's send a simple error message that HTMX can display.
    return res.status(400).send('<div class="text-red-500">Error: Search query for education is missing.</div>');
  }

  try {
    const educationalResults = await findEducationalContent(query);

    if (!educationalResults || educationalResults.length === 0) {
      return res.status(200).send('<div class="text-gray-600">No specific educational programs found for this query. Explore general options.</div>');
    }

    // Generate HTML for the results
    const htmlResults = educationalResults.map(item => `
      <div class="mb-4 p-4 border border-gray-200 rounded-lg shadow-sm bg-white">
        <h4 class="text-lg font-semibold text-blue-600 hover:text-blue-800">
          <a href="${item.url}" target="_blank" rel="noopener noreferrer">${item.title}</a>
        </h4>
        <p class="text-sm text-gray-700 font-medium">${item.institution} (${item.type})</p>
        <p class="text-sm text-gray-600 mt-1">${item.description}</p>
      </div>
    `).join('');

    // Wrap in a container div
    const finalHtml = `
      <div id="education-results-container">
        <h3 class="text-xl font-semibold mb-3 text-gray-800">Related Learning Paths</h3>
        ${htmlResults}
      </div>
    `;
    
    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(finalHtml);

  } catch (error) {
    console.error('[education-search] Error fetching or formatting educational content:', error);
    // Send an HTML error message
    return res.status(500).send('<div class="text-red-500">Error: Could not load educational programs. Please try again later.</div>');
  }
}
