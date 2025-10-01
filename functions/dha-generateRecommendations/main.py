import os
from google import genai
from google.genai import types
from langchain.memory import ConversationBufferMemory
from langchain.callbacks.base import BaseCallbackHandler
from langchain_google_vertexai import VertexAIEmbeddings
from langchain_google_vertexai import VectorSearchVectorStore
from langchain_google_vertexai.vectorstores.vectorstores import _BaseVertexAIVectorStore
from langchain_google_vertexai.vectorstores._sdk_manager import VectorSearchSDKManager
from langchain_google_vertexai.vectorstores._searcher import VectorSearchSearcher
from langchain_google_vertexai.vectorstores._document_storage import DocumentStorage
from typing import Any, Dict, Optional, Type, List
from langchain_core.documents import Document
from langchain_core.embeddings import Embeddings
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnableParallel, RunnablePassthrough
import pg8000
from google.cloud.sql.connector import Connector, IPTypes
import functions_framework
from flask import jsonify, request
from flask_cors import CORS

# Initialize Gemini client
client = genai.Client(
    vertexai=True,
    project="gemini-med-lit-review",
    location="us-central1",
)

model = "gemini-2.5-pro"

class VectorSearchVectorStorePostgres(_BaseVertexAIVectorStore):
    """VectorSearch with Postgres document storage."""

    @classmethod
    def from_components(
        cls: Type["VectorSearchVectorStorePostgres"],
        project_id: str,
        region: str,
        index_id: str,
        endpoint_id: str,
        pg_instance_connection_string: str,
        pg_user: str,
        pg_password: str,
        pg_db: str,
        pg_collection_name: str,
        embedding: Optional[Embeddings] = None,
        **kwargs: Dict[str, Any],
    ) -> "VectorSearchVectorStorePostgres":

        sdk_manager = VectorSearchSDKManager(
            project_id=project_id, region=region
        )

        index = sdk_manager.get_index(index_id=index_id)
        endpoint = sdk_manager.get_endpoint(endpoint_id=endpoint_id)

        document_storage = PostgresDocumentStorage(
            instance_connection_string=pg_instance_connection_string,
            user=pg_user,
            password=pg_password,
            db=pg_db,
            collection_name=pg_collection_name,
        )

        return cls(
            document_storage=document_storage,
            searcher=VectorSearchSearcher(
                endpoint=endpoint,
                index=index,
            ),
            embbedings=embedding,
        )

class PostgresDocumentStorage(DocumentStorage):
    """Stores documents in Google CloudSQL Postgres."""

    def __init__(
        self,
        instance_connection_string: str,
        user: str,
        password: str,
        db: str,
        collection_name: str
    ) -> None:
        super().__init__()
        self._collection_name = collection_name

        self._conn: pg8000.dbapi.Connection = Connector().connect(
            instance_connection_string,
            "pg8000",
            user=user,
            password=password,
            db=db,
            ip_type=IPTypes.PUBLIC,
        )

    def get_by_id(self, document_id: str) -> Document | None:
        """Gets the text of a document by its id. If not found, returns None."""
        cursor = self._conn.cursor()
        cursor.execute("SELECT id, title, abstract FROM articles WHERE id = %s", (document_id,))
        result = cursor.fetchone()
        cursor.close()

        if result is None:
            return None
 
        return Document(
            page_content=result[2],
            metadata={
                "id": result[0],
                "title": result[1]
            },
        )

    def store_by_id(self, document_id: str, document: Document):
        raise NotImplementedError()

def configure_vector_store():
    embeddings = VertexAIEmbeddings("textembedding-gecko@003")

    vector_store = VectorSearchVectorStorePostgres.from_components(
        project_id="gemini-med-lit-review",
        region="us-central1",
        index_id="1771018563230892032",
        endpoint_id=os.environ.get("VECTOR_SEARCH_ENDPOINT_ID"),
        pg_instance_connection_string=os.environ.get("PG_INSTANCE_CONNECTION_STRING"),
        pg_user=os.environ.get("PG_USER"),
        pg_password=os.environ.get("PG_PASSWORD"),
        pg_db="pubmed",
        pg_collection_name="articles",
        embedding=embeddings,
    )

    return vector_store

