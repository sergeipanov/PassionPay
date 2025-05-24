/**
 * Industry-based course recommendations for PassionPay
 * Maps job titles and keywords to industry categories and corresponding courses
 */

// Major industry categories with related terms for matching
export const INDUSTRY_CATEGORIES = {
  // Technology & Software
  'software_development': [
    'software', 'developer', 'engineer', 'programming', 'coder', 'full stack', 
    'frontend', 'backend', 'web developer', 'mobile developer', 'app developer'
  ],
  'data_science': [
    'data scientist', 'data analyst', 'analytics', 'machine learning', 'ml engineer',
    'ai', 'artificial intelligence', 'statistics', 'big data', 'data engineer'
  ],
  'cybersecurity': [
    'security', 'cyber', 'infosec', 'information security', 'security analyst',
    'penetration tester', 'ethical hacker', 'security engineer', 'compliance'
  ],
  'cloud_computing': [
    'cloud', 'aws', 'azure', 'gcp', 'devops', 'cloud engineer', 'cloud architect',
    'infrastructure', 'sre', 'site reliability', 'platform engineer'
  ],
  
  // Healthcare
  'healthcare_management': [
    'healthcare', 'health', 'hospital', 'medical', 'clinic', 'health administration',
    'healthcare administrator', 'medical director', 'health services'
  ],
  'nursing': [
    'nurse', 'rn', 'nursing', 'lpn', 'clinical nurse', 'nurse practitioner',
    'registered nurse', 'healthcare provider'
  ],
  'medical_specialties': [
    'doctor', 'physician', 'surgeon', 'md', 'medical doctor', 'specialist',
    'cardiologist', 'neurologist', 'pediatrician', 'anesthesiologist'
  ],
  
  // Business & Finance
  'finance': [
    'finance', 'financial', 'accounting', 'accountant', 'controller', 'cfo',
    'financial analyst', 'investment', 'portfolio manager', 'wealth management'
  ],
  'business_management': [
    'business', 'management', 'operations', 'administration', 'ceo', 'coo',
    'executive', 'director', 'manager', 'supervisor'
  ],
  'marketing': [
    'marketing', 'advertising', 'brand', 'digital marketing', 'seo', 'content',
    'social media', 'market research', 'pr', 'communications'
  ],
  
  // Engineering & Manufacturing
  'engineering': [
    'engineer', 'mechanical', 'civil', 'electrical', 'chemical', 'structural',
    'industrial', 'manufacturing', 'process engineer', 'systems engineer'
  ],
  'automotive': [
    'automotive', 'car', 'vehicle', 'mechanic', 'technician', 'auto', 'service',
    'automotive engineer', 'car design', 'motor'
  ],
  'construction': [
    'construction', 'builder', 'architect', 'building', 'project manager', 
    'foreman', 'contractor', 'site manager', 'civil'
  ],
  
  // Creative & Design
  'design': [
    'design', 'designer', 'graphic', 'ui', 'ux', 'product designer', 'visual',
    'creative', 'art director', 'brand designer'
  ],
  'media_production': [
    'media', 'film', 'video', 'production', 'editor', 'producer', 'director',
    'camera', 'cinematographer', 'sound', 'lighting'
  ],
  
  // Hospitality & Service
  'hospitality': [
    'hospitality', 'hotel', 'restaurant', 'food', 'beverage', 'chef', 'culinary',
    'tourism', 'catering', 'event', 'service industry'
  ],
  
  // Education
  'education': [
    'education', 'teacher', 'professor', 'instructor', 'educator', 'academic',
    'school', 'university', 'teaching', 'training', 'learning'
  ],
  
  // Transportation & Logistics
  'logistics': [
    'logistics', 'supply chain', 'warehouse', 'inventory', 'transportation',
    'shipping', 'procurement', 'distribution', 'fleet', 'operations'
  ]
};

