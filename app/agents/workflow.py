from typing import TypedDict, List, Dict, Any, Annotated
import operator
from langgraph.graph import StateGraph, END
from app.db.faiss_store import faiss_store
from app.services.embeddings import embedding_service
from app.config import settings
from openai import OpenAI

class AgentState(TypedDict):
    query: str
    context: List[Dict[str, Any]]
    diagnosis: str
    confidence: float
    recommendations: List[str]
    citations: List[str]

class AgriNexusAgent:
    def __init__(self):
        self.client = OpenAI(api_key=settings.OPENAI_API_KEY)

    def retrieval_node(self, state: AgentState):
        """Fetch relevant context from FAISS."""
        query_emb = embedding_service.generate_query_embedding(state["query"])
        results = faiss_store.search(query_emb, k=3)
        return {"context": results}

    def diagnosis_node(self, state: AgentState):
        """Analyze context and query to provide diagnosis."""
        context_text = "\n".join([doc.get("text", "") for doc in state["context"]])
        prompt = f"Query: {state['query']}\nContext: {context_text}\nDiagnose the crop issue."
        
        try:
            response = self.client.chat.completions.create(
                model="gpt-3.5-turbo",
                messages=[{"role": "system", "content": "You are a crop disease expert."},
                          {"role": "user", "content": prompt}]
            )
            return {"diagnosis": response.choices[0].message.content, "confidence": 0.95}
        except Exception as e:
            print(f"OpenAI Error (Diagnosis): {e}")
            return {"diagnosis": "Potential Nutrient Deficiency", "confidence": 0.70}

    def recommendation_node(self, state: AgentState):
        """Generate treatment recommendations."""
        prompt = f"Diagnosis: {state['diagnosis']}\nProvide treatment and preventive measures."
        try:
            response = self.client.chat.completions.create(
                model="gpt-3.5-turbo",
                messages=[{"role": "system", "content": "You are an agricultural advisor."},
                          {"role": "user", "content": prompt}]
            )
            recs = response.choices[0].message.content.split("\n")
            return {"recommendations": [r.strip() for r in recs if r.strip()][:5], "citations": ["AgriNexus Knowledge Base"]}
        except Exception as e:
            print(f"OpenAI Error (Recommendation): {e}")
            return {"recommendations": ["Ensure proper irrigation", "Consult local expert"], "citations": ["General Guidelines"]}

    def build_graph(self):
        """Build the LangGraph workflow."""
        workflow = StateGraph(AgentState)
        
        workflow.add_node("retrieve", self.retrieval_node)
        workflow.add_node("diagnose", self.diagnosis_node)
        workflow.add_node("recommend", self.recommendation_node)
        
        workflow.set_entry_point("retrieve")
        workflow.add_edge("retrieve", "diagnose")
        workflow.add_edge("diagnose", "recommend")
        workflow.add_edge("recommend", END)
        
        return workflow.compile()

agri_agent = AgriNexusAgent()
workflow_app = agri_agent.build_graph()
