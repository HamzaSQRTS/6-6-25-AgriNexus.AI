from crewai import Agent, Task, Crew, Process
from app.db.faiss_store import faiss_store
from app.services.embeddings import embedding_service
from app.services.disease_model import disease_service
from app.core.config import settings
import openai

class AgriNexusOrchestrator:
    def __init__(self):
        self.openai_api_key = settings.OPENAI_API_KEY
        openai.api_key = self.openai_api_key

    def create_agents(self, user_query: str, context: str = ""):
        # Agent 1: Query Planner
        planner = Agent(
            role='Query Planner',
            goal='Classify the user request and decide if it needs retrieval, diagnosis, or general advice.',
            backstory='Expert in agricultural inquiry classification.',
            verbose=True,
            allow_delegation=False
        )

        # Agent 2: Retrieval Agent
        retriever = Agent(
            role='Retrieval Specialist',
            goal='Fetch relevant context from the knowledge base using vector search.',
            backstory='Expert in searching agricultural documents and research papers.',
            verbose=True
        )

        # Agent 3: Recommendation Agent
        advisor = Agent(
            role='Agricultural Advisor',
            goal='Provide detailed treatment and preventive recommendations based on context and diagnosis.',
            backstory='Senior Agronomist with 20 years of experience in crop health.',
            verbose=True
        )

        return [planner, retriever, advisor]

    async def run_workflow(self, query: str, image_bytes: bytes = None):
        """Execute the agentic workflow."""
        
        # 1. Check for image diagnosis if image is provided
        diagnosis_result = None
        if image_bytes:
            diagnosis_result = await disease_service.predict(image_bytes)

        # 2. Semantic Search for context
        query_emb = embedding_service.generate_embeddings(query)
        relevant_docs = faiss_store.search(query_emb, k=3)
        context = "\n".join([doc.get("text", "") for doc in relevant_docs])

        # 3. LLM Reasoning (Simulating the Agent interaction for simplicity in response time)
        prompt = f"""
        User Query: {query}
        Context from DB: {context}
        Image Diagnosis Result: {diagnosis_result if diagnosis_result else 'No image provided'}
        
        Act as the AgriNexus AI Advisor. Provide a structured response:
        1. Diagnosis summary (if applicable)
        2. Confidence score
        3. Detailed Recommendations
        4. Preventive measures
        5. Citations / Sources
        
        Return in JSON format:
        {{
            "diagnosis": "...",
            "confidence": "...",
            "recommendation": ["...", "..."],
            "citations": ["...", "..."]
        }}
        """

        # Call OpenAI
        try:
            response = openai.ChatCompletion.create(
                model="gpt-3.5-turbo",
                messages=[{"role": "system", "content": "You are a senior agricultural advisor."},
                          {"role": "user", "content": prompt}]
            )
            import json
            result = json.loads(response.choices[0].message.content)
            return result
        except Exception as e:
            # Fallback response
            return {
                "diagnosis": diagnosis_result["disease"] if diagnosis_result else "General Query",
                "confidence": diagnosis_result["confidence"] if diagnosis_result else 1.0,
                "recommendation": ["Keep monitoring crop health.", "Ensure proper irrigation."],
                "citations": ["Internal AgriNexus Database"]
            }

orchestrator = AgriNexusOrchestrator()