def generate_with_gemini(prompt: str) -> str:
    """Generate content using the new Gemini SDK."""
    generate_content_config = types.GenerateContentConfig(
        temperature=0.7,
        top_p=0.95,
        max_output_tokens=8192,
        safety_settings=[
            types.SafetySetting(
                category="HARM_CATEGORY_HATE_SPEECH",
                threshold="OFF"
            ),
            types.SafetySetting(
                category="HARM_CATEGORY_DANGEROUS_CONTENT",
                threshold="OFF"
            ),
            types.SafetySetting(
                category="HARM_CATEGORY_SEXUALLY_EXPLICIT",
                threshold="OFF"
            ),
            types.SafetySetting(
                category="HARM_CATEGORY_HARASSMENT",
                threshold="OFF"
            )
        ],
    )
    
    contents = [
        types.Content(
            role="user",
            parts=[types.Part(text=prompt)]
        )
    ]
    
    response = client.models.generate_content(
        model=model,
        contents=contents,
        config=generate_content_config,
    )
    
    return response.text

def generate_summary_for_retrieval(patient_record):
    prompt = (
        "Given the following patient record, create a concise summary of the patient's conditions and case. "
        "This summary will be used for retrieving relevant medical literature. Focus on key diagnoses, "
        f"treatments, and any unique aspects of the case.\n\nPatient Record: {patient_record}"
    )
    return generate_with_gemini(prompt)

def retrieve_documents(query):
    vector_store = configure_vector_store()
    retriever = vector_store.as_retriever(search_type="similarity", search_kwargs={"k": 15})
    docs = retriever.invoke(query)
    return [{"title": doc.metadata.get('title', 'No title'), 
             "content": doc.page_content, 
             "pmid": doc.metadata.get('id', 'No PMID')}  # Add this line
            for doc in docs]

def generate_recommendations(patient_record, retrieved_docs):
    literature_text = "\n\n".join([f"Title: {doc['title']}\nAbstract: {doc['content']}\nPMID: {doc['pmid']}" for doc in retrieved_docs])
    
    prompt = (
        "You are a medical specialist reviewing a patient case and relevant medical literature. "
        "Based on the patient's record and the provided medical abstracts, generate treatment recommendations. "
        "Include a summary of the case, a table of recommendations based on actionable events, "
        "and emphasize any treatments that could target multiple actionable events.\n\n"
        f"Patient Record: {patient_record}\n\n"
        f"Retrieved Medical Literature:\n{literature_text}\n\n"
        "Please provide your analysis and recommendations in the following format:\n"
        "1. Case Summary\n"
        "2. Recommendations Table (columns: Actionable Event, Suggested Treatment, PMID)\n"
        "3. Analysis and Discussion\n\n"
        "Be sure to include the PMID for each recommendation in the table."
    )
    
    return generate_with_gemini(prompt)

@functions_framework.http
def generate_recommendations_http(request):
    """HTTP Cloud Function for generating medical recommendations."""
    # Configure CORS
    cors = CORS(
        origins=["http://localhost:3000", "https://medical-assistant-934163632848.us-central1.run.app", "https://gemini-med-lit-review.web.app", "http://localhost:5000"],
        methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Content-Type"],
        supports_credentials=True,
        max_age=3600
    )
    
    # Handle preflight request
    if request.method == "OPTIONS":
        headers = {
            "Access-Control-Allow-Origin": request.headers.get("Origin", "*"),
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Allow-Credentials": "true",
            "Access-Control-Max-Age": "3600"
        }
        return ("", 204, headers)

    # Apply CORS to the main request
    headers = {
        "Access-Control-Allow-Origin": request.headers.get("Origin", "*"),
        "Access-Control-Allow-Credentials": "true"
    }

    # Get the patient record from the request
    request_json = request.get_json(silent=True)
    
    if not request_json or 'patientRecord' not in request_json:
        return (jsonify({'error': 'No patient record provided'}), 400, headers)

    patient_record = request_json['patientRecord']

    try:
        # Generate a summary for document retrieval
        summary = generate_summary_for_retrieval(patient_record)
        
        # Retrieve relevant documents
        retrieved_docs = retrieve_documents(summary)
        
        # Generate recommendations
        recommendations = generate_recommendations(patient_record, retrieved_docs)
        
        return (jsonify({
            'recommendations': recommendations,
            'documents': retrieved_docs[:5]  # Send only the first 5 documents
        }), 200, headers)
    except Exception as e:
        return (jsonify({'error': str(e)}), 500, headers)

# For local testing
if __name__ == "__main__":
    test_record = """
    Patient: John Doe
    Age: 45
    Diagnosis: Type 2 Diabetes
    Current HbA1c: 7.8%
    Medications: Metformin 1000mg twice daily, Gliclazide 80mg daily
    """
    summary = generate_summary_for_retrieval(test_record)
    print("Summary for retrieval:", summary)
    docs = retrieve_documents(summary)
    print("Retrieved documents:", docs)
    recommendations = generate_recommendations(test_record, docs)
    print("Recommendations:", recommendations)
