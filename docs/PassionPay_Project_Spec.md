# PassionPay – Project Brief & Technical Specification

## 1  Project Snapshot
**Name**  PassionPay  
**Purpose**  Help users discover **high‑paying jobs** that align with their interests using Google Cloud AI embeddings + MongoDB Atlas vector search.  
**Hackathon**  AI in Action (Google Cloud × MongoDB) — June 2025  
**Host URL**  https://passionpay.vercel.app (Vercel auto‑generated sub‑domain, custom domain optional)

## 2  Goals & Success Criteria
| # | Goal | Success Metric |
|---|------|----------------|
| G1 | Align with MongoDB challenge: “Use a public dataset + AI + MongoDB vector search + Google integrations” | All mandatory tech stack elements present & functional |
| G2 | Return top 5–10 high‑salary roles semantically matched to user input | ≤ 1 sec median query latency, ≥ 90 % relevance in demo test |
| G3 | Enrich results with skills, Coursera pathways, 5‑min job‑intro YouTube clips | ≥ 3 Coursera levels per role; ≥ 1 playable YouTube video |
| G4 | Deliver polished web experience + open‑source repo + ≤ 3‑min demo video | Passed Stage‑1 viability + Stage‑2 design & tech judging |

## 3  Core User Story & Flow
“As a career explorer, I type a sentence about what I love doing and instantly see real, well‑paid jobs that match my passions, plus quick intro videos and courses to start learning.”

1. Input – User enters natural‑language interests  
2. Embedding – Backend sends text → Google Vertex AI `textembedding‑gecko` → returns 768‑D vector  
3. Vector Search – MongoDB Atlas searches `jobs.embedding` using cosine similarity → returns ranked job docs  
4. Enrichment – Server attaches Coursera course tiers & YouTube intro links  
5. UI Display – Frontend renders job cards with salary, skills, courses (dip/mid/degree), and embedded video

## 4  Data Sources & Pre‑processing
| Dataset | Purpose | Ingestion Step |
|---------|---------|---------------|
| Tech & high‑salary job descriptions (Kaggle / Levels.fyi) | Base corpus for vector search | ETL → clean → embed with Vertex AI → store in `jobs` collection |
| Coursera catalog API / curated CSV | Map jobs ↔ 3 course tiers (Dip / Cert / Degree) | Manual curation or API fetch → store in `courses` collection |
| YouTube Data API (“Day in the life + <title>”) | 5‑min intro video per role | Cron script → top result stored in `videos` sub‑doc |

## 5  MongoDB Atlas Schema
```javascript
{
  _id,
  title: String,
  description: String,
  salaryRange: String,
  skills: [String],
  embedding: [Number],
  coursera: {
    dip: { title, url },
    cert: { title, url },
    degree: { title, url }
  },
  youtube: { id, title, url, duration }
}
```
Vector index on `embedding` using cosine similarity.

## 6  System Architecture
```
[Browser] -> /api/search -> Vercel Function
              |            |-> Vertex AI (embed)
              |            |-> MongoDB Atlas Vector Search
              <- results  <-
```
Frontend: Vanilla JS (HTMX) + Tailwind  
Backend: Vercel Functions (Node) or Google Cloud Functions (Python)  
CI/CD: GitHub → Vercel

## 7  Key Google Cloud Components
| Service | Usage |
|---------|-------|
| Vertex AI Embeddings (`textembedding‑gecko`) | Generate vectors |
| Cloud Scheduler + Functions | Nightly enrichment tasks |
| Secret Manager | Store credentials |

## 8  Implementation Milestones
| Date | Milestone |
|------|-----------|
| May 20 | Repo setup, Vercel skeleton |
| May 25 | Dataset ETL & embeddings |
| May 30 | Search API live |
| Jun 05 | Enrichment automation |
| Jun 10 | Frontend polish |
| Jun 14 | Devpost assets ready |
| Jun 17 | Final submission |

## 9  Risks & Mitigations
| Risk | Mitigation |
|------|------------|
| API cost overruns | Cache embeddings, limit calls |
| Relevance quality | Tune similarity, curate data |
| Rule compliance | Use only Google Cloud AI |

## 10  Submission Checklist
- Live URL  
- Public GitHub repo  
- ≤3‑min demo video  
- Devpost description  
- AI usage compliance

Document version 0.9 – May 17 2025