// Recommended courses for each industry category
export const INDUSTRY_COURSES = {
  // Technology & Software
  'software_development': [
    {
      title: 'Computer Science Essentials for Software Development',
      provider: 'University of Pennsylvania',
      type: 'Professional Certificate Program',
      link: 'https://www.edx.org/professional-certificate/computer-science-essentials-software',
      description: 'Learn the tools and techniques to design, code, and debug programs using modern software development practices.',
      startDate: 'Self-paced'
    },
    {
      title: 'Professional Certificate in Software Development',
      provider: 'IBM',
      type: 'Professional Certificate Program',
      link: 'https://www.edx.org/professional-certificate/ibm-software-development',
      description: 'Master Cloud Native, Full Stack Application Development with this Software Development Professional Certificate.',
      startDate: 'Self-paced'
    }
  ],
  'data_science': [
    {
      title: 'Data Science',
      provider: 'Harvard University',
      type: 'Professional Certificate Program',
      link: 'https://www.edx.org/professional-certificate/harvardx-data-science',
      description: 'Learn key data science essentials, including R, machine learning, and data visualization using real-world case studies.',
      startDate: 'Self-paced'
    },
    {
      title: 'Python for Data Science',
      provider: 'UC San Diego',
      type: 'Professional Certificate Program',
      link: 'https://www.edx.org/professional-certificate/python-data-science',
      description: 'Learn to use powerful, open-source, Python tools, including Pandas and NumPy to manipulate, analyze, and visualize complex datasets.',
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
    }
  ],
  'cloud_computing': [
    {
      title: 'Cloud Computing Specialization',
      provider: 'University of Illinois',
      type: 'Professional Certificate Program',
      link: 'https://www.edx.org/professional-certificate/cloud-computing',
      description: 'Master cloud computing concepts, from fundamentals to advanced services across major cloud platforms.',
      startDate: 'Self-paced'
    },
    {
      title: 'AWS Cloud Solutions Architect',
      provider: 'AWS',
      type: 'Professional Certificate Program',
      link: 'https://www.edx.org/professional-certificate/aws-cloud-solutions-architect',
      description: 'Learn to design and implement distributed systems on AWS, preparing for the AWS Certified Solutions Architect exam.',
      startDate: 'Self-paced'
    }
  ],
  
  // Healthcare
  'healthcare_management': [
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
    }
  ],
  'nursing': [
    {
      title: 'Nursing Leadership',
      provider: 'University of Michigan',
      type: 'Course',
      link: 'https://www.edx.org/course/nursing-leadership',
      description: 'Develop the leadership skills necessary to thrive in today's complex healthcare environment as a nursing professional.',
      startDate: 'Self-paced'
    },
    {
      title: 'Nursing Informatics',
      provider: 'Vanderbilt University',
      type: 'Course',
      link: 'https://www.edx.org/course/nursing-informatics',
      description: 'Learn how to leverage health information technology and data to improve patient care outcomes and nursing practice.',
      startDate: 'Self-paced'
    }
  ],
  
  // Business & Finance
  'finance': [
    {
      title: 'Finance for Everyone',
      provider: 'University of Michigan',
      type: 'Professional Certificate Program',
      link: 'https://www.edx.org/professional-certificate/finance-for-everyone',
      description: 'Develop a solid understanding of finance that will help you make better financial decisions in both personal and professional contexts.',
      startDate: 'Self-paced'
    },
    {
      title: 'Financial Analysis for Decision Making',
      provider: 'Babson College',
      type: 'Course',
      link: 'https://www.edx.org/course/financial-analysis-for-decision-making',
      description: 'Learn to use financial analysis tools and techniques to make effective business decisions.',
      startDate: 'Self-paced'
    }
  ],
  'business_management': [
    {
      title: 'Business Management & Leadership',
      provider: 'Columbia University',
      type: 'Professional Certificate Program',
      link: 'https://www.edx.org/professional-certificate/business-management-leadership',
      description: 'Master essential business leadership skills to effectively manage teams and drive organizational success.',
      startDate: 'Self-paced'
    },
    {
      title: 'Strategic Management',
      provider: 'Wharton',
      type: 'Course',
      link: 'https://www.edx.org/course/strategic-management',
      description: 'Learn how to create and implement successful business strategies using proven frameworks and methodologies.',
      startDate: 'Self-paced'
    }
  ],
  'marketing': [
    {
      title: 'Digital Marketing',
      provider: 'Wharton',
      type: 'Professional Certificate Program',
      link: 'https://www.edx.org/professional-certificate/whartonx-digital-marketing',
      description: 'Master the essential strategies, tactics, and tools of modern digital marketing to grow businesses in today's competitive landscape.',
      startDate: 'Self-paced'
    },
    {
      title: 'Marketing Analytics',
      provider: 'Berkeley',
      type: 'Professional Certificate Program',
      link: 'https://www.edx.org/professional-certificate/berkeleyx-marketing-analytics',
      description: 'Learn to use data and analytics to drive marketing decisions and improve ROI on marketing campaigns.',
      startDate: 'Self-paced'
    }
  ],
  
  // Engineering & Manufacturing
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
    }
  ],
  'automotive': [
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
    }
  ],
  'construction': [
    {
      title: 'Construction Project Management',
      provider: 'Columbia University',
      type: 'Professional Certificate Program',
      link: 'https://www.edx.org/professional-certificate/construction-project-management',
      description: 'Learn to effectively manage construction projects from planning and scheduling to cost control and quality management.',
      startDate: 'Self-paced'
    },
    {
      title: 'Sustainable Construction',
      provider: 'ETH Zurich',
      type: 'Course',
      link: 'https://www.edx.org/course/sustainable-construction',
      description: 'Explore environmentally responsible building practices and learn to design and construct high-performance, sustainable buildings.',
      startDate: 'Self-paced'
    }
  ],
  
  // Creative & Design
  'design': [
    {
      title: 'UX Design and Evaluation',
      provider: 'MIT',
      type: 'Professional Certificate Program',
      link: 'https://www.edx.org/professional-certificate/mitx-ux-design-and-evaluation',
      description: 'Learn to design and evaluate user interfaces based on human capabilities, needs, and behavioral patterns.',
      startDate: 'Self-paced'
    },
    {
      title: 'Visual Design',
      provider: 'California Institute of the Arts',
      type: 'Course',
      link: 'https://www.edx.org/course/visual-design',
      description: 'Master the fundamental principles of visual design to create compelling graphics, layouts, and interfaces.',
      startDate: 'Self-paced'
    }
  ],
  'media_production': [
    {
      title: 'Digital Media Production',
      provider: 'NYU',
      type: 'Professional Certificate Program',
      link: 'https://www.edx.org/professional-certificate/digital-media-production',
      description: 'Learn essential skills for creating professional digital media, from pre-production planning to post-production techniques.',
      startDate: 'Self-paced'
    },
    {
      title: 'Video Production and Editing',
      provider: 'UC Berkeley',
      type: 'Course',
      link: 'https://www.edx.org/course/video-production-and-editing',
      description: 'Master the fundamentals of video production, from camera operation and lighting to editing and post-production effects.',
      startDate: 'Self-paced'
    }
  ],
  
  // Hospitality & Service
  'hospitality': [
    {
      title: 'Restaurant Management',
      provider: 'Cornell University',
      type: 'Professional Certificate Program',
      link: 'https://www.edx.org/certificates/professional-certificate/cornellx-restaurant-management',
      description: 'Learn essential skills for managing successful restaurant operations, from menu design to customer service excellence.',
      startDate: 'Self-paced'
    },
    {
      title: 'Hotel Management',
      provider: 'Cornell University',
      type: 'Professional Certificate Program',
      link: 'https://www.edx.org/professional-certificate/hotel-management',
      description: 'Gain comprehensive knowledge of hotel operations, revenue management, and hospitality marketing strategies.',
      startDate: 'Self-paced'
    }
  ],
  
  // Education
  'education': [
    {
      title: 'Teaching & Learning in Higher Education',
      provider: 'Harvard University',
      type: 'Professional Certificate Program',
      link: 'https://www.edx.org/professional-certificate/teaching-learning-higher-education',
      description: 'Develop effective teaching strategies and assessment methods to improve student learning outcomes in higher education.',
      startDate: 'Self-paced'
    },
    {
      title: 'Instructional Design and Technology',
      provider: 'University of Maryland',
      type: 'Course',
      link: 'https://www.edx.org/course/instructional-design-and-technology',
      description: 'Learn to design, develop, and implement effective educational experiences using modern technology and learning theories.',
      startDate: 'Self-paced'
    }
  ],
  
  // Transportation & Logistics
  'logistics': [
    {
      title: 'Supply Chain Management',
      provider: 'MIT',
      type: 'Professional Certificate Program',
      link: 'https://www.edx.org/professional-certificate/mitx-supply-chain-management',
      description: 'Master the key aspects of supply chain management, from logistics and operations to analytics and optimization.',
      startDate: 'Self-paced'
    },
    {
      title: 'Logistics and Distribution',
      provider: 'Georgia Tech',
      type: 'Course',
      link: 'https://www.edx.org/course/logistics-and-distribution',
      description: 'Learn strategies for efficiently managing the movement and storage of goods, from transportation to warehouse management.',
      startDate: 'Self-paced'
    }
  ]
};

// Default courses to show when no specific industry match is found
export const DEFAULT_COURSES = [
  {
    title: 'Professional Communication',
    provider: 'Rochester Institute of Technology',
    type: 'Course',
    link: 'https://www.edx.org/course/professional-communication',
    description: 'Master essential business communication skills including writing, presentation, and interpersonal communication.',
    startDate: 'Self-paced'
  },
  {
    title: 'Career Development',
    provider: 'Fullbridge',
    type: 'Professional Certificate Program',
    link: 'https://www.edx.org/professional-certificate/career-development',
    description: 'Build the skills needed to advance your career, from professional networking to effective job search strategies.',
    startDate: 'Self-paced'
  }
];
